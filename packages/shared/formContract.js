export const FORM_FIELD_TYPES = Object.freeze([
    'text',
    'email',
    'number',
    'phone',
    'url',
    'textarea',
    'select',
    'radio',
    'checkbox',
    'date',
    'time',
    'file',
    'rating',
    'heading',
    'hidden'
]);

export const FORM_CHOICE_FIELD_TYPES = Object.freeze(['select', 'radio', 'checkbox']);
export const FORM_PATCH_OPERATIONS = Object.freeze(['add', 'update', 'remove', 'update_meta', 'update_memory']);

export const FORM_AI_MEMORY_LIMIT = 1500;
export const FORM_MAX_FIELDS = 100;
export const FORM_MAX_PATCHES = 100;
export const FORM_MAX_TEXT_LENGTH = 10000;

export const isFormFieldType = (type) => FORM_FIELD_TYPES.includes(type);
export const isChoiceFieldType = (type) => FORM_CHOICE_FIELD_TYPES.includes(type);
export const isFormPatchOperation = (operation) => FORM_PATCH_OPERATIONS.includes(operation);

