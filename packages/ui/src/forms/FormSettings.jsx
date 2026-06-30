import React from 'react';

/**
 * FormSettings — settings panel for a form.
 * Upgraded to premium aesthetic with card layouts, better switches, and nice color picker.
 */

const ACCENT_COLORS = [
    { name: 'Indigo', value: '#4f46e5' },
    { name: 'Blue', value: '#2563eb' },
    { name: 'Teal', value: '#0d9488' },
    { name: 'Emerald', value: '#059669' },
    { name: 'Amber', value: '#d97706' },
    { name: 'Rose', value: '#e11d48' },
    { name: 'Purple', value: '#7c3aed' },
    { name: 'Slate', value: '#475569' },
];

const FormSettings = ({ form, onUpdateForm }) => {
    const settings = form.settings || {};

    const updateSetting = (key, value) => {
        onUpdateForm({
            settings: { ...settings, [key]: value },
        });
    };

    return (
        <div className="flex flex-col gap-6 animate-slide-up-fade pb-16">
            
            {/* Confirmation Message */}
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 transition-all hover:shadow-md">
                <h3 className="text-lg font-extrabold text-gray-900 tracking-tight mb-2">Confirmation Message</h3>
                <p className="text-[14px] font-medium text-gray-500 mb-5">Shown to respondents after they successfully submit the form.</p>
                <textarea
                    value={settings.confirmationMessage || ''}
                    onChange={e => updateSetting('confirmationMessage', e.target.value)}
                    placeholder="Your response has been recorded. Thank you!"
                    rows={3}
                    className="w-full bg-gray-50/50 border border-gray-200 rounded-2xl px-5 py-4 text-[15px] font-medium text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-gray-300 focus:bg-white focus:shadow-inner transition-all resize-none"
                />
            </div>

            {/* Accent Color */}
            <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100 transition-all hover:shadow-md">
                <h3 className="text-lg font-extrabold text-gray-900 tracking-tight mb-2">Accent Color</h3>
                <p className="text-[14px] font-medium text-gray-500 mb-6">Used for the form header, submit button, background theme, and focus rings.</p>
                <div className="flex flex-wrap gap-4">
                    {ACCENT_COLORS.map(color => {
                        const isActive = (settings.accentColor || '#4f46e5') === color.value;
                        return (
                            <button
                                key={color.value}
                                onClick={() => updateSetting('accentColor', color.value)}
                                className={`w-12 h-12 rounded-2xl transition-all duration-300 relative ${
                                    isActive ? 'scale-110 shadow-lg' : 'hover:scale-110 hover:shadow-md shadow-sm'
                                }`}
                                style={{
                                    backgroundColor: color.value,
                                    boxShadow: isActive ? `0 8px 20px ${color.value}50` : undefined
                                }}
                                title={color.name}
                            >
                                {isActive && (
                                    <svg className="absolute inset-0 m-auto text-white drop-shadow-md" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                )}
                            </button>
                        );
                    })}
                    {/* Custom color input */}
                    <div className="relative group">
                        <input
                            type="color"
                            value={settings.accentColor || '#4f46e5'}
                            onChange={e => updateSetting('accentColor', e.target.value)}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <div className="w-12 h-12 rounded-2xl border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 group-hover:border-gray-400 group-hover:bg-gray-50 transition-all duration-300 shadow-sm">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" />
                            </svg>
                        </div>
                    </div>
                </div>
            </div>

            {/* Toggles */}
            <div className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100 transition-all hover:shadow-md divide-y divide-gray-100">
                
                {/* Form Status */}
                <div className="p-4 flex items-center justify-between">
                    <div>
                        <h3 className="text-[16px] font-extrabold text-gray-900">Accepting Responses</h3>
                        <p className="text-[13px] font-medium text-gray-500 mt-1">When off, the form will show a closed message.</p>
                    </div>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={settings.acceptingResponses !== false}
                        onClick={() => updateSetting('acceptingResponses', settings.acceptingResponses === false)}
                        className={`relative inline-flex items-center px-0.5 w-14 h-8 rounded-full transition-colors duration-300 border-2 shrink-0 ${
                            settings.acceptingResponses !== false ? 'border-transparent bg-emerald-500' : 'bg-gray-100 border-gray-200'
                        }`}
                        style={settings.acceptingResponses !== false ? { backgroundColor: settings.accentColor || '#4f46e5' } : {}}
                    >
                        <span className={`w-6 h-6 bg-white rounded-full shadow-sm transition-transform duration-300 ${
                            settings.acceptingResponses !== false ? 'translate-x-6' : 'translate-x-0'
                        }`} />
                    </button>
                </div>

                {/* Limit 1 per Browser */}
                <div className="p-4 flex items-center justify-between">
                    <div>
                        <h3 className="text-[16px] font-extrabold text-gray-900">Limit to 1 response per browser</h3>
                        <p className="text-[13px] font-medium text-gray-500 mt-1">Respondents can only submit this form once per browser.</p>
                    </div>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={settings.limitOnePerBrowser || false}
                        onClick={() => updateSetting('limitOnePerBrowser', !settings.limitOnePerBrowser)}
                        className={`relative inline-flex items-center px-0.5 w-14 h-8 rounded-full transition-colors duration-300 border-2 shrink-0 ${
                            settings.limitOnePerBrowser ? 'border-transparent' : 'bg-gray-100 border-gray-200'
                        }`}
                        style={settings.limitOnePerBrowser ? { backgroundColor: settings.accentColor || '#4f46e5' } : {}}
                    >
                        <span className={`w-6 h-6 bg-white rounded-full shadow-sm transition-transform duration-300 ${
                            settings.limitOnePerBrowser ? 'translate-x-6' : 'translate-x-0'
                        }`} />
                    </button>
                </div>

                {/* Response Limit */}
                <div className="p-4">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-[16px] font-extrabold text-gray-900">Response Limit</h3>
                            <p className="text-[13px] font-medium text-gray-500 mt-1">Automatically close after reaching the limit.</p>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={settings.hasResponseLimit || false}
                            onClick={() => updateSetting('hasResponseLimit', !settings.hasResponseLimit)}
                            className={`relative inline-flex items-center px-0.5 w-14 h-8 rounded-full transition-colors duration-300 border-2 shrink-0 ${
                                settings.hasResponseLimit ? 'border-transparent' : 'bg-gray-100 border-gray-200'
                            }`}
                            style={settings.hasResponseLimit ? { backgroundColor: settings.accentColor || '#4f46e5' } : {}}
                        >
                            <span className={`w-6 h-6 bg-white rounded-full shadow-sm transition-transform duration-300 ${
                                settings.hasResponseLimit ? 'translate-x-6' : 'translate-x-0'
                            }`} />
                        </button>
                    </div>
                    {settings.hasResponseLimit && (
                        <div className="animate-slide-up-fade bg-gray-50/50 border border-gray-200 rounded-2xl p-4 flex items-center gap-4 mt-2">
                            <span className="text-[14px] font-bold text-gray-700">Maximum responses:</span>
                            <input
                                type="number"
                                value={settings.responseLimit || ''}
                                onChange={e => updateSetting('responseLimit', e.target.value)}
                                placeholder="e.g. 100"
                                min="1"
                                className="w-32 bg-white border border-gray-200 rounded-xl px-4 py-2 text-[15px] font-bold text-gray-800 focus:outline-none focus:border-gray-300 focus:shadow-inner transition-all"
                            />
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};

export default FormSettings;
