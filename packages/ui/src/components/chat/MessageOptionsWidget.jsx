import { useState } from 'react';
import Button from '../ui/Button.jsx';

export default function MessageOptionsWidget({ options, onSend, isTyping, allowDecide = false, clarificationId = null, isResolved = false, initialState = {} }) {
    // Store state for each input field by its ID
    const [formState, setFormState] = useState(initialState);

    const handleToggle = (inputId, option, isSingle) => {
        setFormState(prev => {
            if (isSingle) {
                return { ...prev, [inputId]: [option] };
            }
            const current = prev[inputId] || [];
            return {
                ...prev,
                [inputId]: current.includes(option) ? current.filter(o => o !== option) : [...current, option]
            };
        });
    };

    const handleTextChange = (inputId, text) => {
        setFormState(prev => ({ ...prev, [inputId]: text }));
    };

    const handleSend = () => {
        const parts = [];
        (options || []).forEach(input => {
            const val = formState[input.id];
            if (input.type === 'text' || input.type === 'textarea') {
                if (val && val.trim()) {
                    parts.push(input.label ? `${input.label}: ${val.trim()}` : val.trim());
                }
            } else if (Array.isArray(val) && val.length > 0) {
                if (input.label) {
                    parts.push(`${input.label}: ${val.join(', ')}`);
                } else {
                    parts.push(val.join(', '));
                }
            }
        });

        if (parts.length > 0) {
            onSend({ type: 'submit_clarification', text: parts.join('\n'), state: formState });
        }
    };

    const isAnySelected = Object.values(formState).some(val => {
        if (Array.isArray(val)) return val.length > 0;
        return typeof val === 'string' && val.trim().length > 0;
    });
    const hasDirectChoice = (options || []).some(input =>
        input.type === 'workflow_choice' || input.type === 'form_choice'
    );

    return (
        <div className="mt-2 flex flex-col gap-4 w-full max-w-[90%] bg-slate-50 border border-slate-200 p-3 rounded-xl">
            {(options || []).map((input, idx) => {
                if (input.type === 'workflow_choice' || input.type === 'form_choice') {
                    return (
                        <div key={input.id || idx} className="flex flex-col gap-1.5">
                            {input.label && <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{input.label}</span>}
                            <div className="flex flex-col gap-1.5">
                                {(input.options || []).map((resource) => (
                                    <button
                                        key={resource.id}
                                        type="button"
                                        disabled={isTyping || isResolved}
                                        onClick={() => onSend?.(resource)}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-900 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {resource.name || resource.title}
                                    </button>
                                ))}
                            </div>
                        </div>
                    );
                }

                if (input.type === 'single_choice' || input.type === 'multiple_choice') {
                    const isSingle = input.type === 'single_choice';
                    const selectedOptions = formState[input.id] || [];
                    
                    return (
                        <div key={input.id || idx} className="flex flex-col gap-1.5">
                            {input.label && <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{input.label}</span>}
                            <div className="flex flex-col gap-1.5">
                                {input.options.map((opt, oIdx) => {
                                    const isChecked = selectedOptions.includes(opt);
                                    return (
                                        <label 
                                            key={oIdx} 
                                            className={`flex items-start gap-2.5 p-2 rounded-lg border cursor-pointer transition-colors ${isChecked ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200 hover:border-indigo-300'}`}
                                        >
                                            <input 
                                                type={isSingle ? 'radio' : 'checkbox'}
                                                name={input.id}
                                                checked={isChecked}
                                                disabled={isTyping || isResolved}
                                                onChange={() => handleToggle(input.id, opt, isSingle)}
                                                className="mt-0.5 w-4 h-4 text-indigo-600 border-slate-300 focus:ring-indigo-500 disabled:opacity-50"
                                            />
                                            <span className={`text-sm ${isChecked ? 'text-indigo-900 font-medium' : 'text-slate-700'}`}>
                                                {opt}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    );
                } else if (input.type === 'text' || input.type === 'textarea') {
                    return (
                        <div key={input.id || idx} className="flex flex-col gap-1.5">
                            {input.label && <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{input.label}</span>}
                            {input.type === 'textarea' || input.multiline || (input.placeholder && input.placeholder.includes('\n')) ? (
                                <textarea
                                    disabled={isTyping || isResolved}
                                    placeholder={input.placeholder || "Type here..."}
                                    value={formState[input.id] || ''}
                                    onChange={(e) => handleTextChange(input.id, e.target.value)}
                                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 min-h-[80px] resize-y"
                                />
                            ) : (
                                <input 
                                    type="text"
                                    disabled={isTyping || isResolved}
                                    placeholder={input.placeholder || "Type here..."}
                                    value={formState[input.id] || ''}
                                    onChange={(e) => handleTextChange(input.id, e.target.value)}
                                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && isAnySelected && !isTyping) {
                                            handleSend();
                                        }
                                    }}
                                />
                            )}
                        </div>
                    );
                }
                return null;
            })}
            
            {!hasDirectChoice && (
                <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSend}
                    disabled={!isAnySelected || isTyping || isResolved}
                    className="w-full mt-1"
                >
                    Send Selected
                </Button>
            )}
            {allowDecide && (
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onSend?.({ type: 'decide_for_me', clarificationId })}
                    disabled={isTyping || isResolved}
                    className="w-full"
                >
                    Use sensible defaults
                </Button>
            )}
        </div>
    );
}
