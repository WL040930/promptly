import { useEffect, useMemo, useState } from 'react';
import { normalizeNodeResourceValue } from '../../../../../shared/nodeConfigContract.js';
import { useNodeResources } from '../../hooks/useNodeResources.js';

const selectClassName = 'w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-20 text-sm font-semibold text-slate-800 outline-none transition focus:border-[#776bf2] focus:ring-2 focus:ring-[#5b4ee8]/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400';
const textClassName = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#776bf2] focus:ring-2 focus:ring-[#5b4ee8]/10';

const ResourceSelectInput = ({
    value = '',
    onChange,
    resource,
    params = {},
    requiredParams = [],
    placeholder = 'Select an option…',
    allowCustom = false,
    customLabel = 'Enter a URL or ID',
    valueFormat = null
}) => {
    const dependenciesReady = requiredParams.every(name => String(params?.[name] ?? '').trim());
    const { data, isLoading, isError, error, refetch, isFetching } = useNodeResources(resource, params, { enabled: dependenciesReady });
    const options = data?.options || [];
    const selected = options.find(item => String(item.value) === String(value));
    const [customMode, setCustomMode] = useState(false);
    const [customValue, setCustomValue] = useState(String(value || ''));

    useEffect(() => {
        setCustomValue(String(value || ''));
        if (!value) setCustomMode(false);
        else if (allowCustom && data && !selected) setCustomMode(true);
    }, [value, allowCustom, data, selected]);

    const action = data?.action || error?.payload?.action;
    const description = selected?.description || (data?.account ? `Connected as ${data.account}` : null);
    const emptyMessage = !dependenciesReady
        ? 'Complete the field above to load these options.'
        : data?.emptyMessage;

    const commitCustom = () => {
        const normalized = normalizeNodeResourceValue(valueFormat, customValue);
        setCustomValue(normalized);
        onChange?.(normalized);
    };

    const statusLabel = useMemo(() => {
        if (!dependenciesReady) return 'Waiting for selection';
        if (isLoading) return 'Loading options…';
        if (isError) return 'Could not load options';
        return placeholder;
    }, [dependenciesReady, isLoading, isError, placeholder]);

    return (
        <div className="flex flex-col gap-2">
            {customMode ? (
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={customValue}
                        onChange={event => setCustomValue(event.target.value)}
                        onBlur={commitCustom}
                        onKeyDown={event => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                commitCustom();
                                event.currentTarget.blur();
                            }
                        }}
                        placeholder={customLabel}
                        className={textClassName}
                    />
                    <button
                        type="button"
                        onClick={() => setCustomMode(false)}
                        className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:border-[#c9c4ff] hover:text-[#5143cc]"
                    >
                        Browse
                    </button>
                </div>
            ) : (
                <div className="relative">
                    <select
                        value={selected ? value : ''}
                        onChange={event => onChange?.(event.target.value)}
                        disabled={!dependenciesReady || isLoading}
                        className={selectClassName}
                    >
                        <option value="">{statusLabel}</option>
                        {options.map(item => (
                            <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                    </select>
                    <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
                        <button
                            type="button"
                            onClick={() => refetch()}
                            disabled={!dependenciesReady || isLoading}
                            aria-label="Refresh options"
                            title="Refresh options"
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-[#5b4ee8] disabled:opacity-40"
                        >
                            <svg className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5"/><path d="M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5"/>
                            </svg>
                        </button>
                        <svg className="mr-2 h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m7 10 5 5 5-5"/></svg>
                    </div>
                </div>
            )}

            <div className="flex min-h-4 items-start justify-between gap-3 px-0.5">
                <div className="min-w-0 text-[11px] leading-4 text-slate-500">
                    {isError ? (
                        <span className="text-rose-600">{error?.message || 'These options could not be loaded.'}</span>
                    ) : description ? (
                        <span className="truncate">{description}</span>
                    ) : options.length === 0 && !isLoading ? (
                        <span>{emptyMessage}</span>
                    ) : null}
                    {action && (
                        <a href={action.href} className="ml-1 font-bold text-[#5b4ee8] hover:underline">{action.label}</a>
                    )}
                </div>
                {allowCustom && !customMode && (
                    <button type="button" onClick={() => setCustomMode(true)} className="shrink-0 text-[11px] font-bold text-[#5b4ee8] hover:underline">
                        {customLabel}
                    </button>
                )}
            </div>
        </div>
    );
};

export default ResourceSelectInput;
