import { getGoogleClientForUser } from './googleTriggerClient.js';

export const GOOGLE_SPREADSHEET_SCOPES = Object.freeze([
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/spreadsheets'
]);

const DRIVE_HEALTH_URL = 'https://www.googleapis.com/drive/v3/files?';

const normalizedScopes = scopes => Array.isArray(scopes)
    ? scopes.map(scope => String(scope || '').trim()).filter(Boolean)
    : [];

const tokenInfoScopes = tokenInfo => {
    const scopes = tokenInfo?.scopes ?? tokenInfo?.scope;
    if (Array.isArray(scopes)) return normalizedScopes(scopes);
    if (typeof scopes === 'string') return normalizedScopes(scopes.split(/\s+/));
    return [];
};

const hasScope = (scopes, requiredScope) => {
    if (scopes.includes(requiredScope)) return true;
    // A full Drive grant includes drive.file, while drive.readonly does not
    // permit Promptly to create a spreadsheet.
    return requiredScope === 'https://www.googleapis.com/auth/drive.file'
        && scopes.includes('https://www.googleapis.com/auth/drive');
};

const errorStatus = error => Number(error?.response?.status || error?.code || 0);

const baseStatus = ({ connection, status, healthy, requiresReconnect, reason = null, missingScopes = [] }) => ({
    provider: 'google',
    connected: true,
    healthy,
    status,
    requiresReconnect,
    accountEmail: connection?.accountEmail || null,
    ...(reason ? { reason } : {}),
    ...(missingScopes.length ? { missingScopes } : {})
});

/**
 * Checks the connection that is already stored for a user without exposing
 * access or refresh tokens. The Drive probe is intentionally small and uses
 * the same OAuth client as spreadsheet provisioning, so an expired token can
 * be refreshed before the user starts an automation.
 */
export const createGoogleConnectionHealthChecker = ({
    getGoogleClient = getGoogleClientForUser,
    requiredScopes = GOOGLE_SPREADSHEET_SCOPES
} = {}) => async ({ userId, connection } = {}) => {
    if (!connection || connection.status !== 'active') {
        return {
            provider: 'google',
            connected: false,
            healthy: false,
            status: 'not_connected',
            requiresReconnect: false,
            accountEmail: null
        };
    }

    if (!connection.accessToken) {
        return baseStatus({
            connection,
            status: 'needs_reconnect',
            healthy: false,
            requiresReconnect: true,
            reason: 'connection_unavailable'
        });
    }

    let client;
    let liveConnection = connection;
    try {
        const result = await getGoogleClient(userId);
        client = result?.client;
        liveConnection = result?.connection || connection;
        if (!client?.request) throw new Error('Google client is unavailable.');
    } catch {
        return baseStatus({
            connection,
            status: 'needs_reconnect',
            healthy: false,
            requiresReconnect: true,
            reason: 'connection_unavailable'
        });
    }

    try {
        await client.request({
            url: `${DRIVE_HEALTH_URL}q=trashed%3Dfalse&fields=files(id)&pageSize=1`,
            method: 'GET'
        });
    } catch (error) {
        const status = errorStatus(error);
        if ([401, 403].includes(status)) {
            return baseStatus({
                connection: liveConnection,
                status: 'needs_reconnect',
                healthy: false,
                requiresReconnect: true,
                reason: 'google_rejected'
            });
        }
        // A transient Google/network failure should not interrupt every app
        // entry. The next focus or mount will retry the health check.
        return baseStatus({
            connection: liveConnection,
            status: 'check_unavailable',
            healthy: null,
            requiresReconnect: false,
            reason: 'temporary_error'
        });
    }

    let scopes = normalizedScopes(liveConnection.scopes || connection.scopes);
    if (scopes.length === 0 && typeof client.getTokenInfo === 'function') {
        try {
            const accessToken = client.credentials?.access_token || liveConnection.accessToken || connection.accessToken;
            const tokenInfo = await client.getTokenInfo(accessToken);
            scopes = tokenInfoScopes(tokenInfo);
            if (scopes.length === 0) {
                return baseStatus({
                    connection: liveConnection,
                    status: 'check_unavailable',
                    healthy: null,
                    requiresReconnect: false,
                    reason: 'scope_check_unavailable'
                });
            }
        } catch (error) {
            if ([401, 403].includes(errorStatus(error))) {
                return baseStatus({
                    connection: liveConnection,
                    status: 'needs_reconnect',
                    healthy: false,
                    requiresReconnect: true,
                    reason: 'google_rejected'
                });
            }
            return baseStatus({
                connection: liveConnection,
                status: 'check_unavailable',
                healthy: null,
                requiresReconnect: false,
                reason: 'scope_check_unavailable'
            });
        }
    }

    // Older connections may not have scopes stored. If token metadata is not
    // available, the successful Drive probe still proves the saved token is
    // usable, so avoid interrupting the user with a false reconnect prompt.
    const missingScopes = requiredScopes.filter(scope => !hasScope(scopes, scope));
    if (missingScopes.length > 0) {
        return baseStatus({
            connection: liveConnection,
            status: 'needs_reconnect',
            healthy: false,
            requiresReconnect: true,
            reason: 'missing_scopes',
            missingScopes
        });
    }

    return baseStatus({
        connection: liveConnection,
        status: 'healthy',
        healthy: true,
        requiresReconnect: false
    });
};

export default createGoogleConnectionHealthChecker();
