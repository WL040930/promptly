import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutWorkflow } from './workflowLayout.js';

test('respect-pins preserves legacy and explicitly pinned node positions', () => {
    const nodes = [
        { id: 'trigger', position: { x: 120, y: 300 } },
        { id: 'email', layoutPinned: false, position: { x: 400, y: 300 } }
    ];
    const result = layoutWorkflow({ nodes, edges: [{ source: 'trigger', target: 'email' }] });
    assert.deepEqual(result[0].position, { x: 120, y: 300 });
    assert.notDeepEqual(result[1].position, result[0].position);
});

test('full layout is stable and ignores pin metadata', () => {
    const nodes = [
        { id: 'trigger', layoutPinned: true, position: { x: 999, y: 999 } },
        { id: 'email', layoutPinned: true, position: { x: 1, y: 1 } }
    ];
    const result = layoutWorkflow({ nodes, edges: [{ source: 'trigger', target: 'email' }], mode: 'all' });
    assert.deepEqual(result.map(node => node.position), [{ x: 50, y: 200 }, { x: 400, y: 200 }]);
});
