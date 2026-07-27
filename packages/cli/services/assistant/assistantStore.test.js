import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssistantStateView } from './assistantStore.js';

test('assistant state exposes the latest persisted progress for refresh recovery', async () => {
    const thread = {
        id: 'thread_1',
        userId: 'user_1',
        surface: 'form',
        formId: 'form_1',
        context: {},
        state: { version: 1, phase: 'processing', inFlightRequestId: 'request_1' },
        async update(patch) { Object.assign(this, patch); }
    };
    const state = createAssistantStateView(thread);

    await state.update({
        progress: {
            status: 'building',
            message: 'Preparing form changes…',
            updatedAt: '2026-07-27T10:00:00.000Z'
        }
    });

    assert.deepEqual(state.toJSON().progress, {
        status: 'building',
        message: 'Preparing form changes…',
        updatedAt: '2026-07-27T10:00:00.000Z'
    });
});
