import { isEmptyFormMemorySummary } from '../../../../shared/formContract.js';

const meaningful = patch => patch?.op !== 'update_memory'
    || (patch.updates?.memory?.summary ? !isEmptyFormMemorySummary(patch.updates.memory.summary) : Boolean(patch.originalMemory));

/** Keep selection anchored to server-validated patch IDs, never display indexes. */
export const visibleFormPatches = (proposal = {}) => (proposal.patches || [])
    .map((patch, index) => ({ ...patch, patchId: patch.patchId || `patch_${index + 1}` }))
    .filter(meaningful);

export const selectedFormPatchIds = (patches = [], selected = {}) => patches
    .filter(patch => selected[patch.patchId])
    .map(patch => patch.patchId);
