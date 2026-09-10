import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import NodeRegistry from './NodeRegistry.js';

test('node registry loads every node with a validated UI contract', async () => {
    await NodeRegistry.init({ nodesDir: path.resolve(process.cwd(), 'packages/nodes') });
    const catalogue = NodeRegistry.getCompactCatalogue();
    assert.equal(catalogue.length, 25);
    assert.ok(catalogue.every(node => node.nodeKey && Array.isArray(node.inputs) && Array.isArray(node.outputs)));
    assert.ok(catalogue.some(node => node.nodeKey === 'trigger:form-submission' && node.inputs.some(input => input.resource === 'forms')));
    assert.ok(catalogue.some(node => node.nodeKey === 'action:googleSheets' && node.inputs.some(input => input.resource === 'google-spreadsheets')));
    assert.ok(catalogue.some(node => node.nodeKey === 'logic:filterRows' && node.inputs.some(input => input.name === 'filters')));
    assert.ok(catalogue.some(node => node.nodeKey === 'logic:customCode' && node.implementationStatus === 'beta'));
    assert.ok(!catalogue.some(node => node.nodeKey === 'ai:transcribe'));
    assert.ok(!catalogue.some(node => node.nodeKey === 'ai:image'));
    assert.ok(!catalogue.some(node => node.nodeKey === 'logic:loop'));
    assert.ok(!catalogue.some(node => node.nodeKey === 'trigger:database'));
    assert.ok(!catalogue.some(node => node.nodeKey === 'trigger:email'));
    const libraryItems = NodeRegistry.getUiLibrary().flatMap(section => section.groups.flatMap(group => group.items));
    assert.equal(libraryItems.find(node => node.nodeKey === 'trigger:database')?.implementationStatus, 'disabled');
    assert.equal(libraryItems.find(node => node.nodeKey === 'trigger:email')?.implementationStatus, 'disabled');
});
