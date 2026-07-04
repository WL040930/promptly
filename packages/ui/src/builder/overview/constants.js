// Modal type identifiers for the workflow overview actions
export const MODAL_TYPES = {
    NEW_FOLDER: 'NEW_FOLDER',
    NEW_WORKFLOW: 'NEW_WORKFLOW',
    RENAME_FOLDER: 'RENAME_FOLDER',
    RENAME_WORKFLOW: 'RENAME_WORKFLOW',
    EDIT_WORKFLOW_PROPERTIES: 'EDIT_WORKFLOW_PROPERTIES',
    DELETE_FOLDER: 'DELETE_FOLDER',
    DELETE_WORKFLOW: 'DELETE_WORKFLOW'
};

// Modal display configuration keyed by MODAL_TYPES
export const MODAL_CONFIG = {
    [MODAL_TYPES.NEW_FOLDER]: {
        title: 'Create Root Folder',
        confirmLabel: 'Create',
        placeholder: 'e.g. Sales Automations',
        showInput: true,
        isDestructive: false
    },
    [MODAL_TYPES.NEW_WORKFLOW]: {
        title: 'Create New Workflow',
        confirmLabel: 'Create',
        placeholder: 'e.g. Welcome Email',
        showInput: true,
        isDestructive: false
    },
    [MODAL_TYPES.RENAME_FOLDER]: {
        title: 'Rename Folder',
        confirmLabel: 'Save',
        placeholder: 'Folder name',
        showInput: true,
        isDestructive: false
    },
    [MODAL_TYPES.RENAME_WORKFLOW]: {
        title: 'Rename Workflow',
        confirmLabel: 'Save',
        placeholder: 'Workflow name',
        showInput: true,
        isDestructive: false
    },
    [MODAL_TYPES.EDIT_WORKFLOW_PROPERTIES]: {
        title: 'Edit Workflow Properties',
        confirmLabel: 'Save Changes',
        showInput: false,
        showProperties: true,
        isDestructive: false
    },
    [MODAL_TYPES.DELETE_FOLDER]: {
        title: 'Confirm Deletion',
        confirmLabel: 'Delete',
        showInput: false,
        isDestructive: true,
        message: 'Are you sure you want to delete this folder? All child folders and workflows inside it will be permanently deleted.'
    },
    [MODAL_TYPES.DELETE_WORKFLOW]: {
        title: 'Confirm Deletion',
        confirmLabel: 'Delete',
        showInput: false,
        isDestructive: true,
        message: 'Are you sure you want to delete this workflow? This action cannot be undone.'
    }
};
