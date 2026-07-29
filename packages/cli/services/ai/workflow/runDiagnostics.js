const RUN_ID_PATTERN = /\brun_[a-zA-Z0-9]+\b/;

const titleFromRange = value => {
    const match = String(value || '').trim().match(/^(?:'((?:[^']|'')+)'|([^!]+))!/);
    return (match?.[1] || match?.[2] || '').replaceAll("''", "'").trim() || null;
};

const rangeForTitle = title => `'${String(title).replaceAll("'", "''")}'!A1`;
const nodeForStep = ({ step, workflow }) => (workflow?.nodes || []).find(node => node.id === step?.nodeId)
    || (workflow?.nodes || []).find(node => node.title && node.title === step?.name)
    || null;

export const explicitRunIdFromRequest = request => String(request || '').match(RUN_ID_PATTERN)?.[0] || null;

export const compactRunSummary = run => ({
    id: run?.id,
    status: run?.status,
    trigger: run?.trigger || null,
    createdAt: run?.createdAt || null,
    completedAt: run?.completedAt || null,
    durationMs: run?.durationMs ?? null,
    error: run?.error || null
});

/**
 * Convert one persisted run into a small, allowlisted diagnostic report. This
 * is intentionally independent from the AI pipeline so its evidence and fix
 * rules are deterministic and directly testable.
 */
export const buildRunDiagnosticReport = async ({ run, workflow, rangeLoader = async () => ({ options: [] }) } = {}) => {
    const executedWorkflow = run?.definitionSnapshot?.nodes ? { ...workflow, ...run.definitionSnapshot } : workflow;
    const failedStep = (run?.steps || []).find(step => step?.status === 'failed');
    const failedNode = nodeForStep({ step: failedStep, workflow: executedWorkflow });
    const currentNode = nodeForStep({ step: failedStep, workflow });
    const report = {
        run: compactRunSummary(run),
        failedStep: failedStep ? {
            nodeId: failedStep.nodeId || failedNode?.id || null,
            name: failedStep.name || failedNode?.title || 'Workflow step',
            subType: failedStep.subType || failedNode?.subType || null,
            errorCode: failedStep.errorCode || null,
            error: failedStep.details || run?.error || 'This step failed.'
        } : null,
        finding: null,
        fix: null,
        needsChoice: false
    };
    if (!failedStep || !failedNode) {
        report.finding = { code: 'RUN_FAILURE_NOT_MAPPED', confidence: 'unknown', summary: 'The failed step could not be matched to the workflow definition.' };
        return report;
    }
    if (run?.definitionSnapshot?.nodes && (!currentNode || JSON.stringify(currentNode.config || {}) !== JSON.stringify(failedNode.config || {}))) {
        report.finding = { code: 'RUN_CONTEXT_STALE', confidence: 'confirmed', summary: 'The workflow step has changed since this run, so Promptly will not propose a repair based on stale execution data.' };
        return report;
    }
    const errorText = `${failedStep.details || ''}\n${run?.error || ''}`;
    if (failedNode.subType !== 'googleSheets' || !/Unable to parse range|GOOGLE_SHEETS_ACTION_FAILED/i.test(errorText)) {
        report.finding = { code: 'WORKFLOW_RUN_FAILURE', confidence: 'confirmed', summary: failedStep.details || run?.error || `${failedNode.title || 'The workflow step'} failed.` };
        return report;
    }
    const configuredRange = failedNode.config?.range;
    const configuredTitle = titleFromRange(configuredRange);
    const resources = await rangeLoader({ spreadsheetId: failedNode.config?.spreadsheetId });
    const options = (resources?.options || []).filter(option => option?.value && option?.label);
    const matching = options.find(option => option.label === configuredTitle || titleFromRange(option.value) === configuredTitle);
    if (matching) {
        report.finding = { code: 'GOOGLE_SHEETS_RANGE_INVALID', confidence: 'confirmed', summary: `The Google Sheets range ${configuredRange} is not accepted by the connected spreadsheet.` };
        return report;
    }
    if (options.length === 1) {
        const range = options[0].value || rangeForTitle(options[0].label);
        report.finding = { code: 'GOOGLE_SHEETS_TAB_NOT_FOUND', confidence: 'confirmed', summary: `The workflow uses the ${configuredTitle || 'configured'} tab, but the connected spreadsheet has only ${options[0].label}.` };
        report.fix = { nodeId: failedNode.id, range, summary: `Use the ${options[0].label} tab for ${failedNode.title || 'the Google Sheets step'}.` };
        return report;
    }
    report.finding = { code: 'GOOGLE_SHEETS_TAB_NOT_FOUND', confidence: 'confirmed', summary: `The configured sheet tab ${configuredTitle || '(unknown)'} is not available in the connected spreadsheet.` };
    report.needsChoice = options.length > 1;
    return report;
};
