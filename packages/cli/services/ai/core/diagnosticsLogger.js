import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDirectory = path.resolve(__dirname, '../../../../../logs');
const diagnosticsDirectory = process.env.AI_DIAGNOSTICS_DIR
    ? path.resolve(process.env.AI_DIAGNOSTICS_DIR)
    : defaultDirectory;
const diagnosticsFile = path.join(diagnosticsDirectory, 'ai.jsonl');
const includeRawOutput = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.AI_DIAGNOSTICS_INCLUDE_RAW || '').trim().toLowerCase()
);

let writeQueue = Promise.resolve();

export const describeAiOutput = value => {
    if (value === null) return { type: 'null' };
    if (Array.isArray(value)) return { type: 'array', length: value.length };
    if (typeof value === 'object') return {
        type: 'object',
        keys: Object.keys(value).slice(0, 30),
        hasPatchesArray: Array.isArray(value.patches)
    };
    return { type: typeof value };
};

const writeDiagnostic = async ({ directory = diagnosticsDirectory, event = {} } = {}) => {
    await fs.mkdir(directory, { recursive: true });
    await fs.appendFile(path.join(directory, 'ai.jsonl'), `${JSON.stringify({
        timestamp: new Date().toISOString(),
        ...event
    })}\n`, 'utf8');
};

export const recordAiDiagnostic = event => {
    writeQueue = writeQueue
        .catch(() => undefined)
        .then(() => writeDiagnostic({ event }));
    return writeQueue.catch(() => undefined);
};

export const aiDiagnosticsPath = diagnosticsFile;
export const rawOutputPreview = value => {
    if (!includeRawOutput || typeof value !== 'string') return undefined;
    return value.length > 2000 ? `${value.slice(0, 2000)}...[truncated]` : value;
};
