import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryTypes } from 'sequelize';
import {
    TRIGGER_EVENT_CLAIM_SQL,
    WAIT_CONTINUATION_CLAIM_SQL,
    claimQueueRow
} from './queueClaim.js';

const assertAtomicClaim = query => {
    assert.match(query, /FOR UPDATE SKIP LOCKED/);
    assert.match(query, /UPDATE/);
    assert.match(query, /RETURNING/);
};

test('queue claim SQL atomically locks and updates a trigger event', () => {
    assertAtomicClaim(TRIGGER_EVENT_CLAIM_SQL);
    assert.match(TRIGGER_EVENT_CLAIM_SQL, /status = 'processing'/);
    assert.match(TRIGGER_EVENT_CLAIM_SQL, /attempts = event\.attempts \+ 1/);
});

test('queue claim SQL atomically locks and updates a wait continuation', () => {
    assertAtomicClaim(WAIT_CONTINUATION_CLAIM_SQL);
    assert.match(WAIT_CONTINUATION_CLAIM_SQL, /status = 'resuming'/);
});

test('claimQueueRow uses one query and returns a persisted model instance', async () => {
    const row = { id: 'row_1', status: 'processing' };
    const calls = [];
    const built = { id: 'row_1', update: async () => {} };
    const model = {
        sequelize: {
            query: async (...args) => {
                calls.push(args);
                return [row];
            }
        },
        build: (values, options) => {
            assert.deepEqual(values, row);
            assert.deepEqual(options, { isNewRecord: false });
            return built;
        }
    };

    const result = await claimQueueRow({ model, query: TRIGGER_EVENT_CLAIM_SQL });
    assert.strictEqual(result, built);
    assert.equal(calls.length, 1);
    assert.equal(calls[0][1].type, QueryTypes.SELECT);
});

test('claimQueueRow returns null without opening a transaction when the queue is empty', async () => {
    let queryCalls = 0;
    const model = {
        sequelize: {
            query: async () => {
                queryCalls += 1;
                return [];
            }
        },
        build: () => assert.fail('an empty claim must not build a model')
    };

    assert.equal(await claimQueueRow({ model, query: WAIT_CONTINUATION_CLAIM_SQL }), null);
    assert.equal(queryCalls, 1);
});
