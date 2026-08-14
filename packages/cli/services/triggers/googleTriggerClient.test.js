import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import env from '../../config/env.js';
import { createGoogleClientForUser, requirePublicTriggerOrigin } from './googleTriggerClient.js';

const createModels = connection => ({
    User: { findByPk: async id => ({ id }) },
    Connection: { findOne: async () => connection }
});

class FakeOAuth2Client extends EventEmitter {
    static instances = [];

    constructor() {
        super();
        this.credentials = {};
        this.refreshes = 0;
        FakeOAuth2Client.instances.push(this);
    }

    setCredentials(credentials) {
        this.credentials = credentials;
    }

    async refreshAccessToken() {
        this.refreshes += 1;
        this.credentials = {
            ...this.credentials,
            access_token: 'fresh_access_token',
            expiry_date: Date.parse('2026-08-13T00:00:00.000Z')
        };
        this.emit('tokens', this.credentials);
        return { credentials: this.credentials };
    }
}

test('restores a persisted Google token expiry into the OAuth client', async () => {
    FakeOAuth2Client.instances = [];
    const connection = {
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        tokenExpiresAt: new Date('2026-08-13T01:00:00.000Z'),
        updates: [],
        async update(patch) { this.updates.push(patch); Object.assign(this, patch); }
    };

    const getGoogleClient = createGoogleClientForUser({ models: createModels(connection), OAuth2ClientClass: FakeOAuth2Client });
    const { client } = await getGoogleClient('user_1');

    assert.equal(client.credentials.expiry_date, connection.tokenExpiresAt.getTime());
    assert.equal(client.refreshes, 0);
});

test('refreshes and persists a legacy Google token before provider writes can be replayed', async () => {
    FakeOAuth2Client.instances = [];
    const connection = {
        accessToken: 'old_access_token',
        refreshToken: 'refresh_token',
        tokenExpiresAt: null,
        updates: [],
        async update(patch) { this.updates.push(patch); Object.assign(this, patch); }
    };

    const getGoogleClient = createGoogleClientForUser({ models: createModels(connection), OAuth2ClientClass: FakeOAuth2Client });
    const { client } = await getGoogleClient('user_1');

    assert.equal(client.refreshes, 1);
    assert.equal(client.credentials.access_token, 'fresh_access_token');
    assert.equal(client.credentials.expiry_date, Date.parse('2026-08-13T00:00:00.000Z'));
    assert.equal(connection.accessToken, 'fresh_access_token');
    assert.equal(connection.tokenExpiresAt.toISOString(), '2026-08-13T00:00:00.000Z');
});

test('reports the required public callback setup when Google triggers run without one', () => {
    const previousOrigin = env.app.publicOrigin;
    env.app.publicOrigin = null;
    try {
        assert.throws(() => requirePublicTriggerOrigin(), error => {
            assert.equal(error.code, 'TRIGGER_PUBLIC_ORIGIN_REQUIRED');
            assert.equal(error.status, 503);
            assert.match(error.message, /TRIGGER_PUBLIC_ORIGIN/);
            assert.match(error.message, /public HTTPS callback URL/);
            return true;
        });
    } finally {
        env.app.publicOrigin = previousOrigin;
    }
});
