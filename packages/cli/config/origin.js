const allowedProtocols = new Set(['http:', 'https:']);

/**
 * Converts an environment value into a URL origin.
 *
 * Origin settings intentionally do not accept paths, query strings, or
 * fragments. Callers append their own route paths so that URL composition is
 * kept in one place and trailing slashes cannot leak into generated URLs.
 */
export const normalizeOrigin = (value, key = 'origin') => {
    const rawValue = String(value ?? '').trim();
    if (!rawValue) return null;

    let parsed;
    try {
        parsed = new URL(rawValue);
    } catch {
        throw new Error(`${key} must be a valid http(s) origin, received: ${rawValue}`);
    }

    const hasCredentials = parsed.username || parsed.password;
    const hasPath = parsed.pathname !== '/';
    const hasQueryOrFragment = parsed.search || parsed.hash;
    if (!allowedProtocols.has(parsed.protocol) || hasCredentials || hasPath || hasQueryOrFragment) {
        throw new Error(`${key} must contain only a scheme, host, and optional port (for example https://example.com).`);
    }

    return parsed.origin;
};
