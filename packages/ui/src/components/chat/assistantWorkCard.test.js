import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

test('preparation summary does not use the capped activity list as workflow step count', async () => {
    const file = fileURLToPath(new URL('./AssistantWorkCard.jsx', import.meta.url));
    const source = await readFile(file, 'utf8');

    assert.match(source, /const workflowStepCount =/);
    assert.match(source, /workflowStepCount \? `\$\{workflowStepCount\} workflow/);
    assert.match(source, /repair \$\{repairCount === 1 \? 'update' : 'updates'\}/);
    assert.doesNotMatch(source, /`\$\{activities\.length\} \$\{activities\.length === 1 \? 'step' : 'steps'\}`/);
    assert.match(source, /role="progressbar"/);
    assert.match(source, /aria-valuenow=\{progressPercent\}/);
    assert.match(source, /const progressFor =/);
    assert.match(source, /defaultExpanded=\{!isTerminal\} label="Proposal progress"/);
    assert.match(source, /setExpanded\(defaultExpanded\);/);
});
