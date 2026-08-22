import { useState, useEffect, useMemo } from 'react';
import { useFormEngine } from '../../../forms/engine/useFormEngine.js';
import FieldRenderer from '../../../forms/preview/FieldRenderer.jsx';
import Button from '../../../components/ui/Button.jsx';
import { WORKFLOW_MODAL_LAYERS } from '../../modalLayers.js';
import { useWorkflowForms } from '../../hooks/useWorkflowForms.js';

const STORAGE_KEY = (id) => `promptly-test-payload-${id}`;

const storage = {
    load: (id) => { try { const r = localStorage.getItem(STORAGE_KEY(id)); return r ? JSON.parse(r) : null; } catch { return null; } },
    save: (id, v) => { try { localStorage.setItem(STORAGE_KEY(id), JSON.stringify(v)); } catch {} },
    clear: (id) => { try { localStorage.removeItem(STORAGE_KEY(id)); } catch {} },
};

function detectTrigger(nodes) {
    // Find the trigger node by its type, regardless of position in the array
    const trigger = nodes?.find(n => n.type === 'trigger');
    if (!trigger) return { type: 'unknown' };
    const s = (trigger.subType || '').toLowerCase();
    if (s.includes('form')) return { type: 'form', node: trigger };
    if (s.includes('webhook')) return { type: 'webhook', node: trigger };
    if (s.includes('schedule') || s.includes('cron')) return { type: 'schedule', node: trigger };
    return { type: 'unknown', node: trigger };
}

const EMPTY_ROW = { key: '', value: '' };
const EMPTY_JSON = '{\n  \n}';

const TRIGGER_META = {
    form:     { label: 'Form Submission', color: 'bg-violet-100 text-violet-700 border-violet-200' },
    webhook:  { label: 'Webhook',         color: 'bg-amber-100 text-amber-700 border-amber-200'   },
    schedule: { label: 'Schedule',        color: 'bg-blue-100 text-blue-700 border-blue-200'       },
    unknown:  { label: 'Manual',          color: 'bg-slate-100 text-slate-600 border-slate-200'   },
};

function KeyValueEditor({ rows, onChange }) {
    const updateRow = (i, field, val) => {
        const next = rows.map((r, idx) => idx === i ? { ...r, [field]: val } : r);
        if (i === rows.length - 1 && (next[i].key || next[i].value)) next.push(EMPTY_ROW);
        onChange(next);
    };
    const removeRow = (i) => onChange(rows.filter((_, idx) => idx !== i).length ? rows.filter((_, idx) => idx !== i) : [EMPTY_ROW]);

    return (
        <div className="flex flex-col gap-2">
            <div className="grid grid-cols-[1fr_1fr_28px] gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 px-1 mb-1">
                <span>Key</span><span>Value</span><span />
            </div>
            {rows.map((row, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_28px] gap-2 items-center">
                    <input value={row.key} placeholder="key" onChange={e => updateRow(i, 'key', e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-lg text-slate-800 px-2.5 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all font-mono" />
                    <input value={row.value} placeholder="value" onChange={e => updateRow(i, 'value', e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-lg text-slate-800 px-2.5 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all" />
                    <button onClick={() => removeRow(i)} className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                </div>
            ))}
            <button onClick={() => onChange([...rows, EMPTY_ROW])} className="flex items-center gap-1.5 text-xs text-indigo-500 hover:text-indigo-700 font-medium mt-1 w-fit">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                Add row
            </button>
        </div>
    );
}

function RawJsonEditor({ value, onChange, error }) {
    return (
        <div>
            <textarea value={value} spellCheck={false} onChange={e => onChange(e.target.value)}
                className={`w-full h-52 bg-slate-900 text-emerald-400 font-mono text-sm p-3 rounded-xl border outline-none focus:ring-2 focus:ring-indigo-500/50 transition-shadow resize-none ${error ? 'border-red-500' : 'border-slate-800'}`} />
            {error && <p className="text-xs text-red-500 mt-1.5 font-medium">{error}</p>}
        </div>
    );
}

function FormFillMode({ form, savedValues, onSubmit, isSubmitting, isProduction = false }) {
    const engine = useFormEngine(form, onSubmit, null);
    const { values, errors, currentPage, pages, progress, handleChange, handleNextPage, handleBackPage, handleFinalSubmit } = engine;

    useEffect(() => {
        if (savedValues && typeof savedValues === 'object') {
            Object.entries(savedValues).forEach(([id, val]) => handleChange(id, val));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const accentColor = form?.settings?.accentColor || '#4f46e5';
    const isLastPage = currentPage === pages.length - 1;

    return (
        <div className="flex flex-col gap-4">
            <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full transition-all duration-500 rounded-full" style={{ width: `${progress}%`, backgroundColor: accentColor }} />
            </div>

            <div className="flex items-center justify-between">
                <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Simulating form</p>
                    <h3 className="text-sm font-bold text-slate-800 mt-0.5">{form?.title}</h3>
                </div>
                {pages.length > 1 && (
                    <span className="text-xs font-bold text-slate-400">Page {currentPage + 1} / {pages.length}</span>
                )}
            </div>

            <div className="flex flex-col gap-6 py-1">
                {(pages[currentPage] || []).map(field => (
                    <div key={field.id}>
                        <FieldRenderer field={field} formId={form?.id} accentColor={accentColor} value={values[field.id]} onChange={val => handleChange(field.id, val)} />
                        {errors[field.id] && (
                            <p className="text-xs text-red-500 mt-1.5 font-medium flex items-center gap-1">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                {errors[field.id]}
                            </p>
                        )}
                    </div>
                ))}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-2">
                <div>
                    {currentPage > 0 && (
                        <button onClick={handleBackPage} className="text-sm font-semibold text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                            ← Back
                        </button>
                    )}
                </div>
                <Button variant={isProduction && isLastPage ? 'dangerSolid' : 'primary'} onClick={isLastPage ? handleFinalSubmit : handleNextPage} isLoading={isLastPage && isSubmitting} loadingText="Running…">
                    {isLastPage ? (isProduction ? 'Run live now' : 'Run Test') : 'Next →'}
                </Button>
            </div>
        </div>
    );
}

const TestRunModal = ({ isOpen, onClose, onConfirm, isLoading, workflowId, nodes, runType = 'test' }) => {
    const isProduction = runType === 'production';
    const trigger = useMemo(() => detectTrigger(nodes), [nodes]);
    const { formsById, isLoading: isLoadingLinkedForms } = useWorkflowForms(nodes);
    const linkedForm = useMemo(() => {
        if (trigger.type !== 'form') return null;
        const formId = trigger.node?.config?.formId;
        return formId ? formsById[formId] || null : null;
    }, [formsById, trigger]);

    const [activeTab, setActiveTab] = useState(trigger.type === 'form' ? 'form' : 'kv');
    const [kvRows, setKvRows] = useState([EMPTY_ROW]);
    const [rawJson, setRawJson] = useState(EMPTY_JSON);
    const [jsonError, setJsonError] = useState(null);
    const [savedFormValues, setSavedFormValues] = useState(null);
    const [formKey, setFormKey] = useState(0);

    useEffect(() => {
        if (!isOpen || !workflowId) return;
        const saved = storage.load(workflowId);
        setJsonError(null);
        if (trigger.type === 'form') {
            setActiveTab('form');
            setSavedFormValues(saved || {});
            setFormKey(k => k + 1);
        } else {
            setActiveTab('kv');
            if (saved && typeof saved === 'object') {
                const rows = Object.entries(saved).map(([k, v]) => ({ key: k, value: String(v) }));
                setKvRows([...rows, EMPTY_ROW]);
                setRawJson(JSON.stringify(saved, null, 2));
            } else {
                setKvRows([EMPTY_ROW]);
                setRawJson(EMPTY_JSON);
            }
        }
    }, [isOpen, workflowId, trigger.type]);

    const handleKvChange = (rows) => {
        setKvRows(rows);
        const obj = Object.fromEntries(rows.filter(r => r.key.trim()).map(r => [r.key.trim(), r.value]));
        setRawJson(JSON.stringify(obj, null, 2));
        setJsonError(null);
    };

    const handleJsonChange = (val) => {
        setRawJson(val);
        setJsonError(null);
        try {
            const rows = Object.entries(JSON.parse(val)).map(([k, v]) => ({ key: k, value: String(v) }));
            setKvRows([...rows, EMPTY_ROW]);
        } catch {}
    };

    const handleNonFormSubmit = () => {
        try {
            const payload = JSON.parse(rawJson) || {};
            storage.save(workflowId, payload);
            onConfirm(payload);
        } catch {
            setJsonError('Invalid JSON — fix before running.');
        }
    };

    const handleFormSubmit = (fieldValues) => {
        const fields = Object.fromEntries(
            (linkedForm?.fields || [])
                .filter(f => !f.deleted && fieldValues[f.id] !== undefined)
                .flatMap(f => [
                    [f.id, fieldValues[f.id]],
                    [f.label, fieldValues[f.id]],
                ])
        );
        storage.save(workflowId, fieldValues);
        onConfirm({
            fields,
            responseId: `${isProduction ? 'production' : 'test'}-run-${Date.now()}`,
            submittedAt: new Date().toISOString()
        });
    };

    const handleReset = () => {
        storage.clear(workflowId);
        setSavedFormValues({});
        setFormKey(k => k + 1);
        setKvRows([EMPTY_ROW]);
        setRawJson(EMPTY_JSON);
        setJsonError(null);
    };

    if (!isOpen) return null;

    const meta = TRIGGER_META[trigger.type] || TRIGGER_META.unknown;
    const tabs = [
        trigger.type === 'form'     && { id: 'form', label: 'Form Preview' },
        trigger.type !== 'schedule' && { id: 'kv',   label: 'Key-Value'   },
                                       { id: 'json', label: 'Raw JSON'    },
    ].filter(Boolean);
    const showFooterRun = activeTab !== 'form' || trigger.type === 'schedule';

    return (
        <div className="fixed inset-0 z-[100200] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4" style={{ zIndex: WORKFLOW_MODAL_LAYERS.testRun }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 flex flex-col max-h-[90vh]">

                <div className="p-5 border-b border-slate-100 flex items-start justify-between bg-slate-50/50 shrink-0">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <h2 className="text-base font-bold text-slate-900">{isProduction ? 'Run live automation' : 'Test Run'}</h2>
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${isProduction ? 'bg-rose-100 text-rose-700 border-rose-200' : meta.color}`}>{isProduction ? 'Production' : meta.label}</span>
                        </div>
                        <p className="text-xs text-slate-500">
                            {isProduction
                                ? 'This uses the published version and performs real actions. Approval steps will wait for a real decision.'
                                : trigger.type === 'form'
                                ? 'Fill in the form below to simulate a real submission. Values are saved for next time.'
                                : trigger.type === 'schedule'
                                ? 'Schedule triggers carry no payload. The test will simulate a scheduled fire.'
                                : 'Provide the payload that will be passed to the workflow trigger.'}
                        </p>
                        {isProduction && <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold leading-4 text-rose-800">Live run warning: emails, approvals, webhooks, and connected services may execute immediately.</div>}
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-lg transition-colors ml-3 shrink-0">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                </div>

                {trigger.type === 'schedule' ? (
                    <div className="p-8 flex flex-col items-center justify-center gap-3 text-center flex-1">
                        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center">
                            <svg className="w-6 h-6 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                        </div>
                        <p className="text-sm font-semibold text-slate-800">Ready to simulate scheduled run</p>
                        <p className="text-xs text-slate-500 max-w-xs">No payload needed for a schedule trigger.</p>
                    </div>
                ) : (
                    <>
                        {tabs.length > 1 && (
                            <div className="flex border-b border-slate-100 px-5 gap-4 bg-white shrink-0">
                                {tabs.map(tab => (
                                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                                        className={`py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-700'}`}>
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div className="p-5 overflow-y-auto flex-1">
                            {activeTab === 'form' && (isLoadingLinkedForms ? (
                                <div className="py-10 text-center text-sm font-medium text-slate-500">Loading form fields…</div>
                            ) : linkedForm ? (
                                <FormFillMode key={formKey} form={linkedForm} savedValues={savedFormValues} onSubmit={handleFormSubmit} isSubmitting={isLoading} isProduction={isProduction} />
                            ) : (
                                <div className="text-center py-10">
                                    <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                                        <svg className="w-5 h-5 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                                    </div>
                                    <p className="text-sm font-semibold text-slate-600">No form linked</p>
                                    <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">Select a form in the trigger node's properties panel first, then re-open Test Run.</p>
                                </div>
                            ))}
                            {activeTab === 'kv' && <KeyValueEditor rows={kvRows} onChange={handleKvChange} />}
                            {activeTab === 'json' && <RawJsonEditor value={rawJson} onChange={handleJsonChange} error={jsonError} />}
                        </div>
                    </>
                )}

                <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between shrink-0">
                    <button onClick={handleReset} className="text-xs text-slate-400 hover:text-red-500 font-medium transition-colors flex items-center gap-1.5">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-4.5" /></svg>
                        Reset saved values
                    </button>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" onClick={onClose} disabled={isLoading}>Cancel</Button>
                        {showFooterRun && (
                            <Button variant={isProduction ? 'dangerSolid' : 'primary'} onClick={trigger.type === 'schedule' ? () => onConfirm({}) : handleNonFormSubmit} isLoading={isLoading} loadingText="Running…">
                                {isProduction ? 'Run live now' : 'Run Test'}
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TestRunModal;
