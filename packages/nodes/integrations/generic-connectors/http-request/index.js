import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { BaseNode } from '../../../BaseNode.js';

const MAX_RESPONSE_BYTES = 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_TIMEOUT_MS = 60000;
const MAX_RETRIES = 3;

const parseJsonConfig = (value, fieldName) => {
    if (value === undefined || value === null || value === '') return {};
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        throw new Error(`HTTP Request ${fieldName} must be valid JSON.`);
    }
};

const ipv4Number = address => address.split('.').reduce((value, part) => (value * 256) + Number(part), 0);

export const isPrivateAddress = address => {
    const version = isIP(address);
    if (version === 4) {
        const value = ipv4Number(address);
        const first = value >>> 24;
        const second = (value >>> 16) & 255;
        return first === 0 || first === 10 || first === 127 ||
            (first === 100 && second >= 64 && second <= 127) ||
            (first === 169 && second === 254) ||
            (first === 172 && second >= 16 && second <= 31) ||
            (first === 192 && second === 168) ||
            (first === 192 && second === 0) ||
            (first === 198 && (second === 18 || second === 19)) ||
            (first === 198 && second === 51) ||
            (first === 203 && second === 0) ||
            first >= 224;
    }

    if (version === 6) {
        const normalized = address.toLowerCase();
        if (normalized.startsWith('::ffff:')) return isPrivateAddress(normalized.slice(7));
        return normalized === '::' || normalized === '::1' ||
            normalized.startsWith('fc') || normalized.startsWith('fd') ||
            normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
            normalized.startsWith('fea') || normalized.startsWith('feb') ||
            normalized.startsWith('ff');
    }
    return true;
};

export const assertPublicUrl = async parsedUrl => {
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('HTTP Request node only supports http and https URLs.');
    }
    if (parsedUrl.username || parsedUrl.password) throw new Error('HTTP Request URLs cannot contain credentials.');

    const hostname = parsedUrl.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
        throw new Error('HTTP Request cannot access local network hosts.');
    }

    const addresses = isIP(hostname) ? [{ address: hostname }] : await lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
        throw new Error('HTTP Request cannot access private or non-public network addresses.');
    }
};

const buildHeaders = (headers, authentication, authToken, idempotencyKey) => {
    const result = { ...headers };
    if (!['none', 'bearer', 'apikey', 'basic'].includes(authentication)) {
        throw new Error(`Unsupported HTTP authentication mode "${authentication}".`);
    }
    if (authentication !== 'none' && !authToken) throw new Error('HTTP authentication requires a token or credential.');
    if (authentication === 'bearer') result.Authorization = `Bearer ${authToken}`;
    if (authentication === 'apikey') result['X-API-Key'] = authToken;
    if (authentication === 'basic') result.Authorization = `Basic ${Buffer.from(authToken).toString('base64')}`;
    if (idempotencyKey && !result['Idempotency-Key'] && !result['idempotency-key']) result['Idempotency-Key'] = idempotencyKey;
    return result;
};

const readResponseBody = async response => {
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_RESPONSE_BYTES) throw new Error('HTTP response exceeds the 1 MB limit.');

    let text = '';
    if (response.body?.getReader) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let totalBytes = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            totalBytes += value.byteLength;
            if (totalBytes > MAX_RESPONSE_BYTES) {
                await reader.cancel();
                throw new Error('HTTP response exceeds the 1 MB limit.');
            }
            text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
    } else {
        text = await response.text();
        if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('HTTP response exceeds the 1 MB limit.');
    }
    if (!text) return null;

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        try { return JSON.parse(text); } catch { return text; }
    }
    return text;
};

export const isRetryableStatus = status => status === 408 || status === 425 || status === 429 || status >= 500;

const canRetryMethod = (method, idempotencyKey) => (
    ['GET', 'HEAD', 'PUT', 'DELETE', 'OPTIONS'].includes(method) || Boolean(idempotencyKey)
);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const retryDelay = (response, attempt) => {
    const retryAfter = Number(response?.headers?.get('retry-after'));
    return Number.isFinite(retryAfter) && retryAfter >= 0
        ? Math.min(retryAfter * 1000, 10000)
        : Math.min(250 * (2 ** attempt), 5000);
};

export default class HTTPRequestNode extends BaseNode {
    async execute(context) {
        const config = this.getResolvedConfig(context);
        const method = String(config.method || 'GET').toUpperCase();
        const url = String(config.url || '').trim();
        if (!url) throw new Error('HTTP Request node requires a URL.');

        let parsedUrl;
        try { parsedUrl = new URL(url); } catch { throw new Error('HTTP Request node URL is invalid.'); }
        await assertPublicUrl(parsedUrl);

        const idempotencyKey = context.metadata?.idempotencyKey;
        const headers = buildHeaders(
            parseJsonConfig(config.headers, 'headers'),
            config.authentication || 'none',
            config.authToken,
            idempotencyKey
        );
        const hasBody = !['GET', 'HEAD'].includes(method) && config.body !== undefined && config.body !== '';
        let body;
        if (hasBody) {
            body = typeof config.body === 'string' ? config.body : JSON.stringify(config.body);
            if (!headers['Content-Type'] && !headers['content-type']) headers['Content-Type'] = 'application/json';
        }

        const timeoutMs = Math.min(Math.max(Number(config.timeout) || DEFAULT_TIMEOUT_MS, 100), MAX_TIMEOUT_MS);
        const retries = Math.min(Math.max(Number(config.maxRetries ?? 2), 0), MAX_RETRIES);
        const retryAllowed = canRetryMethod(method, idempotencyKey);
        let attempts = 0;
        let response;

        while (true) {
            attempts += 1;
            try {
                response = await fetch(parsedUrl, {
                    method,
                    headers,
                    body,
                    redirect: 'manual',
                    signal: AbortSignal.timeout(timeoutMs)
                });
            } catch (error) {
                if (!retryAllowed || attempts > retries) throw new Error(`HTTP request failed: ${error.message}`);
                await sleep(Math.min(250 * (2 ** (attempts - 1)), 5000));
                continue;
            }

            if (response.status >= 300 && response.status < 400) {
                return {
                    success: false,
                    ok: false,
                    statusCode: response.status,
                    headers: Object.fromEntries(response.headers.entries()),
                    body: null,
                    attempts,
                    errorCode: 'HTTP_REDIRECT_BLOCKED',
                    error: 'HTTP redirects are blocked for security. Use the final URL directly.'
                };
            }
            if (!response.ok && isRetryableStatus(response.status) && retryAllowed && attempts <= retries) {
                await sleep(retryDelay(response, attempts - 1));
                continue;
            }
            break;
        }

        const responseBody = await readResponseBody(response);
        const responseHeaders = Object.fromEntries(response.headers.entries());
        return {
            success: response.ok,
            ok: response.ok,
            statusCode: response.status,
            headers: responseHeaders,
            body: responseBody,
            attempts,
            errorCode: response.ok ? null : 'HTTP_RESPONSE_FAILED',
            error: response.ok ? null : `HTTP request failed with status ${response.status}.`
        };
    }
}
