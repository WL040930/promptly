import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import VariablePickerModal from '../modals/VariablePickerModal';

/* ─── Type-colour map for the variable pill badges ─────────────────────── */
const TYPE_COLORS = {
  string: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  text: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  number: 'bg-blue-100   text-blue-700   border-blue-200',
  boolean: 'bg-amber-100  text-amber-700  border-amber-200',
  object: 'bg-violet-100 text-violet-700 border-violet-200',
  array: 'bg-pink-100   text-pink-700   border-pink-200',
  any: 'bg-slate-100  text-slate-600  border-slate-200',
};

function typeColor(type) {
  return TYPE_COLORS[type] ?? TYPE_COLORS.any;
}

function isObjectLike(v) {
  return v?.hasChildren || ['object', 'array', 'any'].includes(v?.type);
}

function canUseCustomPath(v) {
  return ['object', 'any'].includes(v?.type) || v?.hasChildren;
}

/* ─── Token preview — renders {{...}} as colored pills ─────────────────── */
function TokenPreview({ value, availableVars = [], className, onClick }) {
  if (!value || typeof value !== 'string') return null;
  const parts = value.split(/({{[^}]+}})/g);
  return (
    <div
      className={`flex flex-wrap gap-1 items-center min-h-[38px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg cursor-text ${className || ''}`}
      onClick={onClick}
    >
      {parts.length === 1 && parts[0] === '' && (
        <span className="text-sm text-slate-400 select-none">Click to type or insert variables...</span>
      )}
      {parts.map((part, i) => {
        const match = part.match(/^{{([^}]+)}}$/);
        if (match) {
          const path = match[1];
          const v = availableVars.find(v => v.path === path);
          const displayLabel = v ? v.label : path;

          return (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200 select-none shadow-sm"
              title={`Raw ID: {{${path}}}`}
            >
              <span className="opacity-50 text-[9px]">{'{{'}</span>
              {displayLabel}
              <span className="opacity-50 text-[9px]">{'}}'}</span>
            </span>
          );
        }
        return part ? (
          <span key={i} className="text-sm text-slate-800 whitespace-pre-wrap">
            {part}
          </span>
        ) : null;
      })}
    </div>
  );
}

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
      cursorRef.current = inputRef.current.selectionStart ?? value.length;
    }
  }, [value]);

  /* ── Insert token at last cursor position ─────────────────────────────── */
  const insertToken = useCallback((varPath) => {
    const token = `{{${varPath}}}`;
    const pos = cursorRef.current ?? value.length;
    const before = value.substring(0, pos);
    const after = value.substring(pos);
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
  }, [value, onChange]);

  const inputClass =
    'w-full bg-slate-50 border border-slate-200 rounded-lg text-slate-800 px-3 py-2 outline-none text-sm font-medium focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all shadow-inner resize-none pr-9';

  const hasVars = availableVars.length > 0;
  const hasTokens = /{{[^}]+}}/.test(value ?? '');

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
              value={value}
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
              value={value}
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
