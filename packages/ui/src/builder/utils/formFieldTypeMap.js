/**
 * Maps Promptly form field types to workflow variable types.
 * Used by getUpstreamOutputs to emit correctly-typed per-field tokens
 * when expanding a form-submission node's `fields` output.
 */
export const FORM_FIELD_TO_VAR_TYPE = {
  text:     'string',
  email:    'string',
  phone:    'string',
  url:      'string',
  textarea: 'string',
  date:     'string',
  time:     'string',
  select:   'string',
  radio:    'string',
  hidden:   'string',
  number:   'number',
  rating:   'number',
  checkbox: 'array',
  file:     'string',
  // 'heading' is a layout-only field — skipped during expansion
};

/**
 * Returns the variable type for a given form field type.
 * Falls back to 'string' for unknown types.
 */
export function varTypeForField(fieldType) {
  return FORM_FIELD_TO_VAR_TYPE[fieldType] ?? 'string';
}
