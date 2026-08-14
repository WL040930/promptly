import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import NodeRegistry from './NodeRegistry.js';

test('node registry loads every node with a validated UI contract', async () => {
    await NodeRegistry.init({ nodesDir: path.resolve(process.cwd(), 'packages/nodes') });
    const catalogue = NodeRegistry.getCompactCatalogue();
    assert.equal(catalogue.length, 27);
    assert.ok(catalogue.every(node => node.nodeKey && Array.isArray(node.inputs) && Array.isArray(node.outputs)));
    assert.ok(catalogue.some(node => node.nodeKey === 'trigger:form-submission' && node.inputs.some(input => input.resource === 'forms')));
    assert.ok(catalogue.some(node => node.nodeKey === 'action:googleSheets' && node.inputs.some(input => input.resource === 'google-spreadsheets')));
    assert.ok(catalogue.some(node => node.nodeKey === 'logic:customCode' && node.implementationStatus === 'beta'));
    assert.ok(!catalogue.some(node => node.nodeKey === 'ai:image'));
    assert.ok(!catalogue.some(node => node.nodeKey === 'logic:loop'));
});
