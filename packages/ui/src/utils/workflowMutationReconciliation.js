const REQUEST_ONLY_KEYS = new Set(['expectedRevision', 'source', 'summary']);
const SERVER_METADATA_KEYS = ['revision', 'updatedAt', 'release'];

const sameValue = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

/** Fields owned by the client request rather than the persisted workflow. */
export const workflowMutationFields = data => Object.fromEntries(
    Object.entries(data || {}).filter(([key]) => !REQUEST_ONLY_KEYS.has(key))
);

/**
 * Applies a server response without allowing an older request to replace a
 * newer optimistic edit that has already reached the cache.
 */
export const reconcileWorkflowMutationSuccess = ({ current, server, submitted }) => {
    if (!current) return server || current;
    if (!server) return current;

    const next = { ...current };
    for (const [key, submittedValue] of Object.entries(submitted || {})) {
        if (sameValue(current[key], submittedValue) && hasOwn(server, key)) {
            next[key] = server[key];
        }
    }

    const currentRevision = Number(current.revision);
    const serverRevision = Number(server.revision);
    const acceptServerMetadata = !Number.isFinite(serverRevision)
        || !Number.isFinite(currentRevision)
        || serverRevision >= currentRevision;
    if (acceptServerMetadata) {
        SERVER_METADATA_KEYS.forEach(key => {
            if (hasOwn(server, key)) next[key] = server[key];
        });
    }
    return next;
};

/** Rolls back only values that have not been superseded by a later local edit. */
export const reconcileWorkflowMutationFailure = ({ current, previous, submitted }) => {
    if (!current) return previous || current;
    if (!previous) return current;

    const next = { ...current };
    for (const [key, submittedValue] of Object.entries(submitted || {})) {
        if (!sameValue(current[key], submittedValue)) continue;
        if (hasOwn(previous, key)) next[key] = previous[key];
        else delete next[key];
    }
    return next;
};
