import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import VariablePickerModal from '../modals/VariablePickerModal';
import VariableTokenPreview from './VariableTokenPreview.jsx';
import { isWorkflowExpression } from '../../../../../shared/workflowExpressions.js';

const TokenPreview = ({ value, availableVars = [], className, onClick }) => (
  <div
    className={`flex min-h-[38px] cursor-text flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 ${className || ''}`}
    onClick={onClick}
  >
    {value ? <VariableTokenPreview value={value} availableVars={availableVars} className="text-sm text-slate-800" /> : <span className="select-none text-sm text-slate-400">Click to type or insert variables...</span>}
  </div>
);

/* ─── VariableInput ──────────────────────────────────────────────────────── */
/**
 * A smart text/textarea input that lets users insert {{nodeId.field}} tokens
 * from a dropdown picker.
 *
 * Props:
 *   value         — controlled string value
 *   onChange      — (newValue: string) => void
 *   placeholder   — optional placeholder text
 *   multiline     — if true, renders a <textarea> instead of <input>
 *   availableVars — array from getUpstreamOutputs()
 *   rows          — textarea rows (default 4)
 */
const VariableInput = ({
  value = '',
  onChange,
  placeholder,
  multiline = false,
  availableVars = [],
  rows = 4,
}) => {
  // AI expressions are read-only rich tokens until the user deliberately
  // replaces them with manual text; native inputs cannot receive an object.
  const textValue = typeof value === 'string' ? value : '';
  const isExpression = isWorkflowExpression(value);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const cursorRef = useRef(null); // tracks cursor position in the input

  /* ── Close picker on outside click ───────────────────────────────────── */
  useEffect(() => {
    const handler = (e) => {
      // If clicking outside the input and not inside a portal modal
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsFocused(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* ── Track cursor position before picker opens ────────────────────────── */
  const saveCursor = useCallback(() => {
    if (inputRef.current) {
      cursorRef.current = inputRef.current.selectionStart ?? textValue.length;
    }
  }, [textValue]);

  /* ── Insert token at last cursor position ─────────────────────────────── */
  const insertToken = useCallback((varPath) => {
    const token = `{{${varPath}}}`;
    const pos = cursorRef.current ?? textValue.length;
    const before = textValue.substring(0, pos);
    const after = textValue.substring(pos);
    const newValue = before + token + after;

    onChange?.(newValue);
    cursorRef.current = pos + token.length;

    // Re-focus the input
    setIsFocused(true);
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(cursorRef.current, cursorRef.current);
      }
    }, 0);
  }, [textValue, onChange]);

  const inputClass =
    'w-full bg-slate-50 border border-slate-200 rounded-lg text-slate-800 px-3 py-2 outline-none text-sm font-medium focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all shadow-inner resize-none pr-9';

  const hasVars = availableVars.length > 0;
  const hasTokens = isExpression || /{{[^}]+}}/.test(textValue);

  // Show the real input if focused, or if there are no tokens (so empty state looks normal)
  const showRealInput = isFocused || !hasTokens;



  return (
    <div ref={containerRef} className="relative flex flex-col gap-1.5">

      <div className="relative">
        {/* Fake Input (Preview Mode) */}
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

        {/* Real Input (Edit Mode) */}
        <div className={showRealInput ? 'block' : 'hidden'}>
          {multiline ? (
            <textarea
              ref={inputRef}
              value={textValue}
              rows={rows}
              placeholder={placeholder}
              className={inputClass}
              onChange={e => onChange?.(e.target.value)}
              onSelect={saveCursor}
              onKeyUp={saveCursor}
              onClick={saveCursor}
              onFocus={() => setIsFocused(true)}
            />
          ) : (
            <input
              ref={inputRef}
              type="text"
              value={textValue}
              placeholder={placeholder}
              className={inputClass}
              onChange={e => onChange?.(e.target.value)}
              onSelect={saveCursor}
              onKeyUp={saveCursor}
              onClick={saveCursor}
              onFocus={() => setIsFocused(true)}
            />
          )}
        </div>

        {/* { } trigger button */}
        {hasVars && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault(); // don't blur the input
              saveCursor();
              setPickerOpen(o => !o);
            }}
            title="Insert variable"
            className={`absolute right-2 top-2 flex items-center justify-center w-5 h-5 rounded text-[11px] font-black transition-all select-none
              ${pickerOpen
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'
              }`}
          >
            {'{}'}
          </button>
        )}
      </div>

      {/* ── Picker Modal ──────────────────────────────────────────────── */}
      {pickerOpen && createPortal(
        <VariablePickerModal
          isOpen={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onSelect={(path) => insertToken(path)}
          availableVars={availableVars}
        />,
        document.body
      )}
    </div>
  );
};

export default VariableInput;
