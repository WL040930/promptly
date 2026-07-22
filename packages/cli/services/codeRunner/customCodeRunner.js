import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const workerPath = path.join(directory, 'codeRunnerWorker.js');
const MAX_TIMEOUT_MS = 3000;
const MAX_INPUT_BYTES = 512 * 1024;
const FORBIDDEN = /\b(?:require|import|process|globalThis|global|module|exports|eval|Function|fetch|XMLHttpRequest|WebAssembly|Buffer|fs|child_process|net|http|https)\b/;

const jsonBytes = value => Buffer.byteLength(JSON.stringify(value ?? null), 'utf8');

const validateRequest = ({ code, input, variables, metadata }) => {
    if (typeof code !== 'string' || !code.trim()) throw new Error('Custom JavaScript is required.');
    if (code.length > 50_000) throw new Error('Custom JavaScript must be 50,000 characters or fewer.');
    if (FORBIDDEN.test(code)) throw new Error('Custom JavaScript contains a restricted global or API.');
    if (jsonBytes({ input, variables, metadata }) > MAX_INPUT_BYTES) throw new Error('Custom JavaScript input is too large.');
};

export const runCustomCode = ({ code, input = {}, variables = {}, metadata = {}, timeoutMs = 1000 } = {}) => {
    validateRequest({ code, input, variables, metadata });
    const boundedTimeout = Math.min(Math.max(Number(timeoutMs) || 1000, 100), MAX_TIMEOUT_MS);
    const payload = JSON.stringify({ code, input, variables, metadata });

    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [
            '--permission',
            `--allow-fs-read=${directory}`,
            workerPath
        ], {
            cwd: directory,
            env: { NODE_ENV: 'production' },
            stdio: ['pipe', 'pipe', 'pipe']
        });
        let stdout = '';
        let stderr = '';
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            child.kill('SIGKILL');
            reject(new Error(`Custom JavaScript exceeded the ${boundedTimeout}ms timeout.`));
        }, boundedTimeout + 250);

        child.stdout.on('data', chunk => { stdout += chunk.toString(); });
        child.stderr.on('data', chunk => { stderr += chunk.toString(); });
        child.on('error', error => {
            clearTimeout(timer);
            if (!settled) {
                settled = true;
                reject(new Error(`Custom JavaScript sandbox could not start: ${error.message}`));
            }
        });
        child.on('close', exitCode => {
            clearTimeout(timer);
            if (settled) return;
            settled = true;
            if (exitCode !== 0 && !stdout.trim()) {
                reject(new Error(stderr.trim() || 'Custom JavaScript sandbox failed.'));
                return;
            }
            try {
                const result = JSON.parse(stdout);
                if (!result.ok) reject(new Error(result.error || 'Custom JavaScript failed.'));
                else resolve({ output: result.output, logs: result.logs || [] });
            } catch {
                reject(new Error('Custom JavaScript sandbox returned an invalid result.'));
            }
        });
        child.stdin.end(payload);
    });
};

export const validateCustomCode = ({ code } = {}) => {
    try {
        validateRequest({ code, input: {}, variables: {}, metadata: {} });
        return { valid: true, error: null };
    } catch (error) {
        return { valid: false, error: error.message };
    }
};
