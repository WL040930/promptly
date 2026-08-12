import { createHash } from 'node:crypto';
import { getGoogleClientForUser } from '../triggers/googleTriggerClient.js';

const SHEETS_MIME_TYPE = 'application/vnd.google-apps.spreadsheet';
const GOOGLE_CONNECTION_ACTION = Object.freeze({ label: 'Reconnect Google', href: '/app/settings/connections' });
const MAX_TITLE_LENGTH = 180;
export const DEFAULT_GOOGLE_REQUEST_TIMEOUT_MS = 30_000;
export const DEFAULT_GOOGLE_SHEET_READY_ATTEMPTS = 5;
export const DEFAULT_GOOGLE_SHEET_READY_RETRY_DELAY_MS = 250;
export const DEFAULT_GOOGLE_PROVISIONING_RECONCILE_ATTEMPTS = 5;

export class GoogleSpreadsheetError extends Error {
    constructor(message, { code = 'GOOGLE_SPREADSHEET_FAILED', status = 502, action = null, providerStatus = null, providerReason = null } = {}) {
        super(message);
        this.name = 'GoogleSpreadsheetError';
        this.code = code;
        this.status = status;
        this.action = action;
        this.providerStatus = providerStatus;
        this.providerReason = providerReason;
    }
}

const cleanTitle = (value, fallback) => {
    const title = String(value || '').trim().replace(/[\r\n]+/g, ' ');
    if (!title) return fallback;
    return title.slice(0, MAX_TITLE_LENGTH);
};

const driveQueryValue = value => String(value || '').replaceAll("'", "\\'");
const providerStatus = error => Number(error?.response?.status || error?.code || 0);
const providerReason = error => error?.response?.data?.error?.errors?.[0]?.reason
    || error?.response?.data?.error?.status
    || null;

const provisioningKeyHash = key => createHash('sha256').update(String(key)).digest('hex').slice(0, 16);

const stagingTitle = (title, key) => {
    const suffix = ` · Promptly ${provisioningKeyHash(key)}`;
    return `${String(title).slice(0, Math.max(1, MAX_TITLE_LENGTH - suffix.length))}${suffix}`;
};

const logProvisioning = (event, details = {}) => console.warn('[GoogleSpreadsheet]', {
    event,
    ...details
});

const request = async (client, options, message, { timeoutMs = DEFAULT_GOOGLE_REQUEST_TIMEOUT_MS, operation = 'updating the spreadsheet' } = {}) => {
    const controller = new AbortController();
    const delayMs = Math.max(1, Number(timeoutMs) || DEFAULT_GOOGLE_REQUEST_TIMEOUT_MS);
    let timedOut = false;
    let timer;
    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
            const error = new Error('Google request timed out.');
            error.code = 'GOOGLE_PROVIDER_TIMEOUT';
            reject(error);
        }, delayMs);
    });
    timer.unref?.();
    try {
        return await Promise.race([
            client.request({ ...options, signal: options.signal || controller.signal }),
            timeoutPromise
        ]);
    } catch (error) {
        const status = providerStatus(error);
        const reason = providerReason(error);
        const timeout = timedOut
            || controller.signal.aborted
            || error?.code === 'GOOGLE_PROVIDER_TIMEOUT'
            || error?.name === 'AbortError'
            || ['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ECONNABORTED'].includes(String(error?.code || '').toUpperCase());
        if (timeout) {
            throw new GoogleSpreadsheetError(`Google took too long to respond while ${operation}. Try again.`, {
                code: 'GOOGLE_PROVIDER_TIMEOUT', status: 504, providerStatus: status || null, providerReason: reason
            });
        }
        if (status === 401) {
            throw new GoogleSpreadsheetError(`Google session expired while ${operation}. Reconnect Google to continue.`, {
                code: 'GOOGLE_RECONNECT_REQUIRED', status: 409, action: GOOGLE_CONNECTION_ACTION, providerStatus: status, providerReason: reason
            });
        }
        if (status === 403) {
            throw new GoogleSpreadsheetError(`Google denied access while ${operation}. Check the Google Sheets permission and try again.`, {
                code: 'GOOGLE_PERMISSION_REQUIRED', status: 409, action: GOOGLE_CONNECTION_ACTION, providerStatus: status, providerReason: reason
            });
        }
        if (status === 404) {
            throw new GoogleSpreadsheetError(`Google could not find the spreadsheet while ${operation}. Recreate the proposal and try again.`, {
                code: 'GOOGLE_SPREADSHEET_NOT_FOUND', status: 409, providerStatus: status, providerReason: reason
            });
        }
        throw new GoogleSpreadsheetError(message || 'Google Sheets could not be updated. Try again.', {
            status: status || 502,
            providerStatus: status || null,
            providerReason: reason
        });
    }
    finally {
        clearTimeout(timer);
    }
};

const clientFor = async (getGoogleClient, userId) => {
    try {
        return await getGoogleClient(userId);
    } catch {
        throw new GoogleSpreadsheetError('Connect Google before creating a spreadsheet.', {
            code: 'GOOGLE_CONNECTION_REQUIRED', status: 409, action: { ...GOOGLE_CONNECTION_ACTION, label: 'Connect Google' }
        });
    }
};

const headerRow = headers => (Array.isArray(headers) ? headers : [])
    .map(header => String(header || '').trim())
    .filter(Boolean)
    .slice(0, 100);

const wait = delayMs => new Promise(resolve => setTimeout(resolve, delayMs));
const retryableFreshSpreadsheetError = error => ['GOOGLE_PERMISSION_REQUIRED', 'GOOGLE_SPREADSHEET_NOT_FOUND'].includes(error?.code);

const withFreshSpreadsheetRetry = async (operation, {
    attempts = DEFAULT_GOOGLE_SHEET_READY_ATTEMPTS,
    retryDelayMs = DEFAULT_GOOGLE_SHEET_READY_RETRY_DELAY_MS,
    waitForRetry = wait
} = {}) => {
    const maxAttempts = Math.min(Math.max(Number(attempts) || 1, 1), 8);
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            if (attempt === maxAttempts || !retryableFreshSpreadsheetError(error)) throw error;
            await waitForRetry(Math.min((Number(retryDelayMs) || DEFAULT_GOOGLE_SHEET_READY_RETRY_DELAY_MS) * (2 ** (attempt - 1)), 2_000));
        }
    }
};

const provisioningLookup = ({ key, title }) => {
    const query = new URLSearchParams({
        q: `(appProperties has { key='promptlyProvisioningKey' and value='${driveQueryValue(key)}' } or name = '${driveQueryValue(title)}') and trashed=false`,
        fields: 'files(id,name,webViewLink,createdTime)',
        orderBy: 'createdTime asc',
        pageSize: '10'
    });
    return `https://www.googleapis.com/drive/v3/files?${query.toString()}`;
};

const unresolvedCreateError = error => {
    if (error?.code === 'GOOGLE_PROVIDER_TIMEOUT' || error?.code === 'GOOGLE_SPREADSHEET_FAILED') {
        return new GoogleSpreadsheetError('Google did not confirm whether the spreadsheet was created. Wait a moment, then retry Apply safely.', {
            code: 'GOOGLE_PROVISIONING_UNCERTAIN',
            status: 409,
            providerStatus: error.providerStatus || null,
            providerReason: error.providerReason || null
        });
    }
    return error;
};

/**
 * Owns Google Sheet provisioning at the external-service seam.  The caller
 * supplies a durable key; a retry looks up the app-created Drive file before
 * creating anything, so an interrupted proposal apply never makes duplicates.
 */
export const createGoogleSpreadsheetService = ({
    getGoogleClient = getGoogleClientForUser,
    requestTimeoutMs = DEFAULT_GOOGLE_REQUEST_TIMEOUT_MS,
    sheetReadyAttempts = DEFAULT_GOOGLE_SHEET_READY_ATTEMPTS,
    sheetReadyRetryDelayMs = DEFAULT_GOOGLE_SHEET_READY_RETRY_DELAY_MS,
    provisioningReconcileAttempts = DEFAULT_GOOGLE_PROVISIONING_RECONCILE_ATTEMPTS,
    waitForRetry = wait
} = {}) => ({
    async createAndInitialize({
        userId,
        title,
        sheetTitle = 'Responses',
        headers = [],
        provisioningKey,
        folderId = null,
        existingSpreadsheetId = null,
        onFileReady = null
    } = {}) {
        if (!userId) throw new GoogleSpreadsheetError('Authentication is required.', { code: 'AUTH_REQUIRED', status: 401 });
        if (!provisioningKey) throw new GoogleSpreadsheetError('A spreadsheet provisioning key is required.', { code: 'GOOGLE_PROVISIONING_KEY_REQUIRED', status: 400 });
        const { client } = await clientFor(getGoogleClient, userId);
        const safeTitle = cleanTitle(title, 'Promptly responses');
        const safeSheetTitle = cleanTitle(sheetTitle, 'Responses');
        const key = String(provisioningKey).slice(0, 240);
        const stagedTitle = stagingTitle(safeTitle, key);
        const keyHash = provisioningKeyHash(key);
        const findProvisionedFile = async () => {
            const existing = await request(client, {
                url: provisioningLookup({ key, title: stagedTitle }), method: 'GET'
            }, 'Google Drive could not check an existing spreadsheet.', { timeoutMs: requestTimeoutMs, operation: 'checking the existing spreadsheet' });
            const files = (existing.data?.files || []).filter(file => file?.id);
            if (files.length > 1) {
                logProvisioning('reconciliation_multiple_matches', { provisioningKeyHash: keyHash, fileCount: files.length });
            }
            return files[0] || null;
        };
        const reconcileCreate = async createError => {
            const maxAttempts = Math.min(Math.max(Number(provisioningReconcileAttempts) || 1, 1), 8);
            for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
                try {
                    const recovered = await findProvisionedFile();
                    if (recovered) {
                        logProvisioning('reconciliation_recovered', {
                            provisioningKeyHash: keyHash,
                            attempt,
                            providerStatus: createError?.providerStatus || null,
                            providerReason: createError?.providerReason || null
                        });
                        return recovered;
                    }
                } catch (lookupError) {
                    logProvisioning('reconciliation_lookup_failed', {
                        provisioningKeyHash: keyHash,
                        attempt,
                        providerStatus: lookupError?.providerStatus || null,
                        providerReason: lookupError?.providerReason || null
                    });
                    return null;
                }
                if (attempt < maxAttempts) {
                    await waitForRetry(Math.min((Number(sheetReadyRetryDelayMs) || DEFAULT_GOOGLE_SHEET_READY_RETRY_DELAY_MS) * (2 ** (attempt - 1)), 2_000));
                }
            }
            logProvisioning('reconciliation_exhausted', {
                provisioningKeyHash: keyHash,
                providerStatus: createError?.providerStatus || null,
                providerReason: createError?.providerReason || null
            });
            return null;
        };
        let file = existingSpreadsheetId
            ? { id: String(existingSpreadsheetId), name: safeTitle }
            : null;
        let needsReadyRetry = false;
        if (!file) {
            file = await findProvisionedFile();
            needsReadyRetry = Boolean(file);
        }
        if (!file) {
            try {
                const created = await request(client, {
                    url: 'https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink',
                    method: 'POST',
                    // A Drive create is non-idempotent. OAuth expiry is refreshed
                    // before this point, and Gaxios must never replay this write.
                    retry: false,
                    data: {
                        name: stagedTitle,
                        mimeType: SHEETS_MIME_TYPE,
                        appProperties: { promptlyProvisioningKey: key },
                        ...(folderId ? { parents: [String(folderId)] } : {})
                    }
                }, 'Google Drive could not create the spreadsheet.', { timeoutMs: requestTimeoutMs, operation: 'creating the spreadsheet' });
                file = created.data;
                needsReadyRetry = true;
            } catch (createError) {
                logProvisioning('create_response_ambiguous', {
                    provisioningKeyHash: keyHash,
                    providerStatus: createError?.providerStatus || null,
                    providerReason: createError?.providerReason || null
                });
                file = await reconcileCreate(createError);
                if (!file) throw unresolvedCreateError(createError);
                needsReadyRetry = true;
            }
        }
        if (!file?.id) throw new GoogleSpreadsheetError('Google Drive did not return the new spreadsheet ID.');

        const provisionalResource = {
            id: file.id,
            name: safeTitle,
            sheetTitle: safeSheetTitle,
            range: `'${safeSheetTitle.replaceAll("'", "''")}'!A1`,
            webViewLink: file.webViewLink || `https://docs.google.com/spreadsheets/d/${file.id}`
        };
        await onFileReady?.(provisionalResource);

        const sheetRequest = (options, message, operation) => {
            const execute = () => request(client, options, message, { timeoutMs: requestTimeoutMs, operation });
            if (!needsReadyRetry) return execute();
            return withFreshSpreadsheetRetry(execute, {
                attempts: sheetReadyAttempts,
                retryDelayMs: sheetReadyRetryDelayMs,
                waitForRetry
            });
        };

        const metadata = await sheetRequest({
            url: `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(file.id)}?fields=sheets.properties(sheetId,title)`, method: 'GET'
        }, 'Google Sheets could not prepare the spreadsheet.', 'preparing the spreadsheet');
        const firstSheet = metadata.data?.sheets?.[0]?.properties;
        if (!firstSheet?.sheetId && firstSheet?.sheetId !== 0) throw new GoogleSpreadsheetError('The new spreadsheet has no writable sheet.');
        await sheetRequest({
            url: `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(file.id)}:batchUpdate`,
            method: 'POST',
            data: { requests: [{ updateSheetProperties: { properties: { sheetId: firstSheet.sheetId, title: safeSheetTitle }, fields: 'title' } }] }
        }, 'Google Sheets could not prepare the destination tab.', 'preparing the destination tab');
        const values = headerRow(headers);
        if (values.length) {
            await sheetRequest({
                url: `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(file.id)}/values/${encodeURIComponent(`'${safeSheetTitle.replaceAll("'", "''")}'!A1`)}?valueInputOption=RAW`,
                method: 'PUT', data: { range: `'${safeSheetTitle.replaceAll("'", "''")}'!A1`, majorDimension: 'ROWS', values: [values] }
            }, 'Google Sheets could not write the response columns.', 'writing the response columns');
        }
        // The tab and headers are authoritative for workflow execution. Drive
        // naming is cosmetic, so a provider rejection here must not roll back
        // an otherwise ready spreadsheet or leave the proposal retrying.
        try {
            const renamed = await request(client, {
                url: `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?fields=id,name,webViewLink`,
                method: 'PATCH',
                data: { name: safeTitle }
            }, 'Google Drive could not finalize the spreadsheet name.', { timeoutMs: requestTimeoutMs, operation: 'naming the spreadsheet' });
            file = { ...file, ...(renamed.data || {}) };
        } catch (renameError) {
            logProvisioning('name_finalize_failed', {
                provisioningKeyHash: keyHash,
                providerStatus: renameError?.providerStatus || null,
                providerReason: renameError?.providerReason || null
            });
        }
        return { ...provisionalResource, webViewLink: file.webViewLink || provisionalResource.webViewLink };
    }
});

export default createGoogleSpreadsheetService();
