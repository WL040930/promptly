import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFormReviewEntries } from './continuationService.js';

test('approval review data shows one friendly entry when legacy and canonical form keys are both present', () => {
    const fields = [
        { id: 'f_name', type: 'text', label: 'Name' },
        { id: 'f_email', type: 'email', label: 'Email' },
        { id: 'f_attendance_mode', type: 'select', label: 'Attendance Mode' },
        { id: 'f_selected_session', type: 'select', label: 'Selected Session' }
    ];
    const values = {
        name: 'Lim',
        f_name: 'Lim',
        email: 'limweilun3838@gmail.com',
        f_email: 'limweilun3838@gmail.com',
        attendanceMode: 'Online',
        f_attendance_mode: 'Online',
        selectedSession: 'Workshop A',
        f_selected_session: 'Workshop A'
    };

    const entries = normalizeFormReviewEntries({ fields, values });

    assert.deepEqual(entries.map(entry => [entry.id, entry.label, entry.value]), [
        ['f_name', 'Name', 'Lim'],
        ['f_email', 'Email', 'limweilun3838@gmail.com'],
        ['f_attendance_mode', 'Attendance Mode', 'Online'],
        ['f_selected_session', 'Selected Session', 'Workshop A']
    ]);
});

test('approval review data still collapses f-prefixed aliases when the form snapshot is unavailable', () => {
    const entries = normalizeFormReviewEntries({
        fields: [],
        values: {
            name: 'Lim',
            f_name: 'Lim',
            attendanceMode: 'Online',
            f_attendance_mode: 'Online'
        }
    });

    assert.deepEqual(entries.map(entry => [entry.label, entry.value]), [
        ['Name', 'Lim'],
        ['Attendance Mode', 'Online']
    ]);
});
