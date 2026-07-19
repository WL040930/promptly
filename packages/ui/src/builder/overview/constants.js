export const MODAL_TYPES = {
    EDIT_WORKFLOW_PROPERTIES: 'EDIT_WORKFLOW_PROPERTIES'
};

export const MODAL_CONFIG = {
    [MODAL_TYPES.EDIT_WORKFLOW_PROPERTIES]: {
        title: 'Edit Automation Properties',
        confirmLabel: 'Save Changes',
        showInput: false,
        showProperties: true,
        isDestructive: false
    }
};
