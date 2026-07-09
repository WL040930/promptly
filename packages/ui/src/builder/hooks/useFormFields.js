import { useForms } from '../../api/hooks/useForms.js';

/**
 * Returns the field definitions for a specific form by reading from the
 * already-cached useForms() query — no extra network request.
 *
 * @param {string|null} formId
 * @returns {{ form: object|null, fields: Array, isLoading: boolean }}
 */
export function useFormFields(formId) {
  const { data: forms = [], isLoading } = useForms();

  if (!formId) {
    return { form: null, fields: [], isLoading: false };
  }

  const form = forms.find((f) => f.id === formId) ?? null;
  const fields = (form?.fields ?? []).filter(
    (f) => !f.deleted && f.type !== 'heading'
  );

  return { form, fields, isLoading };
}
