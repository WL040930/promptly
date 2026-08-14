import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSettingsTab, requestSettingsModal, settingsModalDetail } from './settingsModal.js';

test('settings modal requests stay within the supported account tabs', () => {
    assert.deepEqual(settingsModalDetail('connections'), { tab: 'connections' });
    assert.deepEqual(settingsModalDetail('unknown'), { tab: 'general' });
    assert.equal(normalizeSettingsTab('connections'), 'connections');
    assert.equal(normalizeSettingsTab('general'), 'general');
});

test('settings modal requests dispatch an in-place event without changing the route', () => {
    const events = [];
    class FakeCustomEvent {
        constructor(type, init) {
            this.type = type;
            this.detail = init.detail;
        }
    }
    const target = {
        CustomEvent: FakeCustomEvent,
        dispatchEvent(event) {
            events.push(event);
            return true;
        }
    };

    assert.equal(requestSettingsModal('connections', target), true);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'promptly:open-settings-modal');
    assert.deepEqual(events[0].detail, { tab: 'connections' });
});
