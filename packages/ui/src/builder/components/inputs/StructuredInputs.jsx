import { useEffect, useMemo, useState } from 'react';
import { isWorkflowExpression } from '../../../../../shared/workflowExpressions.js';
import { workflowPreviewDisplayText } from '../../utils/workflowPreviewValue.js';
import { normalizeEditorWorkflowValue } from '../../utils/workflowReferenceInput.js';
import VariableInput from './VariableInput.jsx';

const fieldClassName = 'w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#776bf2] focus:ring-2 focus:ring-[#5b4ee8]/10';
const iconButtonClassName = 'rounded-lg border border-transparent p-2 text-slate-400 transition hover:border-rose-100 hover:bg-rose-50 hover:text-rose-600';

const stringify = value => {
    if (typeof value === 'string') {
        try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
    }
    return JSON.stringify(value ?? {}, null, 2);
};

const parseCell = value => {
    const trimmed = String(value).trim();
    if (!trimmed) return '';
    try { return JSON.parse(trimmed); } catch { return value; }
};

export function JsonInput({ value, onChange, placeholder, rows = 6, availableVars = [], valueSyntax }) {
    const [text, setText] = useState(() => stringify(value));
    const [error, setError] = useState('');
    const [focused, setFocused] = useState(false);

    useEffect(() => {
        if (!focused) setText(stringify(value));
    }, [value, focused]);

    const update = next => {
        setText(next);
        if (!next.trim()) {
            setError('');
            onChange?.({});
            return;
        }
        try {
            const parsed = JSON.parse(next);
            if (valueSyntax === 'workflow-expression') {
                const normalized = normalizeEditorWorkflowValue({ value: parsed, availableVars, path: 'value' });
                if (normalized.issues.length > 0) {
                    setError(normalized.issues[0].message);
                    return;
                }
                onChange?.(normalized.value);
            } else {
                onChange?.(parsed);
            }
            setError('');
        } catch {
            setError('Fix the JSON before this value can be saved.');
        }
    };

    return (
        <div className="flex flex-col gap-1.5">
            <textarea
                value={text}
                rows={rows}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onChange={event => update(event.target.value)}
                placeholder={placeholder}
                spellCheck="false"
                className={`${fieldClassName} resize-y font-mono text-xs leading-5 ${error ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-500/10' : ''}`}
            />
            <p className={`px-0.5 text-[11px] ${error ? 'text-rose-600' : 'text-slate-400'}`}>
                {error || 'Structured JSON · changes save when the value is valid.'}
            </p>
        </div>
    );
}

const objectRows = value => {
    let current = value;
    if (typeof current === 'string') {
        try { current = JSON.parse(current); } catch { current = {}; }
    }
    const entries = current && typeof current === 'object' && !Array.isArray(current) ? Object.entries(current) : [];
    return entries.map(([key, item]) => ({
        key,
        value: isWorkflowExpression(item) || typeof item === 'string' ? item : JSON.stringify(item ?? '')
    }));
};

export function KeyValueInput({ value, onChange, keyPlaceholder = 'Field', valuePlaceholder = 'Value', availableVars = [], valueSyntax }) {
    const serialized = useMemo(() => JSON.stringify(value ?? {}), [value]);
    const [rows, setRows] = useState(() => objectRows(value));

    useEffect(() => setRows(objectRows(value)), [serialized]);

    const commit = next => {
        setRows(next);
        onChange?.(Object.fromEntries(next.filter(row => row.key.trim()).map(row => [row.key.trim(), parseCell(row.value)])));
    };

    return (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70">
            <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_36px] gap-2 border-b border-slate-200 px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <span>{keyPlaceholder}</span><span>{valuePlaceholder}</span><span />
            </div>
            <div className="flex flex-col gap-2 p-2">
                {rows.length === 0 && <p className="px-1 py-2 text-center text-xs text-slate-400">No fields added yet.</p>}
                {rows.map((row, index) => (
                    <div key={index} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_36px] gap-2">
                        <input value={row.key} onChange={event => commit(rows.map((item, itemIndex) => itemIndex === index ? { ...item, key: event.target.value } : item))} placeholder={keyPlaceholder} className={fieldClassName}/>
                        {['workflow-expression', 'node-template'].includes(valueSyntax) ? (
                            <VariableInput
                                value={row.value}
                                onChange={nextValue => commit(rows.map((item, itemIndex) => itemIndex === index ? { ...item, value: nextValue } : item))}
                                placeholder={valuePlaceholder}
                                availableVars={availableVars}
                                valueSyntax={valueSyntax}
                            />
                        ) : (
                            <input
                                value={typeof row.value === 'string' ? row.value : JSON.stringify(row.value ?? '')}
                                onChange={event => commit(rows.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item))}
                                placeholder={valuePlaceholder}
                                className={fieldClassName}
                            />
                        )}
                        <button type="button" aria-label={`Remove ${keyPlaceholder.toLowerCase()}`} onClick={() => commit(rows.filter((_, itemIndex) => itemIndex !== index))} className={iconButtonClassName}>×</button>
                    </div>
                ))}
                <button type="button" onClick={() => setRows(current => [...current, { key: '', value: '' }])} className="rounded-lg border border-dashed border-[#c9c4ff] bg-white px-3 py-2 text-xs font-bold text-[#5b4ee8] transition hover:bg-[#f7f6ff]">
                    + Add field
                </button>
            </div>
        </div>
    );
}

const listValue = value => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parsed.map(String);
        } catch { return value.split(',').map(item => item.trim()).filter(Boolean); }
    }
    return [];
};

export function StringListInput({ value, onChange, placeholder = 'Type a value and press Enter', suggestions = [], availableVars = [], valueSyntax }) {
    const items = listValue(value);
    const [draft, setDraft] = useState('');
    const [error, setError] = useState('');
    const add = raw => {
        const nextItem = String(raw || '').trim();
        if (!nextItem || items.includes(nextItem)) return;
        let item = nextItem;
        if (valueSyntax === 'workflow-expression') {
            const normalized = normalizeEditorWorkflowValue({ value: nextItem, availableVars, path: 'value' });
            if (normalized.issues.length > 0) {
                setError(normalized.issues[0].message);
                return;
            }
            item = normalized.value;
        }
        if (items.some(existing => JSON.stringify(existing) === JSON.stringify(item))) return;
        onChange?.([...items, item]);
        setDraft('');
        setError('');
    };

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-2.5 focus-within:border-[#776bf2] focus-within:ring-2 focus-within:ring-[#5b4ee8]/10">
            <div className="mb-2 flex flex-wrap gap-1.5">
                {items.map((item, index) => (
                    <span key={`item-${index}`} className="inline-flex items-center gap-1 rounded-full border border-[#dedbff] bg-[#f1efff] px-2 py-1 text-xs font-bold text-[#5143cc]">
                        {workflowPreviewDisplayText(item, { availableVars, compact: true })}
                        <button type="button" onClick={() => onChange?.(items.filter((_, valueIndex) => valueIndex !== index))} className="text-[#8178d8] hover:text-rose-600" aria-label={`Remove ${workflowPreviewDisplayText(item, { availableVars, compact: true })}`}>×</button>
                    </span>
                ))}
            </div>
            <input
                value={draft}
                onChange={event => setDraft(event.target.value)}
                onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ',') {
                        event.preventDefault();
                        add(draft);
                    }
                }}
                onBlur={() => add(draft)}
                placeholder={placeholder}
                className={`w-full bg-transparent px-1 py-1 text-sm font-medium text-slate-800 outline-none placeholder:text-slate-400 ${error ? 'text-amber-800' : ''}`}
            />
            {error && <p className="px-1 text-[11px] font-semibold leading-4 text-amber-700">{error}</p>}
            {suggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1 border-t border-slate-100 pt-2">
                    {suggestions.filter(item => !items.includes(item)).map(item => (
                        <button key={item} type="button" onClick={() => add(item)} className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-[#f1efff] hover:text-[#5143cc]">+ {item}</button>
                    ))}
                </div>
            )}
        </div>
    );
}

const gridValue = value => {
    let current = value;
    if (typeof current === 'string') {
        try { current = JSON.parse(current); } catch { current = []; }
    }
    if (!Array.isArray(current) || current.some(row => !Array.isArray(row))) return [['', '']];
    if (current.length === 0) return [['', '']];
    const width = Math.max(2, ...current.map(row => row.length));
    return current.map(row => [...row, ...Array(width - row.length).fill('')]);
};

const GridCellInput = ({ cell, rowIndex, columnIndex, grid, commit, availableVars, valueSyntax }) => {
    const update = nextValue => commit(grid.map((currentRow, currentRowIndex) => currentRowIndex === rowIndex
        ? currentRow.map((currentCell, currentColumnIndex) => currentColumnIndex === columnIndex ? nextValue : currentCell)
        : currentRow));

    if (isWorkflowExpression(cell) || (valueSyntax === 'workflow-expression' && (typeof cell === 'string' || typeof cell === 'number' || cell === null || cell === undefined))) {
        return (
            <div className="min-w-0">
                <VariableInput value={cell} onChange={update} availableVars={availableVars} valueSyntax={valueSyntax || 'workflow-expression'}/>
            </div>
        );
    }

    return (
        <input
            value={workflowPreviewDisplayText(cell, { availableVars, compact: true })}
            title={workflowPreviewDisplayText(cell, { availableVars }) || undefined}
            aria-label={`Row ${rowIndex + 1}, Column ${columnIndex + 1}`}
            onChange={event => update(event.target.value)}
            className={`${fieldClassName} min-w-0`}
        />
    );
};

export function DataGridInput({ value, onChange, availableVars = [], valueSyntax }) {
    const serialized = useMemo(() => JSON.stringify(value ?? []), [value]);
    const [grid, setGrid] = useState(() => gridValue(value));
    useEffect(() => setGrid(gridValue(value)), [serialized]);

    const commit = next => {
        setGrid(next);
        onChange?.(next.map(row => row.map(parseCell)));
    };
    const width = grid[0]?.length || 2;
    const gridStyle = {
        gridTemplateColumns: `28px repeat(${width}, minmax(0, 1fr)) 32px`,
        minWidth: width > 6 ? `${28 + (width * 140) + 32}px` : '100%'
    };

    return (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="overflow-x-auto p-2.5">
                <div className="grid gap-1.5" style={gridStyle}>
                    <span />
                    {Array.from({ length: width }, (_, index) => <span key={index} className="truncate px-2 text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-400">Column {index + 1}</span>)}
                    <button type="button" title="Add column" aria-label="Add column" onClick={() => commit(grid.map(row => [...row, '']))} className="rounded-md text-lg font-bold leading-none text-[#5b4ee8] transition hover:bg-[#ece9ff]">+</button>
                    {grid.flatMap((row, rowIndex) => [
                        <span key={`label-${rowIndex}`} className="flex h-full min-h-10 items-center justify-center rounded-lg bg-white text-[10px] font-extrabold text-slate-400 shadow-sm">{rowIndex + 1}</span>,
                        ...row.map((cell, columnIndex) => (
                            <GridCellInput
                                key={`${rowIndex}-${columnIndex}`}
                                cell={cell}
                                rowIndex={rowIndex}
                                columnIndex={columnIndex}
                                grid={grid}
                                commit={commit}
                                availableVars={availableVars}
                                valueSyntax={valueSyntax}
                            />
                        )),
                        <button key={`remove-${rowIndex}`} type="button" title="Remove row" onClick={() => commit(grid.length === 1 ? [Array(width).fill('')] : grid.filter((_, index) => index !== rowIndex))} className={iconButtonClassName}>×</button>
                    ])}
                </div>
            </div>
            <button type="button" onClick={() => commit([...grid, Array(width).fill('')])} className="w-full border-t border-dashed border-slate-200 bg-white px-3 py-2 text-xs font-bold text-[#5b4ee8] hover:bg-[#f7f6ff]">+ Add row</button>
        </div>
    );
}

const parameterListValue = value => {
    let current = value;
    if (typeof current === 'string') {
        try { current = JSON.parse(current); } catch { current = []; }
    }
    if (!Array.isArray(current)) return [];
    return current.map(item => ({
        name: String(item?.name || ''),
        type: ['string', 'number', 'integer', 'boolean'].includes(item?.type) ? item.type : 'string',
        description: String(item?.description || ''),
        required: item?.required === true
    }));
};

/** A compact editor for the common, flat chat-workflow parameter contract. */
export function ParameterListInput({ value, onChange }) {
    const serialized = useMemo(() => JSON.stringify(value ?? []), [value]);
    const [parameters, setParameters] = useState(() => parameterListValue(value));

    useEffect(() => setParameters(parameterListValue(value)), [serialized]);

    const commit = next => {
        const normalized = next.slice(0, 20).map(item => ({
            name: String(item.name || '').trim(),
            type: item.type || 'string',
            description: String(item.description || '').trim(),
            required: item.required === true
        }));
        setParameters(normalized);
        onChange?.(normalized);
    };

    return (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70">
            <div className="grid grid-cols-[minmax(0,0.8fr)_96px_52px_32px] gap-2 border-b border-slate-200 px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <span>Name and help text</span><span>Type</span><span>Required</span><span />
            </div>
            <div className="flex flex-col gap-2 p-2">
                {parameters.length === 0 && <p className="px-1 py-2 text-center text-xs text-slate-400">No parameters. This workflow can run from a matching chat request without extra data.</p>}
                {parameters.map((parameter, index) => (
                    <div key={index} className="grid grid-cols-[minmax(0,0.8fr)_96px_52px_32px] gap-2 items-start">
                        <div className="flex min-w-0 flex-col gap-1.5">
                            <input value={parameter.name} onChange={event => commit(parameters.map((item, itemIndex) => itemIndex === index ? { ...item, name: event.target.value } : item))} placeholder="status" className={fieldClassName}/>
                            <input value={parameter.description} onChange={event => commit(parameters.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))} placeholder="What should the AI fill?" className={`${fieldClassName} text-xs`}/>
                        </div>
                        <select value={parameter.type} onChange={event => commit(parameters.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value } : item))} className={`${fieldClassName} text-xs`}>
                            <option value="string">Text</option>
                            <option value="number">Number</option>
                            <option value="integer">Whole number</option>
                            <option value="boolean">Yes / no</option>
                        </select>
                        <label className="flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white">
                            <input type="checkbox" checked={parameter.required} onChange={event => commit(parameters.map((item, itemIndex) => itemIndex === index ? { ...item, required: event.target.checked } : item))}/>
                        </label>
                        <button type="button" aria-label="Remove parameter" onClick={() => commit(parameters.filter((_, itemIndex) => itemIndex !== index))} className={`${iconButtonClassName} mt-0.5`}>×</button>
                    </div>
                ))}
                <button type="button" disabled={parameters.length >= 20} onClick={() => commit([...parameters, { name: '', type: 'string', description: '', required: false }])} className="rounded-lg border border-dashed border-[#c9c4ff] bg-white px-3 py-2 text-xs font-bold text-[#5b4ee8] transition hover:bg-[#f7f6ff] disabled:cursor-not-allowed disabled:opacity-50">
                    + Add parameter
                </button>
            </div>
        </div>
    );
}

const FILTER_OPERATORS = [
    ['equals', 'Equals'],
    ['notEquals', 'Does not equal'],
    ['contains', 'Contains'],
    ['startsWith', 'Starts with'],
    ['greater', 'Greater than'],
    ['less', 'Less than'],
    ['isEmpty', 'Is empty'],
    ['isNotEmpty', 'Is not empty']
];

const filterListValue = value => {
    let current = value;
    if (typeof current === 'string') {
        try { current = JSON.parse(current); } catch { current = []; }
    }
    if (!Array.isArray(current)) return [];
    return current.map(item => ({
        column: String(item?.column || ''),
        operator: FILTER_OPERATORS.some(([key]) => key === item?.operator) ? item.operator : 'equals',
        value: item?.value ?? ''
    }));
};

/** Common AND filters for tabular workflow data such as Google Sheets reads. */
export function FilterListInput({ value, onChange, availableVars = [], valueSyntax }) {
    const serialized = useMemo(() => JSON.stringify(value ?? []), [value]);
    const [filters, setFilters] = useState(() => filterListValue(value));
    useEffect(() => setFilters(filterListValue(value)), [serialized]);

    const commit = next => {
        const normalized = next.slice(0, 20).map(item => ({
            column: String(item.column || '').trim(),
            operator: item.operator || 'equals',
            ...(item.operator === 'isEmpty' || item.operator === 'isNotEmpty' ? {} : { value: item.value ?? '' })
        }));
        setFilters(normalized);
        onChange?.(normalized);
    };

    return (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70">
            <div className="grid grid-cols-[minmax(0,0.8fr)_132px_minmax(0,1fr)_32px] gap-2 border-b border-slate-200 px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <span>Column</span><span>Match</span><span>Value</span><span />
            </div>
            <div className="flex flex-col gap-2 p-2">
                {filters.length === 0 && <p className="px-1 py-2 text-center text-xs text-slate-400">Add one or more filters. Every filter must match.</p>}
                {filters.map((filter, index) => {
                    const needsValue = !['isEmpty', 'isNotEmpty'].includes(filter.operator);
                    return (
                        <div key={index} className="grid grid-cols-[minmax(0,0.8fr)_132px_minmax(0,1fr)_32px] gap-2 items-center">
                            <input value={filter.column} onChange={event => commit(filters.map((item, itemIndex) => itemIndex === index ? { ...item, column: event.target.value } : item))} placeholder="Status" className={fieldClassName}/>
                            <select value={filter.operator} onChange={event => commit(filters.map((item, itemIndex) => itemIndex === index ? { ...item, operator: event.target.value } : item))} className={`${fieldClassName} text-xs`}>
                                {FILTER_OPERATORS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                            </select>
                            {needsValue ? (
                                <VariableInput value={filter.value} onChange={nextValue => commit(filters.map((item, itemIndex) => itemIndex === index ? { ...item, value: nextValue } : item))} placeholder="Active" availableVars={availableVars} valueSyntax={valueSyntax}/>
                            ) : <span className="px-2 text-xs italic text-slate-400">No value needed</span>}
                            <button type="button" aria-label="Remove filter" onClick={() => commit(filters.filter((_, itemIndex) => itemIndex !== index))} className={iconButtonClassName}>×</button>
                        </div>
                    );
                })}
                <button type="button" disabled={filters.length >= 20} onClick={() => commit([...filters, { column: '', operator: 'equals', value: '' }])} className="rounded-lg border border-dashed border-[#c9c4ff] bg-white px-3 py-2 text-xs font-bold text-[#5b4ee8] transition hover:bg-[#f7f6ff] disabled:cursor-not-allowed disabled:opacity-50">
                    + Add filter
                </button>
            </div>
        </div>
    );
}

export function NodeSelectInput({ value, onChange, nodes = [], currentNodeId, placeholder = 'Select a previous step…' }) {
    const options = nodes.filter(node => node.id !== currentNodeId);
    return (
        <div className="relative">
            <select value={value || ''} onChange={event => onChange?.(event.target.value)} className={`${fieldClassName} appearance-none pr-9`}>
                <option value="">{placeholder}</option>
                {options.map(node => <option key={node.id} value={node.id}>{node.title || node.subType || node.id}</option>)}
            </select>
            <svg className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m7 10 5 5 5-5"/></svg>
        </div>
    );
}
