import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRunDiagnosticReport, explicitRunIdFromRequest } from './runDiagnostics.js';

const failedRun = {
    id: 'run_9abd6fd35df14c769c136074fcc9f350', status: 'failed',
    error: "Unable to parse range: 'Sheet1'!A1",
    steps: [{ nodeId: 'sheets', name: 'Append Approved Registrations', status: 'failed', details: "Unable to parse range: 'Sheet1'!A1" }]
};
const workflow = { nodes: [{ id: 'sheets', title: 'Append Approved Registrations', subType: 'googleSheets', config: { spreadsheetId: 'sheet_1', range: "'Sheet1'!A1" } }] };

test('diagnoses a missing Google Sheets tab and produces only a confirmed repair', async () => {
    const report = await buildRunDiagnosticReport({
        run: failedRun, workflow,
        rangeLoader: async ({ spreadsheetId }) => {
            assert.equal(spreadsheetId, 'sheet_1');
            return { options: [{ label: 'Responses', value: "'Responses'!A1:Z1000" }] };
        }
    });
    assert.equal(report.finding.code, 'GOOGLE_SHEETS_TAB_NOT_FOUND');
    assert.deepEqual(report.fix, { nodeId: 'sheets', range: "'Responses'!A1:Z1000", summary: 'Use the Responses tab for Append Approved Registrations.' });
    assert.equal(report.needsChoice, false);
});

test('does not guess when several possible Google Sheets tabs exist', async () => {
    const report = await buildRunDiagnosticReport({
        run: failedRun, workflow,
        rangeLoader: async () => ({ options: [{ label: 'Responses', value: "'Responses'!A1" }, { label: 'Archive', value: "'Archive'!A1" }] })
    });
    assert.equal(report.fix, null);
    assert.equal(report.needsChoice, true);
});

test('refuses to repair a run when the current workflow has changed since execution', async () => {
    const report = await buildRunDiagnosticReport({
        run: { ...failedRun, definitionSnapshot: { nodes: workflow.nodes, edges: [] } },
        workflow: { nodes: [{ ...workflow.nodes[0], config: { ...workflow.nodes[0].config, range: "'Archive'!A1" } }] }
    });
    assert.equal(report.finding.code, 'RUN_CONTEXT_STALE');
    assert.equal(report.fix, null);
});

test('extracts an exact run reference without accepting prose as an identifier', () => {
    assert.equal(explicitRunIdFromRequest('Diagnose run_9abd6fd35df14c769c136074fcc9f350 please'), 'run_9abd6fd35df14c769c136074fcc9f350');
    assert.equal(explicitRunIdFromRequest('Diagnose the latest failure'), null);
});
