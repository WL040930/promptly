import Switch from '../../components/ui/Switch.jsx';

/**
 * FormSettings — settings panel for a form.
 * Upgraded to premium aesthetic with card layouts, better switches, and nice color picker.
 */

const ACCENT_COLORS = [
    { name: 'Indigo', value: '#5b4ee8' },
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
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_12px_28px_rgba(23,24,39,0.04)] transition-all hover:shadow-md sm:p-8">
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
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_12px_28px_rgba(23,24,39,0.04)] transition-all hover:shadow-md sm:p-8">
                <h3 className="text-lg font-extrabold text-gray-900 tracking-tight mb-2">Accent Color</h3>
                <p className="text-[14px] font-medium text-gray-500 mb-6">Used for the form header, submit button, background theme, and focus rings.</p>
                <div className="flex flex-wrap gap-4">
                    {ACCENT_COLORS.map(color => {
                        const isActive = (settings.accentColor || '#5b4ee8') === color.value;
                        return (
                            <button
                                key={color.value}
                                onClick={() => updateSetting('accentColor', color.value)}
                                aria-label={`Use ${color.name} accent color`}
                                aria-pressed={isActive}
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
                    <label htmlFor="custom-accent-color" className="relative group" title="Choose a custom accent color">
                        <input
                            id="custom-accent-color"
                            type="color"
                            value={settings.accentColor || '#5b4ee8'}
                            onChange={e => updateSetting('accentColor', e.target.value)}
                            aria-label="Choose a custom accent color"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        />
                        <div className="w-12 h-12 rounded-2xl border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 group-hover:border-gray-400 group-hover:bg-gray-50 transition-all duration-300 shadow-sm">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" />
                            </svg>
                        </div>
                    </label>
                </div>
            </div>

            {/* Toggles */}
            <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-[0_12px_28px_rgba(23,24,39,0.04)] transition-all hover:shadow-md divide-y divide-gray-100 sm:p-4">
                
                {/* Form Status */}
                <div className="flex flex-col items-start justify-between gap-4 p-4 sm:flex-row sm:items-center">
                    <div>
                        <h3 className="text-[16px] font-extrabold text-gray-900">Accepting Responses</h3>
                        <p className="text-[13px] font-medium text-gray-500 mt-1">When off, the form will show a closed message.</p>
                    </div>
                    <Switch
                        size="lg"
                        ariaLabel="Accepting responses"
                        checked={settings.acceptingResponses !== false}
                        onChange={(val) => updateSetting('acceptingResponses', val)}
                        activeColor={settings.accentColor || '#5b4ee8'}
                    />
                </div>

                {/* Limit 1 per Browser */}
                <div className="flex flex-col items-start justify-between gap-4 p-4 sm:flex-row sm:items-center">
                    <div>
                        <h3 className="text-[16px] font-extrabold text-gray-900">Limit to 1 response per browser</h3>
                        <p className="text-[13px] font-medium text-gray-500 mt-1">Respondents can only submit this form once per browser.</p>
                    </div>
                    <Switch
                        size="lg"
                        ariaLabel="Limit to one response per browser"
                        checked={settings.limitOnePerBrowser || false}
                        onChange={(val) => updateSetting('limitOnePerBrowser', val)}
                        activeColor={settings.accentColor || '#5b4ee8'}
                    />
                </div>

                {/* Response Limit */}
                <div className="p-4">
                    <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                        <div className="min-w-0">
                            <h3 className="text-[16px] font-extrabold text-gray-900">Response Limit</h3>
                            <p className="text-[13px] font-medium text-gray-500 mt-1">Automatically close after reaching the limit.</p>
                        </div>
                        <Switch
                            size="lg"
                            ariaLabel="Enable response limit"
                            checked={settings.hasResponseLimit || false}
                            onChange={(val) => updateSetting('hasResponseLimit', val)}
                            activeColor={settings.accentColor || '#5b4ee8'}
                        />
                    </div>
                    {settings.hasResponseLimit && (
                        <div className="animate-slide-up-fade mt-2 flex flex-wrap items-center gap-4 rounded-2xl border border-gray-200 bg-gray-50/50 p-4">
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
