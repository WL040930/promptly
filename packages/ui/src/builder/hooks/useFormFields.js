import { useForm } from '../../api/hooks/useForms.js';

/**
 * Returns the field definitions for a specific form. The form list is kept
 * intentionally lightweight, so this shares the cached detail query instead.
 *
 * @param {string|null} formId
 * @returns {{ form: object|null, fields: Array, isLoading: boolean }}
 */
export function useFormFields(formId) {
  const { data: form = null, isLoading } = useForm(formId);

  if (!formId) {
    return { form: null, fields: [], isLoading: false };
  }

  const fields = (form?.fields ?? []).filter(
    (f) => !f.deleted && f.type !== 'heading'
  );

  return { form, fields, isLoading };
}
