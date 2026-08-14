import { useState } from 'react';
import { Check, ChevronRight, Search, Sparkles } from 'lucide-react';
import Button from '../ui/Button.jsx';
import { choiceValues, clarificationState, textValue, updateChoiceValue } from '../../utils/clarificationState.js';
import { resolveClarificationSubmission, updateClarificationDraft } from '../../../../shared/clarificationContract.js';

const isResourceChoice = input => input.type === 'workflow_choice' || input.type === 'form_choice' || input.type === 'resource_choice';
const isResourcePicker = input => input.type === 'resource_picker';
const defaultDraftState = (options, state) => ({
    ...Object.fromEntries((options || [])
        .filter(input => input?.id && input.defaultValue !== undefined && input.defaultValue !== null && input.defaultValue !== '')
        .map(input => [input.id, input.defaultValue])),
    ...clarificationState(state)
});

export default function MessageOptionsWidget({
    message,
    options,
    onSend,
    isTyping,
    allowDecide = false,
    clarificationId = null,
    clarificationMessageId = null,
    runId = null,
    isResolved = false,
    initialState = {},
    resolution = null
}) {
    const [formState, setFormState] = useState(() => defaultDraftState(options, initialState));
    const [pickerSearch, setPickerSearch] = useState({});
    const evaluation = resolveClarificationSubmission({ inputs: options, state: isResolved ? initialState : formState });
    const answers = resolution?.answers || evaluation.answers;
    const canSubmit = evaluation.complete;
    const resolutionTitle = resolution?.type === 'superseded'
        ? 'Question superseded'
        : resolution?.type === 'defaulted'
            ? 'Defaults applied'
            : 'Answer recorded';

    const handleToggle = (inputId, option, isSingle) => {
        setFormState(previous => updateClarificationDraft({
            inputs: options,
            state: previous,
            inputId,
            value: updateChoiceValue(previous, inputId, option, isSingle)[inputId]
        }));
    };

    const handleSend = () => {
        if (!canSubmit) return;
        const text = answers.map(({ label, answer }) => `${label}: ${answer}`).join('\n');
        onSend?.({
            type: 'submit_clarification',
            text,
            state: evaluation.state,
            ...(clarificationMessageId ? { clarificationMessageId } : {}),
            ...(runId ? { runId } : {})
        });
    };

    if (isResolved) {
        return (
            <section className="w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-950/[0.03]">
                <div className="flex items-center gap-2.5 px-4 py-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                        <Check size={14} strokeWidth={2.75} />
                    </span>
                    <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800">{resolutionTitle}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                            {resolution?.type === 'superseded'
                                ? 'Promptly continued with a newer request.'
                                : resolution?.type === 'defaulted'
                                ? 'Promptly chose sensible defaults for this question.'
                                : answers.length > 0
                                    ? answers.map(({ label, answer }) => `${label}: ${answer}`).join(' · ')
                                    : 'The response was saved.'}
                        </p>
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section className="w-full overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-[0_12px_30px_rgba(91,71,218,0.08)]">
            <header className="border-b border-violet-100 bg-gradient-to-r from-violet-50 via-white to-white px-4 py-3.5">
                <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.16em] text-violet-700">
                    <span className="flex h-5 w-5 items-center justify-center rounded-md bg-violet-600 text-white"><Sparkles size={11} /></span>
                    Needs your input
                    {options.length > 1 && <span className="ml-auto normal-case tracking-normal text-violet-500">{evaluation.decisionCount} {evaluation.decisionCount === 1 ? 'decision' : 'decisions'}</span>}
                </div>
                {message && <p className="mt-2 text-sm font-semibold leading-5 text-slate-800">{message}</p>}
                <p className="mt-1 text-xs leading-5 text-slate-500">Choose an answer and Promptly will continue the draft.</p>
            </header>

            <div className="space-y-4 p-4">
                {(options || []).map((input, index) => {
                    const selected = choiceValues(formState?.[input.id]);
                    const questionLabel = input.label || `Question ${index + 1}`;

                    if (isResourcePicker(input)) {
                        const search = pickerSearch[input.id] || '';
                        const normalizedSearch = search.trim().toLocaleLowerCase();
                        const resources = (input.options || []).filter(resource => !normalizedSearch
                            || [resource.name, resource.title, resource.description]
                                .filter(Boolean)
                                .some(value => String(value).toLocaleLowerCase().includes(normalizedSearch)));
                        return (
                            <fieldset key={input.id || index} className="space-y-2.5">
                                <legend className="text-xs font-bold text-slate-700">{questionLabel}</legend>
                                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 focus-within:border-violet-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-violet-100/70">
                                    <Search size={15} className="shrink-0 text-slate-400" />
                                    <input
                                        type="search"
                                        value={search}
                                        disabled={isTyping}
                                        onChange={event => setPickerSearch(previous => ({ ...previous, [input.id]: event.target.value }))}
                                        placeholder={`Search ${input.label?.toLocaleLowerCase() || 'options'}…`}
                                        className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                                    />
                                    {input.account && <span className="max-w-28 truncate text-[10px] font-semibold text-slate-400">{input.account}</span>}
                                </div>
                                <div className="max-h-60 space-y-2 overflow-y-auto pr-0.5">
                                    {resources.map(resource => (
                                        <button
                                            key={resource.id}
                                            type="button"
                                            disabled={isTyping}
                                            onClick={() => setFormState(previous => updateClarificationDraft({ inputs: options, state: previous, inputId: input.id, value: resource.id }))}
                                            className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${selected.includes(resource.id) ? 'border-violet-300 bg-violet-50 text-violet-950' : 'border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/50'}`}
                                        >
                                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500">{(resource.name || resource.title || '?').slice(0, 1).toUpperCase()}</span>
                                            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-700">{resource.name || resource.title}</span>{resource.description && <span className="block truncate text-xs text-slate-500">{resource.description}</span>}</span>
                                            {selected.includes(resource.id) ? <Check size={16} className="text-violet-600" /> : <ChevronRight size={16} className="text-slate-400" />}
                                        </button>
                                    ))}
                                    {resources.length === 0 && <p className="px-1 py-2 text-xs text-slate-500">No matching options.</p>}
                                </div>
                                {input.allowCustom && (
                                    <label className="block space-y-1.5 pt-0.5">
                                        <span className="text-[11px] font-semibold text-slate-500">{input.customLabel || 'Paste URL or ID'}</span>
                                        <input
                                            type="text"
                                            disabled={isTyping}
                                            value={(input.options || []).some(option => option.id === selected[0]) ? '' : (selected[0] || '')}
                                            onChange={event => setFormState(previous => updateClarificationDraft({ inputs: options, state: previous, inputId: input.id, value: event.target.value }))}
                                            placeholder={input.customLabel || 'Paste URL or ID'}
                                            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                                        />
                                    </label>
                                )}
                            </fieldset>
                        );
                    }

                    if (isResourceChoice(input)) {
                        return (
                            <fieldset key={input.id || index} className="space-y-2">
                                <legend className="text-xs font-bold text-slate-700">{questionLabel}</legend>
                                <div className="grid gap-2">
                                    {(input.options || []).map(resource => (
                                        <button
                                            key={resource.id}
                                            type="button"
                                            disabled={isTyping}
                                            onClick={() => input.type === 'resource_choice'
                                                ? setFormState(previous => updateClarificationDraft({ inputs: options, state: previous, inputId: input.id, value: resource.id }))
                                                : onSend?.(resource)}
                                            className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${selected.includes(resource.id) ? 'border-violet-300 bg-violet-50 text-violet-950' : 'border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/50'}`}
                                        >
                                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500">{(resource.name || resource.title || '?').slice(0, 1).toUpperCase()}</span>
                                            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-700">{resource.name || resource.title}</span>{resource.description && <span className="block truncate text-xs text-slate-500">{resource.description}</span>}</span>
                                            {selected.includes(resource.id)
                                                ? <Check size={16} className="text-violet-600" />
                                                : <ChevronRight size={16} className="text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-violet-600" />}
                                        </button>
                                    ))}
                                </div>
                            </fieldset>
                        );
                    }

                    if (input.type === 'single_choice' || input.type === 'multiple_choice') {
                        const isSingle = input.type === 'single_choice';
                        return (
                            <fieldset key={input.id || index} className="space-y-2">
                                <legend className="text-xs font-bold text-slate-700">{questionLabel}</legend>
                                <div className="grid gap-2">
                                    {(input.options || []).map((option, optionIndex) => {
                                        const checked = selected.includes(option);
                                        return (
                                            <label key={`${input.id}-${optionIndex}`} className={`relative flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${checked ? 'border-violet-300 bg-violet-50 text-violet-950' : 'border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:bg-violet-50/40'} ${isTyping ? 'cursor-not-allowed opacity-50' : ''}`}>
                                                <input type={isSingle ? 'radio' : 'checkbox'} name={input.id} checked={checked} disabled={isTyping} onChange={() => handleToggle(input.id, option, isSingle)} className="sr-only" />
                                                <span className={`flex h-4 w-4 shrink-0 items-center justify-center border ${isSingle ? 'rounded-full' : 'rounded-[4px]'} ${checked ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300 bg-white'}`}>
                                                    {checked && <Check size={11} strokeWidth={3} />}
                                                </span>
                                                <span className="text-sm font-medium">{option}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </fieldset>
                        );
                    }

                    if (input.type === 'text' || input.type === 'textarea') {
                        const multiline = input.type === 'textarea' || input.multiline || input.placeholder?.includes('\n');
                        const fieldClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500';
                        return (
                            <label key={input.id || index} className="block space-y-2">
                                <span className="text-xs font-bold text-slate-700">{questionLabel}</span>
                                {multiline ? (
                                    <textarea disabled={isTyping} placeholder={input.placeholder || 'Type your answer…'} value={textValue(formState?.[input.id])} onChange={event => setFormState(previous => updateClarificationDraft({ inputs: options, state: previous, inputId: input.id, value: event.target.value }))} className={`${fieldClass} min-h-24 resize-y`} />
                                ) : (
                                    <input disabled={isTyping} placeholder={input.placeholder || 'Type your answer…'} value={textValue(formState?.[input.id])} onChange={event => setFormState(previous => updateClarificationDraft({ inputs: options, state: previous, inputId: input.id, value: event.target.value }))} onKeyDown={event => { if (event.key === 'Enter') handleSend(); }} className={fieldClass} />
                                )}
                            </label>
                        );
                    }

                    return null;
                })}
            </div>

            <footer className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3 sm:flex-row sm:items-center">
                <Button variant="primary" size="sm" onClick={handleSend} disabled={!canSubmit || isTyping} className="w-full sm:flex-1">
                    Continue drafting
                </Button>
                {allowDecide && (
                    <Button variant="ghost" size="sm" onClick={() => onSend?.({ type: 'decide_for_me', clarificationId })} disabled={isTyping} className="w-full text-xs sm:w-auto">
                        Let Promptly decide
                    </Button>
                )}
            </footer>
        </section>
    );
}
