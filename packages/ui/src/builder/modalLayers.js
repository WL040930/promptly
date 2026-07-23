// Keep workflow-editor overlays ordered in one place. Higher layers are
// reserved for dialogs opened from an already-open dialog.
export const WORKFLOW_MODAL_LAYERS = Object.freeze({
    config: 100000,
    nested: 100100,
    testRun: 100200,
    confirm: 100300,
});
