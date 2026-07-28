import { describeWorkflowVariable, splitWorkflowVariableTokens } from '../../utils/workflowVariableDisplay.js';

/** Read-only rich rendering for text that contains workflow {{variables}}. */
export default function VariableTokenPreview({ value, nodes = [], formsById = {}, availableVars = [], className = '', tone = 'indigo' }) {
    if (value === undefined || value === null || value === '') return <span className="text-slate-400">Not set</span>;
    if (typeof value !== 'string') return <span>{String(value)}</span>;

    const tones = tone === 'emerald'
        ? 'border-emerald-200 bg-emerald-100 text-emerald-800'
        : tone === 'red'
            ? 'border-red-200 bg-red-100 text-red-800'
            : 'border-indigo-200 bg-indigo-100 text-indigo-700';

    return <span className={`flex flex-wrap items-center gap-1 ${className}`}>
        {splitWorkflowVariableTokens(value).map((part, index) => {
            const match = part.match(/^\{\{([^}]+)\}\}$/);
            if (!match) return part ? <span key={index} className="whitespace-pre-wrap">{part}</span> : null;

            const path = match[1];
            const pickedVariable = availableVars.find(variable => variable.path === path || variable.runtimePath === path);
            const variable = pickedVariable
                ? {
                    reference: path,
                    displayLabel: `${pickedVariable.nodeTitle || 'Previous step'} › ${pickedVariable.label || path}`,
                    isResolved: true
                }
                : describeWorkflowVariable(path, nodes, formsById);
            return <span
                key={index}
                title={`Runtime reference: {{${variable.reference}}}`}
                className={`inline-flex max-w-full items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold shadow-sm ${variable.isResolved ? tones : 'border-amber-200 bg-amber-50 text-amber-800'}`}
            >
                <span className="truncate">{variable.displayLabel}</span>
            </span>;
        })}
    </span>;
}
