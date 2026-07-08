import React, { useState, useRef, useEffect, useCallback } from 'react';

/* ─── Type-colour map for the variable pill badges ─────────────────────── */
const TYPE_COLORS = {
  string:  'bg-emerald-100 text-emerald-700 border-emerald-200',
  text:    'bg-emerald-100 text-emerald-700 border-emerald-200',
  number:  'bg-blue-100   text-blue-700   border-blue-200',
  boolean: 'bg-amber-100  text-amber-700  border-amber-200',
  object:  'bg-violet-100 text-violet-700 border-violet-200',
  array:   'bg-pink-100   text-pink-700   border-pink-200',
  any:     'bg-slate-100  text-slate-600  border-slate-200',
};

function typeColor(type) {
  return TYPE_COLORS[type] ?? TYPE_COLORS.any;
}

/* ─── Token preview — renders {{...}} as colored pills ─────────────────── */
function TokenPreview({ value }) {
  if (!value || typeof value !== 'string') return null;
  const parts = value.split(/({{[\w.-]+}})/g);
  return (
    <div className="flex flex-wrap gap-1 items-center min-h-[28px] px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
      {parts.map((part, i) => {
        const match = part.match(/^{{([\w.-]+)}}$/);
        if (match) {
          return (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200 font-mono"
            >
              <span className="opacity-50 text-[9px]">{'{{'}</span>
              {match[1]}
              <span className="opacity-50 text-[9px]">{'}}'}</span>
            </span>
          );
        }
        return part ? (
          <span key={i} className="text-xs text-slate-700">
            {part}
          </span>
        ) : null;
      })}
      {!value && <span className="text-xs text-slate-400 italic">Empty</span>}
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
  const [search, setSearch]         = useState('');
  const inputRef    = useRef(null);
  const pickerRef   = useRef(null);
  const cursorRef   = useRef(null); // tracks cursor position in the input

  /* ── Close picker on outside click ───────────────────────────────────── */
  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e) => {
      if (
        pickerRef.current && !pickerRef.current.contains(e.target) &&
        inputRef.current  && !inputRef.current.contains(e.target)
      ) {
        setPickerOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerOpen]);

  /* ── Track cursor position before picker opens ────────────────────────── */
  const saveCursor = useCallback(() => {
    if (inputRef.current) {
      cursorRef.current = inputRef.current.selectionStart ?? value.length;
    }
  }, [value]);

  /* ── Insert token at last cursor position ─────────────────────────────── */
  const insertToken = useCallback((varPath) => {
    const token  = `{{${varPath}}}`;
    const pos    = cursorRef.current ?? value.length;
    const before = value.slice(0, pos);
    const after  = value.slice(pos);
    const next   = before + token + after;
    onChange?.(next);

    setPickerOpen(false);
    setSearch('');

    // Restore focus + move cursor to after the token
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const newPos = pos + token.length;
        inputRef.current.setSelectionRange(newPos, newPos);
      }
    });
  }, [value, onChange]);

  /* ── Filter variables by search ───────────────────────────────────────── */
  const grouped = React.useMemo(() => {
    const q = search.toLowerCase();
    const filtered = availableVars.filter(
      v =>
        !q ||
        v.label.toLowerCase().includes(q) ||
        v.path.toLowerCase().includes(q) ||
        v.nodeTitle?.toLowerCase().includes(q)
    );

    // Group by nodeTitle
    const map = new Map();
    for (const v of filtered) {
      const key = v.nodeTitle || v.nodeId || 'Unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(v);
    }
    return map;
  }, [availableVars, search]);

  const inputClass =
    'w-full bg-slate-50 border border-slate-200 rounded-lg text-slate-800 px-3 py-2 outline-none text-sm font-medium focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition-all shadow-inner resize-none pr-9';

  const hasVars = availableVars.length > 0;

  /* ── Has any {{...}} tokens already? ─────────────────────────────────── */
  const hasTokens = /{{[\w.-]+}}/.test(value ?? '');

  return (
    <div className="relative flex flex-col gap-1.5">

      {/* Token preview row (shown when value contains tokens) */}
      {hasTokens && (
        <TokenPreview value={value} />
      )}

      {/* Input area */}
      <div className="relative">
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
          />
        )}

        {/* { } trigger button */}
        {hasVars && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault(); // don't blur the input
              saveCursor();
              setPickerOpen(o => !o);
              setSearch('');
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

      {/* ── Picker dropdown ──────────────────────────────────────────────── */}
      {pickerOpen && (
        <div
          ref={pickerRef}
          className="absolute top-full left-0 right-0 mt-1 z-[500] bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden"
          style={{ minWidth: 260 }}
        >
          {/* Search */}
          <div className="p-2 border-b border-slate-100">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search variables…"
              className="w-full text-xs px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300 transition-all"
            />
          </div>

          {/* Variable list */}
          <div className="max-h-52 overflow-y-auto">
            {grouped.size === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-slate-400 italic">
                {search ? 'No variables match your search' : 'No upstream variables available'}
              </div>
            ) : (
              [...grouped.entries()].map(([nodeTitle, vars]) => (
                <div key={nodeTitle}>
                  {/* Node group header */}
                  <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 truncate">
                      {nodeTitle}
                    </span>
                  </div>

                  {/* Variable rows */}
                  {vars.map(v => (
                    <button
                      key={v.path}
                      type="button"
                      onClick={() => insertToken(v.path)}
                      className="w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-indigo-50/60 transition-colors group"
                    >
                      {/* Type badge */}
                      <span
                        className={`shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border tracking-wide ${typeColor(v.type)}`}
                      >
                        {v.type || 'any'}
                      </span>

                      {/* Label + path */}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-800 truncate group-hover:text-indigo-700">
                          {v.label}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono truncate">
                          {`{{${v.path}}}`}
                        </div>
                      </div>

                      {/* Insert arrow */}
                      <svg
                        className="w-3 h-3 text-slate-300 group-hover:text-indigo-400 shrink-0 transition-colors"
                        viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                      >
                        <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>

          {/* Footer hint */}
          <div className="px-3 py-1.5 border-t border-slate-100 bg-slate-50">
            <p className="text-[9px] text-slate-400">
              Click a variable to insert it at the cursor position
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default VariableInput;
