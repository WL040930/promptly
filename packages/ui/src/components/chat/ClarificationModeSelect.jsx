import React from 'react';
import { CLARIFICATION_MODES } from '../../../../shared/agentContract.js';

const OPTIONS = [
    { value: CLARIFICATION_MODES.IMPORTANT_ONLY, label: 'Ask important only' },
    { value: CLARIFICATION_MODES.DECIDE_EVERYTHING, label: 'Decide everything' },
    { value: CLARIFICATION_MODES.ASK_EVERYTHING, label: 'Ask everything' }
];

export default function ClarificationModeSelect({ value, onChange, className = '' }) {
    return (
        <label className={`flex min-w-0 items-center gap-2 ${className}`} title="Choose how much the AI should ask before making decisions.">
            <span className="sr-only">AI clarification mode</span>
            <select
                value={value}
                onChange={event => onChange(event.target.value)}
                aria-label="AI clarification mode"
                className="h-9 max-w-[190px] rounded-lg border border-gray-200 bg-white px-2.5 text-[12px] font-semibold text-gray-700 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15"
            >
                {OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
        </label>
    );
}
