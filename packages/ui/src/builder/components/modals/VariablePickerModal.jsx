import { useState, useMemo, useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import { WORKFLOW_MODAL_LAYERS } from '../../modalLayers.js';
import { descriptorFromVariable } from '../../utils/workflowReferenceInput.js';

gsap.registerPlugin(useGSAP);

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

export default function VariablePickerModal({ isOpen, onClose, onSelect, availableVars = [] }) {
  const [search, setSearch] = useState('');
  const [selectedNodeTitle, setSelectedNodeTitle] = useState(null);
  const [expandedPaths, setExpandedPaths] = useState(new Set());
  const [customPathTarget, setCustomPathTarget] = useState(null);
  const [customPath, setCustomPath] = useState('');
  const modalRootRef = useRef(null);
  const modalRef = useRef(null);
  const closeAnimationRef = useRef(null);
  const isClosingRef = useRef(false);

  useGSAP((_, contextSafe) => {
    if (!isOpen || !modalRootRef.current || !modalRef.current) return;

    isClosingRef.current = false;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      closeAnimationRef.current = contextSafe(onClose);
      return () => { closeAnimationRef.current = null; };
    }

    gsap.fromTo(modalRootRef.current,
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: 0.2, ease: 'power2.out' }
    );
    gsap.fromTo(modalRef.current,
      { autoAlpha: 0, y: 24, scale: 0.96 },
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.32, delay: 0.03, ease: 'back.out(1.2)' }
    );

    closeAnimationRef.current = contextSafe(() => {
      if (isClosingRef.current) return;
      isClosingRef.current = true;
      gsap.killTweensOf([modalRootRef.current, modalRef.current]);
      gsap.timeline({ defaults: { overwrite: 'auto' }, onComplete: contextSafe(onClose) })
        .to(modalRef.current, { autoAlpha: 0, y: 14, scale: 0.96, duration: 0.16, ease: 'power2.in' })
        .to(modalRootRef.current, { autoAlpha: 0, duration: 0.14, ease: 'power2.in' }, '<');
    });

    return () => { closeAnimationRef.current = null; };
  }, { scope: modalRootRef, dependencies: [isOpen], revertOnUpdate: true });

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setExpandedPaths(new Set());
      setCustomPathTarget(null);
      setCustomPath('');
    }
  }, [isOpen]);

  // Group vars by Node Title
  const grouped = useMemo(() => {
    const map = new Map();
    for (const v of availableVars) {
      const key = v.nodeTitle || v.nodeId || 'Unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(v);
    }
    return map;
  }, [availableVars]);

  // Determine which node to show
  const nodeTitles = Array.from(grouped.keys());
  useEffect(() => {
    if (isOpen && !selectedNodeTitle && nodeTitles.length > 0) {
      setSelectedNodeTitle(nodeTitles[0]);
    }
  }, [isOpen, selectedNodeTitle, nodeTitles]);

  const childrenByParent = useMemo(() => {
    const map = new Map();
    for (const v of availableVars) {
      if (!v.parentPath) continue;
      if (!map.has(v.parentPath)) map.set(v.parentPath, []);
      map.get(v.parentPath).push(v);
    }
    return map;
  }, [availableVars]);

  // Filter vars of the selected node
  const displayVars = useMemo(() => {
    const vars = grouped.get(selectedNodeTitle) || [];
    const q = search.toLowerCase();
    if (!q) return vars;
    
    // If searching, flatten and filter
    return vars.filter(
      v =>
        v.label.toLowerCase().includes(q) ||
        v.path.toLowerCase().includes(q) ||
        (v.description?.toLowerCase() || '').includes(q)
    );
  }, [grouped, selectedNodeTitle, search]);

  if (!isOpen) return null;

  const toggleExpanded = (path) => {
    setExpandedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const startCustomPath = (variable) => {
    setExpandedPaths(prev => new Set(prev).add(variable.path));
    setCustomPathTarget(variable);
    setCustomPath('');
  };

  const requestClose = () => {
    if (closeAnimationRef.current) {
      closeAnimationRef.current();
    } else {
      onClose();
    }
  };

  const insertCustomPath = () => {
    if (!customPathTarget) return;
    const cleanPath = customPath.trim();
    if (!/^[\w-]+(\.[\w-]+)*$/.test(cleanPath)) return;
    const descriptor = descriptorFromVariable(customPathTarget);
    if (!descriptor) return;
    onSelect({
      ...descriptor,
      path: [...descriptor.path, ...cleanPath.split('.')],
      runtimePath: `${descriptor.runtimePath}.${cleanPath}`
    });
    requestClose();
  };

  const handleSelect = (variable) => {
    onSelect(descriptorFromVariable(variable) || variable);
    requestClose();
  };

  const renderNestedRows = (parentVar) => {
    const children = childrenByParent.get(parentVar.path) || [];

    return children.map(child => {
      const nestedChildren = childrenByParent.get(child.path) || [];
      const childExpanded = expandedPaths.has(child.path);
      const childExpandable = isObjectLike(child) || nestedChildren.length > 0;

      return (
        <div key={child.path}>
          <div
            className="w-full pr-3 py-2 flex items-center gap-3 text-left hover:bg-indigo-50/60 transition-colors group border-b border-slate-50 last:border-0"
            style={{ paddingLeft: 24 + (child.depth * 16) }}
          >
            {childExpandable ? (
              <button
                type="button"
                onClick={() => toggleExpanded(child.path)}
                className="shrink-0 w-5 h-5 flex items-center justify-center text-slate-500 hover:bg-slate-200 rounded transition-colors"
              >
                <svg
                  className={`w-3.5 h-3.5 transition-transform ${childExpanded ? 'rotate-90' : ''}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ) : (
              <div className="shrink-0 w-5 h-5 flex items-center justify-center text-slate-300">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
              </div>
            )}

            <span className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded border tracking-wide ${typeColor(child.type)}`}>
              {child.type || 'any'}
            </span>

            <button
              type="button"
              onClick={() => childExpandable ? toggleExpanded(child.path) : handleSelect(child)}
              className="flex-1 min-w-0 text-left flex flex-col"
            >
              <div className="text-sm font-semibold text-slate-800 truncate group-hover:text-indigo-700">
                {child.label}
              </div>
              <div className="text-xs text-slate-400 truncate mt-0.5 font-mono whitespace-nowrap">
                {child.path}
              </div>
            </button>

            {childExpandable ? (
              <button
                type="button"
                onClick={() => handleSelect(child)}
                className="shrink-0 text-xs font-bold text-slate-500 hover:text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors border border-transparent hover:border-indigo-100"
              >
                Use value
              </button>
            ) : (
              <button 
                type="button"
                onClick={() => handleSelect(child)}
                className="shrink-0 opacity-0 group-hover:opacity-100 text-xs font-bold text-indigo-600 px-3 py-1.5 rounded-lg bg-indigo-50 transition-all border border-indigo-100"
              >
                Insert
              </button>
            )}
          </div>

          {childExpandable && childExpanded && (
            <div className="border-l-2 border-slate-100 ml-6">
              {canUseCustomPath(child) && (
                <div className="pl-6 pr-3 py-3 bg-slate-50/70 border-b border-slate-100">
                  {customPathTarget?.path === child.path ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-slate-500 truncate">{child.path}.</span>
                      <input
                        autoFocus
                        type="text"
                        value={customPath}
                        onChange={e => setCustomPath(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') insertCustomPath();
                          if (e.key === 'Escape') {
                            setCustomPathTarget(null);
                            setCustomPath('');
                          }
                        }}
                        placeholder="nested.field"
                        className="min-w-0 flex-1 text-sm px-3 py-1.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                      />
                      <button
                        type="button"
                        onClick={insertCustomPath}
                        disabled={!/^[\w-]+(\.[\w-]+)*$/.test(customPath.trim())}
                        className="shrink-0 text-xs font-bold px-4 py-1.5 rounded-lg bg-indigo-600 text-white disabled:bg-slate-200 disabled:text-slate-400 transition-colors shadow-sm"
                      >
                        Insert
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startCustomPath(child)}
                      className="w-full flex items-center gap-2 text-left text-xs font-bold text-slate-500 hover:text-indigo-700 transition-colors"
                    >
                      <span className="text-sm font-black text-indigo-400">{'{}'}</span>
                      Type custom nested field path...
                    </button>
                  )}
                </div>
              )}

              {renderNestedRows(child)}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div
      ref={modalRootRef}
      className="fixed inset-0 z-[100100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
      style={{ zIndex: WORKFLOW_MODAL_LAYERS.nested }}
      onClick={requestClose}
    >
      <div 
        ref={modalRef}
        className="bg-white w-full max-w-4xl h-[70vh] min-h-[500px] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200"
        onClick={e => e.stopPropagation()}
      >
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center font-black text-lg shadow-inner">
              {'{ }'}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Insert Variable</h2>
              <p className="text-xs text-slate-500 font-medium">Select data from upstream nodes to insert into this field.</p>
            </div>
          </div>
          <button 
            onClick={requestClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-200 hover:bg-slate-300 text-slate-800 transition-colors"
            title="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="stroke-current">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Left Sidebar - Node List */}
          <div className="w-64 bg-slate-50 border-r border-slate-100 flex flex-col">
            <div className="p-4 border-b border-slate-200">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Available Nodes</h3>
              <div className="flex flex-col gap-1.5 overflow-y-auto">
                {nodeTitles.length === 0 ? (
                  <div className="text-xs text-slate-400 italic">No upstream nodes</div>
                ) : (
                  nodeTitles.map(title => (
                    <button
                      key={title}
                      onClick={() => { setSelectedNodeTitle(title); setSearch(''); }}
                      className={`text-left px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                        selectedNodeTitle === title 
                          ? 'bg-indigo-600 text-white shadow-md' 
                          : 'text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                      }`}
                    >
                      {title}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Right Area - Variables */}
          <div className="flex-1 flex flex-col bg-white overflow-hidden">
            {/* Search Bar */}
            <div className="p-4 border-b border-slate-100 bg-white shadow-sm z-10">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input 
                  type="text" 
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={`Search variables in "${selectedNodeTitle || 'Node'}"...`}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                />
              </div>
            </div>

            {/* Variables List */}
            <div className="flex-1 overflow-y-auto p-2">
              {displayVars.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8">
                  <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mb-4 shadow-inner">
                    <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                  </div>
                  <h4 className="text-sm font-bold text-slate-700">No variables found</h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-[250px]">Try adjusting your search term or select a different node from the left panel.</p>
                </div>
              ) : (
                <div className="flex flex-col">
                  {(search ? displayVars : displayVars.filter(v => !v.parentPath)).map(v => {
                    const expanded = expandedPaths.has(v.path);
                    const showNestedControls = isObjectLike(v);
                    const showAsExpandable = !search && showNestedControls;

                    return (
                      <div key={v.path} className="border-b border-slate-50 last:border-0">
                        <div
                          className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors group rounded-lg
                            ${showAsExpandable ? 'hover:bg-slate-50' : 'hover:bg-indigo-50/60'}`}
                          style={{ paddingLeft: search && v.depth ? 16 + (v.depth * 16) : undefined }}
                        >
                          {showAsExpandable && (
                            <button
                              type="button"
                              onClick={() => toggleExpanded(v.path)}
                              className="shrink-0 w-6 h-6 flex items-center justify-center text-slate-500 hover:bg-slate-200 rounded transition-colors"
                            >
                              <svg
                                className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                              >
                                <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                          )}

                          {!showAsExpandable && v.depth > 0 && (
                            <div className="shrink-0 w-6 h-6 flex items-center justify-center text-slate-300">
                              <div className="w-2 h-2 rounded-full bg-slate-300" />
                            </div>
                          )}

                          <span className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded border tracking-wide ${typeColor(v.type)}`}>
                            {v.type || 'any'}
                          </span>

                          <button
                            type="button"
                            onClick={() => showAsExpandable ? toggleExpanded(v.path) : handleSelect(v)}
                            className="flex-1 min-w-0 text-left flex flex-col"
                          >
                            <div className="text-sm font-bold text-slate-800 truncate group-hover:text-indigo-700">
                              {v.label}
                            </div>
                            <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                              <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 whitespace-nowrap shrink-0">{v.path}</span>
                              {v.description && <span className="truncate">{v.description}</span>}
                            </div>
                          </button>

                          {showAsExpandable ? (
                            <button
                              type="button"
                              onClick={() => handleSelect(v)}
                              className="shrink-0 text-xs font-bold text-slate-500 hover:text-indigo-600 px-3 py-2 rounded-lg hover:bg-indigo-50 transition-colors border border-transparent hover:border-indigo-100"
                            >
                              Use object
                            </button>
                          ) : (
                            <button 
                              type="button"
                              onClick={() => handleSelect(v)}
                              className="shrink-0 opacity-0 group-hover:opacity-100 text-xs font-bold text-indigo-600 px-4 py-2 rounded-lg bg-indigo-50 transition-all border border-indigo-100 shadow-sm"
                            >
                              Insert
                            </button>
                          )}
                        </div>

                        {showAsExpandable && expanded && (
                          <div className="border-l-2 border-slate-100 ml-7 my-2">
                            <button
                              type="button"
                              onClick={() => handleSelect(v)}
                              className="w-full pl-6 pr-4 py-2 flex items-center gap-3 text-left hover:bg-indigo-50/60 transition-colors group border-b border-slate-50"
                            >
                              <span className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded border tracking-wide ${typeColor(v.type)}`}>
                                {v.type || 'any'}
                              </span>
                              <span className="flex-1 min-w-0 text-sm font-bold text-slate-700 truncate group-hover:text-indigo-700">
                                Use whole object
                              </span>
                              <span className="text-xs text-slate-400 truncate font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">Insert the whole value</span>
                            </button>

                            {canUseCustomPath(v) && (
                              <div className="pl-6 pr-4 py-3 bg-slate-50/70 border-b border-slate-50">
                                {customPathTarget?.path === v.path ? (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-mono text-slate-500 truncate">{v.path}.</span>
                                    <input
                                      autoFocus
                                      type="text"
                                      value={customPath}
                                      onChange={e => setCustomPath(e.target.value)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') insertCustomPath();
                                        if (e.key === 'Escape') {
                                          setCustomPathTarget(null);
                                          setCustomPath('');
                                        }
                                      }}
                                      placeholder="nested.field"
                                      className="min-w-0 flex-1 text-sm px-3 py-1.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
                                    />
                                    <button
                                      type="button"
                                      onClick={insertCustomPath}
                                      disabled={!/^[\w-]+(\.[\w-]+)*$/.test(customPath.trim())}
                                      className="shrink-0 text-xs font-bold px-4 py-1.5 rounded-lg bg-indigo-600 text-white disabled:bg-slate-200 disabled:text-slate-400 transition-colors shadow-sm"
                                    >
                                      Insert
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => startCustomPath(v)}
                                    className="w-full flex items-center gap-2 text-left text-xs font-bold text-slate-500 hover:text-indigo-700 transition-colors"
                                  >
                                    <span className="text-sm font-black text-indigo-400">{'{}'}</span>
                                    Type custom nested field path...
                                  </button>
                                )}
                              </div>
                            )}

                            {renderNestedRows(v)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
