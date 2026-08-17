import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import VariablePickerModal from '../modals/VariablePickerModal';
import VariableTokenPreview from './VariableTokenPreview.jsx';
import { isWorkflowExpression, workflowExpressionToLegacyText } from '../../../../../shared/workflowExpressions.js';
import { descriptorRuntimePath, normalizeEditorWorkflowValue } from '../../utils/workflowReferenceInput.js';

const TokenPreview = ({ value, availableVars = [], className, onClick }) => (
  <div
    className={`flex min-h-[38px] cursor-text flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 ${className || ''}`}
    onClick={onClick}
  >
    {value ? <VariableTokenPreview value={value} availableVars={availableVars} className="text-sm text-slate-800" /> : <span className="select-none text-sm text-slate-400">Click to type or insert variables...</span>}
  </div>
);

const hasUnfinishedLegacyToken = value => {
  const text = String(value || '');
  return text.lastIndexOf('{{') > text.lastIndexOf('}}');
};

/* ─── VariableInput ──────────────────────────────────────────────────────── */
/**
 * A smart text/textarea input that lets users insert upstream values from a
 * dropdown picker. Workflow-expression fields persist structured expressions;
 * node-template fields retain their node-owned text-template behavior.
 */
const VariableInput = ({
  value = '',
  onChange,
  placeholder,
  multiline = false,
  availableVars = [],
  rows = 4,
  valueSyntax,
}) => {
  const valueKey = typeof value === 'string' ? value : JSON.stringify(value || null);
  const canonicalField = valueSyntax === 'workflow-expression';
  const editableValue = canonicalField && isWorkflowExpression(value)
    ? workflowExpressionToLegacyText(value)
    : value === undefined || value === null ? '' : String(value);
  const [draftValue, setDraftValue] = useState(editableValue);
  const [inputError, setInputError] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const textValue = draftValue;
  const isExpression = isWorkflowExpression(value);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const cursorRef = useRef(null);

  useEffect(() => {
    setDraftValue(editableValue);
    setInputError(null);
  }, [valueKey, editableValue]);

  useEffect(() => {
    const handler = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setIsFocused(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const saveCursor = useCallback(() => {
    if (inputRef.current) cursorRef.current = inputRef.current.selectionStart ?? textValue.length;
  }, [textValue]);

  const commitDraft = useCallback((nextValue) => {
    setDraftValue(nextValue);
    if (!canonicalField) {
      setInputError(null);
      onChange?.(nextValue);
      return;
    }
    // Keep an incomplete token local while the user is typing. Autosave must
    // never receive the temporary legacy text; completed tokens are
    // normalized below before the parent is notified.
    if (hasUnfinishedLegacyToken(nextValue)) {
      setInputError(null);
      return;
    }
    const normalized = normalizeEditorWorkflowValue({ value: nextValue, availableVars, path: 'config.value' });
    if (normalized.issues.length > 0) {
      setInputError(normalized.issues[0].message);
      return;
    }
    setInputError(null);
    onChange?.(normalized.value);
  }, [availableVars, canonicalField, onChange]);

  const insertToken = useCallback((selection) => {
    const runtimePath = descriptorRuntimePath(selection);
    if (!runtimePath) return;
    const token = `{{${runtimePath}}}`;
    const pos = cursorRef.current ?? textValue.length;
    const newValue = textValue.substring(0, pos) + token + textValue.substring(pos);

    commitDraft(newValue);
    cursorRef.current = pos + token.length;
    setIsFocused(true);
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(cursorRef.current, cursorRef.current);
      }
    }, 0);
  }, [commitDraft, textValue]);

  const inputClass = 'w-full bg-slate-50 border border-slate-200 rounded-lg text-slate-800 px-3 py-2 outline-none text-sm font-medium focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all shadow-inner resize-none pr-9';
  const hasVars = availableVars.length > 0 && ['workflow-expression', 'node-template'].includes(valueSyntax);
  const hasTokens = isExpression || /\{\{[^}]+\}\}/.test(textValue);
  const showRealInput = isFocused || !hasTokens;
  const inputProps = {
    ref: inputRef,
    value: textValue,
    placeholder,
    className: inputClass,
    'aria-invalid': Boolean(inputError),
    onChange: event => commitDraft(event.target.value),
    onSelect: saveCursor,
    onKeyUp: saveCursor,
    onClick: saveCursor,
    onFocus: () => setIsFocused(true),
    onBlur: () => {
      if (canonicalField && hasUnfinishedLegacyToken(textValue)) {
        setInputError('Finish or remove the workflow reference before leaving this field.');
      }
    }
  };

  return (
    <div ref={containerRef} className="relative flex flex-col gap-1.5">
      <div className="relative">
        {!showRealInput && (
          <TokenPreview
            value={value}
            availableVars={availableVars}
            className="w-full pr-9 overflow-y-auto"
            onClick={() => {
              setIsFocused(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
          />
        )}

        <div className={showRealInput ? 'block' : 'hidden'}>
          {multiline ? <textarea {...inputProps} rows={rows} /> : <input {...inputProps} type="text" />}
        </div>

        {hasVars && (
          <button
            type="button"
            onMouseDown={(event) => {
              event.preventDefault();
              saveCursor();
              setPickerOpen(open => !open);
            }}
            title="Insert variable"
            className={`absolute right-2 top-2 flex items-center justify-center w-5 h-5 rounded text-[11px] font-black transition-all select-none ${pickerOpen ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'}`}
          >
            {'{}'}
          </button>
        )}
      </div>

      {inputError && <p className="px-1 text-[11px] font-semibold leading-4 text-amber-700">{inputError}</p>}

      {pickerOpen && createPortal(
        <VariablePickerModal
          isOpen={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={selection => insertToken(selection)}
          availableVars={availableVars}
        />,
        document.body
      )}
    </div>
  );
};

export default VariableInput;
