
// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** Shared class string for compact settings text inputs. */
const settingsInputClass =
    'text-[13px] font-medium text-gray-500 bg-gray-50/50 border border-gray-200 rounded-xl px-4 py-2.5 focus:outline-none focus:border-gray-300 focus:bg-white shadow-inner transition-all';

/** Shared class string for narrow number inputs (rows, min, max, etc.). */
const narrowInputClass =
    'w-24 text-[13px] font-medium bg-gray-50/50 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-gray-300 focus:bg-white shadow-inner';

const SettingsLabel = ({ children }) => (
    <span className="text-[13px] text-gray-500 font-semibold">{children}</span>
);

// Renders the visual indicator (radio dot, checkbox box, or number) per choice type.
const ChoiceIndicator = ({ type, index }) => {
    if (type === 'radio') {
        return <div className="w-5 h-5 rounded-full border-2 border-gray-300 bg-gray-50 shrink-0" />;
    }
    if (type === 'checkbox') {
        return <div className="w-5 h-5 rounded-md border-2 border-gray-300 bg-gray-50 shrink-0" />;
    }
    // select
    return <span className="text-[13px] text-gray-400 font-bold w-5 shrink-0 text-center">{index + 1}.</span>;
};

// ---------------------------------------------------------------------------
// Section-level setting blocks
// ---------------------------------------------------------------------------

const PlaceholderSetting = ({ value, onUpdate }) => (
    <input
        type="text"
        value={value || ''}
        onChange={(e) => onUpdate({ placeholder: e.target.value })}
        placeholder="Placeholder text (optional)"
        className={settingsInputClass}
    />
);

const RowsSetting = ({ value, onUpdate }) => (
    <div className="flex items-center gap-3 mt-1">
        <SettingsLabel>Rows</SettingsLabel>
        <input
            type="number"
            value={value || 4}
            onChange={(e) => onUpdate({ rows: parseInt(e.target.value) || 4 })}
            className={narrowInputClass}
            min="2"
            max="20"
        />
    </div>
);

const NumberRangeSetting = ({ field, onUpdate }) => (
    <div className="flex gap-4">
        {['min', 'max'].map((bound) => (
            <div key={bound} className="flex items-center gap-2">
                <SettingsLabel>{bound === 'min' ? 'Min' : 'Max'}</SettingsLabel>
                <input
                    type="number"
                    value={field[bound] || ''}
                    onChange={(e) => onUpdate({ [bound]: e.target.value })}
                    className={narrowInputClass}
                    placeholder="—"
                />
            </div>
        ))}
    </div>
);

const RatingMaxSetting = ({ value, onUpdate }) => (
    <div className="flex items-center gap-3">
        <SettingsLabel>Max rating</SettingsLabel>
        <select
            value={value || 5}
            onChange={(e) => onUpdate({ maxRating: parseInt(e.target.value) })}
            className="text-[13px] font-medium bg-gray-50/50 border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:border-gray-300 focus:bg-white shadow-inner cursor-pointer"
        >
            {[3, 4, 5, 7, 10].map((n) => (
                <option key={n} value={n}>{n} stars</option>
            ))}
        </select>
    </div>
);

const ChoicesEditor = ({ field, onUpdate, onAddChoice, onUpdateChoice, onDeleteChoice }) => (
    <div className="flex flex-col gap-2.5 mt-2">
        {(field.choices || []).map((choice, index) => (
            <div key={index} className="flex items-center gap-3 group/choice">
                <ChoiceIndicator type={field.type} index={index} />
                <input
                    type="text"
                    value={choice}
                    onChange={(e) => onUpdateChoice(index, e.target.value)}
                    className="flex-1 text-[15px] font-medium text-gray-800 bg-transparent border-b-2 border-transparent hover:border-gray-200 focus:border-gray-400 focus:outline-none py-1 transition-all"
                />
                {(field.choices || []).length > 1 && (
                    <button
                        onClick={(e) => { e.stopPropagation(); onDeleteChoice(index); }}
                        className="opacity-0 group-hover/choice:opacity-100 text-gray-300 hover:text-red-500 p-1.5 hover:bg-red-50 rounded-lg transition-all"
                        title="Remove option"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                )}
            </div>
        ))}
        <button
            onClick={(e) => { e.stopPropagation(); onAddChoice(); }}
            className="flex items-center gap-2 text-[13px] font-bold text-gray-400 hover:text-gray-700 mt-2 self-start transition-colors px-2 py-1.5 hover:bg-gray-50 rounded-lg"
        >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add option
        </button>
    </div>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const PLACEHOLDER_TYPES = ['text', 'email', 'number', 'phone', 'url', 'textarea'];
const CHOICE_TYPES = ['select', 'radio', 'checkbox'];

const FieldSettingsPanel = ({
    field,
    isSelected,
    onUpdate,
    handleAddChoice,
    handleUpdateChoice,
    handleDeleteChoice,
}) => {
    if (!isSelected) return null;

    const hasChoices = CHOICE_TYPES.includes(field.type);

    return (
        <>
            {PLACEHOLDER_TYPES.includes(field.type) && (
                <PlaceholderSetting value={field.placeholder} onUpdate={onUpdate} />
            )}

            {field.type === 'textarea' && (
                <RowsSetting value={field.rows} onUpdate={onUpdate} />
            )}

            {field.type === 'number' && (
                <NumberRangeSetting field={field} onUpdate={onUpdate} />
            )}

            {field.type === 'rating' && (
                <RatingMaxSetting value={field.maxRating} onUpdate={onUpdate} />
            )}

            {field.type === 'file' && (
                <input
                    type="text"
                    value={field.accept || ''}
                    onChange={(e) => onUpdate({ accept: e.target.value })}
                    placeholder="Accepted types (e.g. .pdf,.jpg)"
                    className={settingsInputClass}
                />
            )}

            {field.type === 'hidden' && (
                <input
                    type="text"
                    value={field.defaultValue || ''}
                    onChange={(e) => onUpdate({ defaultValue: e.target.value })}
                    placeholder="Default value"
                    className={settingsInputClass}
                />
            )}

            {hasChoices && (
                <ChoicesEditor
                    field={field}
                    onUpdate={onUpdate}
                    onAddChoice={handleAddChoice}
                    onUpdateChoice={handleUpdateChoice}
                    onDeleteChoice={handleDeleteChoice}
                />
            )}
        </>
    );
};

export default FieldSettingsPanel;
