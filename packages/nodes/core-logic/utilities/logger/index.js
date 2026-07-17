import { BaseNode } from '../../../BaseNode.js';

const REDACTED_KEY = /(authorization|token|password|secret|api[_-]?key|refresh)/i;
const MAX_DEPTH = 4;
const MAX_ENTRIES = 50;
const MAX_STRING_LENGTH = 500;

const redact = (value, depth = 0) => {
    if (depth > MAX_DEPTH) return '[depth-limited]';
    if (typeof value === 'string') return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...` : value;
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.slice(0, MAX_ENTRIES).map(item => redact(item, depth + 1));
    return Object.fromEntries(Object.entries(value).slice(0, MAX_ENTRIES).map(([key, item]) => [
        key,
        REDACTED_KEY.test(key) ? '[redacted]' : redact(item, depth + 1)
    ]));
};

export default class LoggerNode extends BaseNode {
    async execute(context) {
        const config = this.getResolvedConfig(context);
        const level = config.logLevel || 'info';
        const message = String(config.logMessage || 'No message provided');
        if (!['info', 'warn', 'error'].includes(level)) {
            return { success: false, errorCode: 'LOGGER_FAILED', error: `Unsupported log level "${level}".` };
        }

        const entry = {
            level,
            message,
            nodeId: this.id,
            loggedAt: new Date().toISOString(),
            context: config.includeContext === true || config.includeContext === 'true' ? redact(context) : null
        };
        const write = console[level] || console.log;
        write(`[Workflow Logger] ${message}`, entry.context || '');

        return {
            success: true,
            outputData: { loggedAt: entry.loggedAt, level, message },
            loggedAt: entry.loggedAt,
            logEntry: entry
        };
    }
}

export { redact };
