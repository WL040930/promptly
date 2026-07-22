import { useState } from 'react';
import { apiRequest } from '../../../api/client.js';

const editorClass = 'w-full rounded-xl border border-slate-200 bg-slate-950 px-3 py-3 font-mono text-[12px] leading-5 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-[#776bf2] focus:ring-2 focus:ring-[#5b4ee8]/20';

const CustomCodeInput = ({ value, sampleInput, onChange, onSampleInputChange }) => {
    const [result, setResult] = useState(null);
    const [isTesting, setIsTesting] = useState(false);
    const test = async () => {
        setIsTesting(true);
        try {
            const parsed = typeof sampleInput === 'string' ? JSON.parse(sampleInput || '{}') : sampleInput || {};
            setResult(await apiRequest('/api/nodes/custom-code/test', { method: 'POST', body: JSON.stringify({ code: value, input: parsed }) }));
        } catch (error) {
            setResult({ success: false, message: error.message });
        } finally {
            setIsTesting(false);
        }
    };
    return (
        <div className="flex flex-col gap-2.5">
            <textarea value={value || ''} onChange={event => onChange(event.target.value)} rows={10} spellCheck="false" className={editorClass} placeholder="return { total: input.amount * 1.08 };" />
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5">
                <p className="mb-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400">Sample input</p>
                <textarea value={typeof sampleInput === 'string' ? sampleInput : JSON.stringify(sampleInput || {}, null, 2)} onChange={event => onSampleInputChange(event.target.value)} rows={4} spellCheck="false" className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-mono text-[11px] text-slate-700 outline-none focus:border-[#776bf2]" />
            </div>
            <button type="button" onClick={test} disabled={isTesting || !value?.trim()} className="rounded-xl bg-[#5b4ee8] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#4e42d0] disabled:cursor-not-allowed disabled:opacity-50">{isTesting ? 'Running sandbox…' : 'Test with sample input'}</button>
            {result && <pre className={`max-h-48 overflow-auto rounded-xl border p-2.5 text-[11px] leading-4 ${result.success ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>{JSON.stringify(result.success ? { output: result.output, logs: result.logs } : { error: result.message }, null, 2)}</pre>}
            <p className="text-[10px] leading-4 text-slate-400">Sandboxed APIs: input, variables, metadata, JSON, Math, Date, and console. Network, files, imports, secrets, and child processes are blocked.</p>
        </div>
    );
};

export default CustomCodeInput;
