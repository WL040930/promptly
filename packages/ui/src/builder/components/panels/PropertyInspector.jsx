import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '../../../components/ui/Button.jsx';
import { useForms } from '../../../api/hooks/useForms.js';
import {
    getNodeDefaultConfig,
    isNodeInputRequired,
    normalizeNodeInputOptions,
    normalizeNodeResourceValue,
    resetDependentNodeInputs,
    resolveNodeResourceParams
} from '../../../../../shared/nodeConfigContract.js';
import VariableInput from '../inputs/VariableInput.jsx';
import ResourceSelectInput from '../inputs/ResourceSelectInput.jsx';
import CronInput from '../inputs/CronInput.jsx';
import { DataGridInput, JsonInput, KeyValueInput, NodeSelectInput, StringListInput } from '../inputs/StructuredInputs.jsx';
import { getUpstreamOutputs } from '../../utils/getUpstreamOutputs.js';
import { buildNodeInspectorModel } from '../../utils/nodeInspectorModel.js';
import CustomCodeInput from '../inputs/CustomCodeInput.jsx';

const labelClassName = 'text-[11px] font-bold text-slate-600';
const inputClassName = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#776bf2] focus:ring-2 focus:ring-[#5b4ee8]/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400';

const EmptyInspector = () => (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#e3e0ff] bg-[#f7f6ff] text-[#6b5fe7] shadow-sm">
            <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.57V21h-4v-.07a1.7 1.7 0 0 0-1.04-1.57 1.7 1.7 0 0 0-1.87.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15.04 1.7 1.7 0 0 0 3.03 14H3v-4h.03A1.7 1.7 0 0 0 4.6 8.96a1.7 1.7 0 0 0-.34-1.87l-.06-.06L7.03 4.2l.06.06a1.7 1.7 0 0 0 1.87.34A1.7 1.7 0 0 0 10 3.03V3h4v.03a1.7 1.7 0 0 0 1.04 1.57 1.7 1.7 0 0 0 1.87-.34l.06-.06 2.83 2.83-.06.06a1.7 1.7 0 0 0-.34 1.87A1.7 1.7 0 0 0 20.97 10H21v4h-.03a1.7 1.7 0 0 0-1.57 1Z"/>
            </svg>
        </div>
        <h3 className="text-sm font-bold text-slate-800">Choose a step to configure</h3>
        <p className="mt-2 max-w-[220px] text-xs leading-5 text-slate-500">Select any step on the canvas. Its setup and available data will appear here.</p>
    </div>
);

const SecretInput = ({ value, onChange, placeholder }) => {
    const [visible, setVisible] = useState(false);
    return (
        <div className="relative">
            <input type={visible ? 'text' : 'password'} value={value || ''} onChange={event => onChange(event.target.value)} placeholder={placeholder} autoComplete="off" className={`${inputClassName} pr-16`}/>
            <button type="button" onClick={() => setVisible(current => !current)} className="absolute inset-y-0 right-2 px-2 text-[11px] font-bold text-slate-500 hover:text-[#5b4ee8]">
                {visible ? 'Hide' : 'Show'}
            </button>
        </div>
    );
};

const FieldShell = ({ input, issue, required, children }) => (
    <div className="flex flex-col gap-1.5" data-field={input.name}>
        {input.type !== 'boolean' && input.type !== 'webhook-display' && (
            <label className={labelClassName}>
                {input.label || input.name}
                {required && <span className="ml-1 text-[#5b4ee8]" aria-label="required">•</span>}
            </label>
        )}
        {children}
        {(issue || input.helpText || input.hint) && input.type !== 'boolean' && (
            <p className={`px-0.5 text-[11px] leading-4 ${issue ? 'font-semibold text-amber-700' : 'text-slate-400'}`}>
                {issue?.message || input.helpText || input.hint}
            </p>
        )}
    </div>
);

const Readiness = ({ validation }) => {
    const issueCount = validation.issues.length;
    const ready = issueCount === 0;
    return (
        <div className={`relative overflow-hidden rounded-xl border px-3.5 py-3 ${ready ? 'border-emerald-200 bg-emerald-50/70' : 'border-amber-200 bg-amber-50/70'}`}>
            <span className={`absolute inset-y-0 left-0 w-1 ${ready ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <div className="flex items-center justify-between gap-3">
                <div>
                    <p className={`text-xs font-bold ${ready ? 'text-emerald-800' : 'text-amber-900'}`}>{ready ? 'Ready to test' : 'Setup required'}</p>
                    <p className={`mt-0.5 text-[11px] ${ready ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {ready ? 'All required settings are complete.' : `${issueCount} ${issueCount === 1 ? 'item needs' : 'items need'} your attention.`}
                    </p>
                </div>
                <span className={`flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-xs font-black ${ready ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                    {ready ? '✓' : issueCount}
                </span>
            </div>
        </div>
    );
};

const PropertyInspector = ({ activeNode, onUpdateNode, onTestWorkflow, nodes = [], edges = [] }) => {
    const [title, setTitle] = useState(activeNode?.title || '');
    const [description, setDescription] = useState(activeNode?.description || '');
    const [localConfig, setLocalConfig] = useState(activeNode?.config || {});
    const updateTimeoutRef = useRef(null);
    const configSnapshot = JSON.stringify(activeNode?.config || {});
    const { data: forms = [], isLoading: formsLoading } = useForms();

    useEffect(() => {
        setTitle(activeNode?.title || '');
        setDescription(activeNode?.description || '');
        setLocalConfig(activeNode?.config || {});
    }, [activeNode?.id, activeNode?.title, activeNode?.description, configSnapshot]);

    useEffect(() => () => {
        if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
    }, []);

    const debouncedUpdateNode = (nodeId, nextConfig) => {
        if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
        updateTimeoutRef.current = setTimeout(() => onUpdateNode?.(nodeId, { config: nextConfig }), 250);
    };

    const upstreamNodes = useMemo(() => {
        if (!activeNode) return [];
        const upstreamIds = new Set();
        const queue = [activeNode.id];
        while (queue.length > 0) {
            const current = queue.shift();
            edges.filter(edge => edge.target === current).forEach(edge => {
                if (!upstreamIds.has(edge.source)) {
                    upstreamIds.add(edge.source);
                    queue.push(edge.source);
                }
            });
        }
        return nodes.filter(node => upstreamIds.has(node.id));
    }, [activeNode?.id, nodes, edges]);

    const resolvedFormFields = useMemo(() => Object.fromEntries(
        upstreamNodes
            .filter(node => node.subType === 'form-submission' && node.config?.formId)
            .map(node => {
                const form = forms.find(item => item.id === node.config.formId) || null;
                return [node.id, {
                    form,
                    fields: (form?.fields || []).filter(field => !field.deleted && field.type !== 'heading'),
                    isLoading: formsLoading
                }];
            })
    ), [upstreamNodes, forms, formsLoading]);

    const availableVars = activeNode ? getUpstreamOutputs(activeNode.id, nodes, edges, resolvedFormFields) : [];
    const schema = activeNode?.schema || { inputs: [], outputs: [] };
    const inspector = useMemo(() => buildNodeInspectorModel(schema, localConfig), [schema, localConfig]);

    if (!activeNode) return <EmptyInspector />;

    const changeConfig = (input, rawValue) => {
        let value = rawValue?.target !== undefined ? rawValue.target.value : rawValue;
        if (input.type === 'boolean') value = rawValue?.target !== undefined ? rawValue.target.checked : Boolean(rawValue);
        if (input.type === 'number') value = value === '' ? '' : Number(value);
        if (input.type === 'resource-select') value = normalizeNodeResourceValue(input.valueFormat, value);

        setLocalConfig(current => {
            const next = resetDependentNodeInputs(schema, { ...(current || {}), [input.name]: value }, input.name);
            for (const dependent of schema.inputs || []) {
                if (dependent.optionsBy?.field !== input.name) continue;
                const options = normalizeNodeInputOptions(dependent, next).filter(option => !option.disabled);
                if (options.length > 0 && !options.some(option => String(option.value) === String(next[dependent.name]))) {
                    next[dependent.name] = dependent.defaultValue !== undefined && options.some(option => String(option.value) === String(dependent.defaultValue))
                        ? dependent.defaultValue
                        : options[0].value;
                }
            }
            debouncedUpdateNode(activeNode.id, next);
            return next;
        });
    };

    const renderInput = input => {
        const value = localConfig[input.name] !== undefined
            ? localConfig[input.name]
            : getNodeDefaultConfig(schema)[input.name] ?? '';
        const onChange = next => changeConfig(input, next);

        if (activeNode.subType === 'customCode' && input.name === 'code') {
            return <CustomCodeInput value={value} sampleInput={localConfig.sampleInput || '{}'} onChange={onChange} onSampleInputChange={next => changeConfig({ name: 'sampleInput', type: 'json' }, next)} />;
        }

        if (input.type === 'webhook-display') {
            const webhookId = value || activeNode.config?.webhookId || '';
            const webhookUrl = webhookId ? `${window.location.origin}/api/webhooks/${webhookId}` : 'Save this automation to generate its endpoint';
            return (
                <div className="rounded-xl border border-[#dedbff] bg-[#f7f6ff] p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="text-[11px] font-bold text-[#5143cc]">{input.label || 'Webhook endpoint'}</span>
                        {webhookId && <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-emerald-700">Active</span>}
                    </div>
                    <div className="flex items-center gap-2">
                        <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-2.5 py-2 text-[11px] text-slate-600 shadow-sm">{webhookUrl}</code>
                        {webhookId && (
                            <button type="button" onClick={() => navigator.clipboard.writeText(webhookUrl)} className="rounded-lg border border-[#dedbff] bg-white px-2.5 py-2 text-[11px] font-bold text-[#5b4ee8] hover:bg-[#f1efff]">Copy</button>
                        )}
                    </div>
                </div>
            );
        }

        if (input.type === 'resource-select') {
            const params = resolveNodeResourceParams(input, localConfig);
            return <ResourceSelectInput value={value} onChange={onChange} resource={input.resource} params={params} requiredParams={input.requiredResourceParams || []} placeholder={input.placeholder} allowCustom={input.allowCustom} customLabel={input.customLabel} valueFormat={input.valueFormat}/>;
        }
        if (input.type === 'node-select') return <NodeSelectInput value={value} onChange={onChange} nodes={input.scope === 'all' ? nodes : upstreamNodes} currentNodeId={activeNode.id} placeholder={input.placeholder}/>;
        if (input.type === 'cron') return <CronInput value={value} onChange={onChange}/>;
        if (input.type === 'key-value') return <KeyValueInput value={value} onChange={onChange} keyPlaceholder={input.keyPlaceholder} valuePlaceholder={input.valuePlaceholder}/>;
        if (input.type === 'string-list') return <StringListInput value={value} onChange={onChange} placeholder={input.placeholder} suggestions={input.suggestions || []}/>;
        if (input.type === 'data-grid') return <DataGridInput value={value} onChange={onChange}/>;
        if (input.type === 'object' || input.type === 'json') return <JsonInput value={value} onChange={onChange} placeholder={input.placeholder} rows={input.rows}/>;
        if (input.type === 'secret') return <SecretInput value={value} onChange={onChange} placeholder={input.placeholder}/>;

        if (input.type === 'select') {
            const options = normalizeNodeInputOptions(input, localConfig);
            return (
                <div className="relative">
                    <select value={String(value)} onChange={onChange} className={`${inputClassName} appearance-none pr-9`}>
                        {input.placeholder && <option value="">{input.placeholder}</option>}
                        {options.map(option => <option key={option.key} value={option.value} disabled={option.disabled}>{option.label}</option>)}
                    </select>
                    <svg className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m7 10 5 5 5-5"/></svg>
                </div>
            );
        }

        if (input.type === 'boolean') {
            return (
                <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white px-3 py-3 transition hover:border-[#d9d5ff]">
                    <span>
                        <span className="block text-xs font-bold text-slate-700">{input.label || input.name}</span>
                        {(input.helpText || input.hint) && <span className="mt-1 block text-[11px] leading-4 text-slate-400">{input.helpText || input.hint}</span>}
                    </span>
                    <span className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition ${value ? 'bg-[#5b4ee8]' : 'bg-slate-200'}`}>
                        <input type="checkbox" checked={Boolean(value)} onChange={onChange} className="sr-only"/>
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition ${value ? 'translate-x-[18px]' : 'translate-x-0.5'}`}/>
                    </span>
                </label>
            );
        }

        if (input.type === 'textarea' || input.type === 'text') {
            return <VariableInput value={String(value ?? '')} onChange={onChange} placeholder={input.placeholder} multiline={input.type === 'textarea'} rows={input.rows || (input.type === 'textarea' ? 4 : undefined)} availableVars={availableVars}/>;
        }

        return <input type={input.type === 'number' ? 'number' : 'text'} value={value} min={input.min} max={input.max} step={input.step} onChange={onChange} placeholder={input.placeholder} className={inputClassName}/>;
    };

    const renderSection = section => (
        <div key={`${section.key}-${section.advanced}`} className="flex flex-col gap-3.5">
            <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-400">{section.title}</span>
                <span className="h-px flex-1 bg-slate-100" />
            </div>
            {section.inputs.map(input => {
                const required = isNodeInputRequired(input, localConfig);
                const issue = inspector.issuesByField[input.name];
                return <FieldShell key={input.name} input={input} issue={issue} required={required}>{renderInput(input)}</FieldShell>;
            })}
        </div>
    );

    const standardSections = inspector.sections.filter(section => !section.advanced);
    const advancedSections = inspector.sections.filter(section => section.advanced);

    return (
        <div key={activeNode.id} className="flex h-full w-full flex-col bg-white">
            <div className="border-b border-slate-100 px-4 py-3.5">
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#6b5fe7]">Configure step</p>
                        <h3 className="mt-0.5 truncate text-sm font-bold text-slate-900">{activeNode.title || activeNode.subType}</h3>
                    </div>
                    <span className="shrink-0 rounded-full border border-[#dedbff] bg-[#f7f6ff] px-2 py-1 text-[9px] font-black uppercase tracking-wider text-[#5b4ee8]">{activeNode.type}</span>
                </div>
            </div>

            <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
                <Readiness validation={inspector.validation}/>

                {availableVars.length > 0 && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-[#e3e0ff] bg-[#faf9ff] px-3 py-2.5">
                        <span className="mt-0.5 rounded-md bg-[#ece9ff] px-1.5 py-0.5 text-[10px] font-black text-[#5b4ee8]">{'{}'}</span>
                        <p className="text-[11px] leading-4 text-[#6258a8]">
                            <strong>{availableVars.length} previous-step {availableVars.length === 1 ? 'value' : 'values'}</strong> available. Use the {'{}'} button in text fields to insert one.
                            {formsLoading && <span className="ml-1 text-[#8178d8]">Loading form fields…</span>}
                        </p>
                    </div>
                )}

                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2"><span className="text-[10px] font-black uppercase tracking-[0.13em] text-slate-400">Identity</span><span className="h-px flex-1 bg-slate-100"/></div>
                    <div className="flex flex-col gap-1.5">
                        <label className={labelClassName}>Step name</label>
                        <input
                            value={title}
                            onChange={event => setTitle(event.target.value)}
                            onBlur={() => {
                                const next = title.trim();
                                setTitle(next);
                                if (next !== (activeNode.title || '')) onUpdateNode?.(activeNode.id, { title: next });
                            }}
                            onKeyDown={event => event.key === 'Enter' && event.currentTarget.blur()}
                            className={inputClassName}
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className={labelClassName}>Description</label>
                        <textarea value={description} onChange={event => setDescription(event.target.value)} onBlur={() => onUpdateNode?.(activeNode.id, { description })} rows="2" className={`${inputClassName} resize-none`}/>
                    </div>
                </div>

                {standardSections.map(renderSection)}

                {advancedSections.length > 0 && (
                    <details className="group rounded-xl border border-slate-200 bg-slate-50/60">
                        <summary className="flex cursor-pointer list-none items-center justify-between px-3.5 py-3 text-xs font-bold text-slate-600">
                            Advanced settings
                            <svg className="h-4 w-4 transition group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m7 10 5 5 5-5"/></svg>
                        </summary>
                        <div className="flex flex-col gap-5 border-t border-slate-200 bg-white p-3.5">{advancedSections.map(renderSection)}</div>
                    </details>
                )}

                {inspector.inputs.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center">
                        <p className="text-xs font-semibold text-slate-500">This step works without additional setup.</p>
                    </div>
                )}
            </div>

            <div className="border-t border-slate-100 bg-slate-50/70 p-4">
                <Button variant="outline" size="action" onClick={onTestWorkflow} disabled={!onTestWorkflow || !inspector.validation.ready} className="w-full bg-white">
                    {inspector.validation.ready ? 'Test workflow' : 'Complete setup to test'}
                </Button>
            </div>
        </div>
    );
};

export default PropertyInspector;
