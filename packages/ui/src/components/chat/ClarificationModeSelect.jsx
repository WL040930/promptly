import React from 'react';
import { ChevronDown, Settings2 } from 'lucide-react';
import { CLARIFICATION_MODES } from '../../../../shared/agentContract.js';

const OPTIONS = [
    { value: CLARIFICATION_MODES.DECIDE_EVERYTHING, label: 'Decide everything' },
    { value: CLARIFICATION_MODES.IMPORTANT_ONLY, label: 'Ask important only' },
    { value: CLARIFICATION_MODES.ASK_EVERYTHING, label: 'Ask everything' }
];

export default function ClarificationModeSelect({ value, onChange, className = '' }) {
    return (
        <label className={`relative flex min-w-0 items-center gap-2 text-slate-500 ${className}`} title="Choose how much the AI should ask before making decisions.">
            <Settings2 size={17} strokeWidth={1.8} aria-hidden="true" />
            <span className="sr-only">AI clarification mode</span>
            <select
                value={value}
                onChange={event => onChange(event.target.value)}
                aria-label="AI clarification mode"
                className="h-8 max-w-[190px] appearance-none bg-transparent px-0 pr-5 text-[13px] font-medium text-slate-700 outline-none transition hover:text-slate-950 focus:text-slate-950"
            >
                {OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <ChevronDown size={15} strokeWidth={1.8} aria-hidden="true" className="pointer-events-none absolute right-0 text-slate-400" />
        </label>
    );
}
