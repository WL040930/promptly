import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleConnectionHealthChecker, GOOGLE_SPREADSHEET_SCOPES } from './googleConnectionHealth.js';

const connection = {
    status: 'active',
    accessToken: 'access_token',
    accountEmail: 'owner@example.com',
    scopes: [...GOOGLE_SPREADSHEET_SCOPES]
};

test('Google health check reports a healthy spreadsheet connection without exposing tokens', async () => {
    const calls = [];
    const check = createGoogleConnectionHealthChecker({
        getGoogleClient: async () => ({
            connection,
            client: { request: async request => { calls.push(request); return { data: { files: [] } }; } }
        })
    });

    const result = await check({ userId: 'user_1', connection });

    assert.deepEqual(result, {
        provider: 'google',
        connected: true,
        healthy: true,
        status: 'healthy',
        requiresReconnect: false,
        accountEmail: 'owner@example.com'
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'GET');
    assert.doesNotMatch(JSON.stringify(result), /access_token/);
});

test('Google health check asks for reconnect when the spreadsheet probe returns 401/403', async () => {
    for (const status of [401, 403]) {
        const check = createGoogleConnectionHealthChecker({
            getGoogleClient: async () => ({
                connection,
                client: { request: async () => { const error = new Error('Google rejected the token.'); error.response = { status }; throw error; } }
            })
        });

        const result = await check({ userId: 'user_1', connection });

        assert.equal(result.status, 'needs_reconnect');
        assert.equal(result.requiresReconnect, true);
        assert.equal(result.reason, 'google_rejected');
    }
});

test('Google health check detects missing spreadsheet scopes after a successful probe', async () => {
    const check = createGoogleConnectionHealthChecker({
        getGoogleClient: async () => ({
            connection: { ...connection, scopes: ['https://www.googleapis.com/auth/drive.readonly'] },
            client: { request: async () => ({ data: { files: [] } }) }
        })
    });

    const result = await check({ userId: 'user_1', connection });

    assert.equal(result.status, 'needs_reconnect');
    assert.equal(result.reason, 'missing_scopes');
    assert.deepEqual(result.missingScopes, GOOGLE_SPREADSHEET_SCOPES);
});

test('Google health check reads scopes from Google for legacy connections', async () => {
    const legacyConnection = { ...connection, scopes: [] };
    const check = createGoogleConnectionHealthChecker({
        getGoogleClient: async () => ({
            connection: legacyConnection,
            client: {
                credentials: { access_token: 'fresh_access_token' },
                request: async () => ({ data: { files: [] } }),
                getTokenInfo: async accessToken => {
                    assert.equal(accessToken, 'fresh_access_token');
                    return { scopes: GOOGLE_SPREADSHEET_SCOPES };
                }
            }
        })
    });

    const result = await check({ userId: 'user_1', connection: legacyConnection });

    assert.equal(result.status, 'healthy');
    assert.equal(result.requiresReconnect, false);
});

test('Google health check does not interrupt when scope metadata is temporarily unavailable', async () => {
    const legacyConnection = { ...connection, scopes: [] };
    const check = createGoogleConnectionHealthChecker({
        getGoogleClient: async () => ({
            connection: legacyConnection,
            client: {
                request: async () => ({ data: { files: [] } }),
                getTokenInfo: async () => { throw new Error('Google metadata unavailable.'); }
            }
        })
    });

    const result = await check({ userId: 'user_1', connection: legacyConnection });

    assert.equal(result.status, 'check_unavailable');
    assert.equal(result.healthy, null);
    assert.equal(result.requiresReconnect, false);
});

test('Google health check does not interrupt users who have no connection', async () => {
    const check = createGoogleConnectionHealthChecker({ getGoogleClient: async () => { throw new Error('should not run'); } });

    const result = await check({ userId: 'user_1', connection: null });

    assert.deepEqual(result, {
        provider: 'google',
        connected: false,
        healthy: false,
        status: 'not_connected',
        requiresReconnect: false,
        accountEmail: null
    });
});
