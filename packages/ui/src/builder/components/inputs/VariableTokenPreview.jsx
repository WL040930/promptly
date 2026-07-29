import { describeWorkflowVariable, splitWorkflowVariableTokens } from '../../utils/workflowVariableDisplay.js';
import { describeWorkflowExpression, isWorkflowExpression } from '../../../../../shared/workflowExpressions.js';
import { expressionPreviewParts, previewValueItems, workflowPreviewFallbackText } from '../../utils/workflowPreviewValue.js';

/** Read-only rich rendering for text that contains workflow {{variables}}. */
export default function VariableTokenPreview({ value, nodes = [], formsById = {}, availableVars = [], className = '', tone = 'indigo' }) {
    if (value === undefined || value === null || value === '') return <span className="text-slate-400">Not set</span>;

    const tones = tone === 'emerald'
        ? 'border-emerald-200 bg-emerald-100 text-emerald-800'
        : tone === 'red'
            ? 'border-red-200 bg-red-100 text-red-800'
            : 'border-indigo-200 bg-indigo-100 text-indigo-700';

    const pill = (variable, key) => <span
        key={key}
        title={variable.runtimeReference ? `Runtime reference: ${variable.runtimeReference}` : undefined}
        className={`inline-flex max-w-full items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold shadow-sm ${variable.resolved === false ? 'border-amber-200 bg-amber-50 text-amber-800' : tones}`}
    ><span className="truncate">{variable.label}</span></span>;

    if (isWorkflowExpression(value)) {
        const description = describeWorkflowExpression(value, { nodes, formsById });
        return <span className={`flex flex-wrap items-center gap-1 ${className}`}>
            {expressionPreviewParts(description).map((part, index) => part.reference
                ? pill({ ...part.reference, runtimeReference: `${value.$expr === 'reference' ? value.nodeId : ''}` }, index)
                : part.text ? <span key={index} className="whitespace-pre-wrap">{part.text}</span> : null)}
        </span>;
    }
    if (Array.isArray(value)) return <span className={`flex flex-wrap items-center gap-1 ${className}`}>
        {previewValueItems(value).map((item, index) => <span key={index} className="inline-flex min-w-0 items-center gap-1">
            <VariableTokenPreview value={item} nodes={nodes} formsById={formsById} availableVars={availableVars} tone={tone} />
            {index < value.length - 1 && <span className="text-slate-400">,</span>}
        </span>)}
    </span>;
    if (typeof value !== 'string') return <span className={className}>{workflowPreviewFallbackText(value)}</span>;

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
