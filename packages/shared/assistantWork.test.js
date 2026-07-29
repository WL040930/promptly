import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceAssistantWork, createAssistantWork, finishAssistantWork } from './assistantWork.js';

test('assistant work maps live progress into stable macro phases', () => {
    const start = createAssistantWork({ requestId: 'request_1', surface: 'workflow', title: 'Email respondents', now: new Date('2026-07-29T00:00:00.000Z') });
    const planned = advanceAssistantWork(start, { status: 'planning', message: 'Understanding the automation request' }, new Date('2026-07-29T00:00:01.000Z'));
    const drafted = advanceAssistantWork(planned, { status: 'building', message: 'Adding approval and email steps' }, new Date('2026-07-29T00:00:02.000Z'));
    assert.equal(planned.currentPhase, 'understand');
    assert.equal(drafted.currentPhase, 'draft');
    assert.equal(drafted.activities.at(-1).status, 'active');
    assert.equal(drafted.activities.at(-2).status, 'completed');
});

test('assistant work records dynamic repairs without inventing fixed steps', () => {
    const start = createAssistantWork({ requestId: 'request_1', surface: 'form' });
    const repaired = advanceAssistantWork(start, { status: 'repairing', message: 'Correcting invalid field references' }, new Date('2026-07-29T00:00:01.000Z'));
    assert.equal(repaired.currentPhase, 'draft');
    assert.match(repaired.activities.at(-1).label, /Correcting/i);
    assert.equal(repaired.activities.at(-1).attempt, 1);
});

test('assistant work renders the factual label and detail supplied by a pipeline', () => {
    const start = createAssistantWork({ requestId: 'request_1', surface: 'workflow' });
    const work = advanceAssistantWork(start, {
        status: 'checking', phase: 'check', label: 'Checking the workflow draft',
        message: 'Checking the proposal', detail: '2 proposed changes compiled into a valid workflow.'
    });
    assert.equal(work.currentPhase, 'check');
    assert.equal(work.activities.at(-1).label, 'Checking the workflow draft');
    assert.equal(work.activities.at(-1).detail, '2 proposed changes compiled into a valid workflow.');
});

test('assistant work closes the active activity at a terminal outcome', () => {
    const work = advanceAssistantWork(createAssistantWork({ requestId: 'request_1', surface: 'form' }), { status: 'checking', message: 'Checking the form' });
    const done = finishAssistantWork(work, { status: 'awaiting_review', detail: 'Ready to review' });
    assert.equal(done.status, 'awaiting_review');
    assert.equal(done.activities.at(-1).status, 'completed');
    assert.ok(done.completedAt);
});

test('assistant work keeps safe artifacts with the current activity', () => {
    const work = advanceAssistantWork(createAssistantWork({ requestId: 'request_1', surface: 'workflow' }), {
        id: 'workflow:planner:attempt:1', status: 'planning', phase: 'plan', label: 'Mapped the workflow request',
        artifact: { id: 'requirements', title: 'What Promptly understood', items: ['Start on form submission', 'Ask the owner for approval'] }
    });
    assert.equal(work.currentArtifact.title, 'What Promptly understood');
    assert.deepEqual(work.currentArtifact.items, ['Start on form submission', 'Ask the owner for approval']);
    assert.equal(work.artifacts.length, 1);
});
