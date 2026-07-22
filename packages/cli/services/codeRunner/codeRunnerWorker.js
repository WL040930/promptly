import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const MAX_OUTPUT_BYTES = 1024 * 1024;
const send = payload => process.stdout.write(`${JSON.stringify(payload)}\n`);

try {
    const request = JSON.parse(readFileSync(0, 'utf8'));
    const logs = [];
    const consoleProxy = Object.freeze(Object.fromEntries(['log', 'info', 'warn', 'error'].map(level => [
        level,
        (...args) => {
            if (logs.length >= 100) return;
            logs.push({
                level,
                message: args.map(value => typeof value === 'string' ? value : JSON.stringify(value)).join(' ').slice(0, 400)
            });
        }
    ])));
    const sandbox = {
        input: structuredClone(request.input ?? {}),
        variables: structuredClone(request.variables ?? {}),
        metadata: structuredClone(request.metadata ?? {}),
        console: consoleProxy,
        JSON,
        Math,
        Date,
        Array,
        Object,
        String,
        Number,
        Boolean,
        RegExp,
        Promise
    };
    const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
    const script = new vm.Script(`(async () => {\n${request.code}\n})()`, { filename: 'custom-code.js' });
    const value = await script.runInContext(context, { timeout: 3000 });
    const output = value === undefined ? null : value;
    if (Buffer.byteLength(JSON.stringify(output), 'utf8') > MAX_OUTPUT_BYTES) throw new Error('Custom JavaScript output is too large.');
    send({ ok: true, output, logs });
} catch (error) {
    send({ ok: false, error: error?.message || 'Custom JavaScript failed.' });
    process.exitCode = 1;
}
