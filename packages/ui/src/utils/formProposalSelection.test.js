import test from 'node:test';
import assert from 'node:assert/strict';
import { selectedFormPatchIds, visibleFormPatches } from '../components/chat/formProposalSelection.js';

test('form proposal selection remains correct when a hidden memory patch precedes visible changes', () => {
    const patches = visibleFormPatches({
        patches: [
            { patchId: 'memory', op: 'update_memory', updates: { memory: { summary: '' } } },
            { patchId: 'email', op: 'add', field: { id: 'email', type: 'email', label: 'Email' } }
        ]
    });

    assert.deepEqual(patches.map(patch => patch.patchId), ['email']);
    assert.deepEqual(selectedFormPatchIds(patches, { email: false }), []);
});
