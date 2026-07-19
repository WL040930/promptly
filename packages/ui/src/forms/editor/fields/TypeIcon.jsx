import { FIELD_TYPES } from './fieldTypes';

const TypeIcon = ({ typeName, size = 16 }) => {
    const def = FIELD_TYPES[typeName];
    if (!def) return null;
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d={def.icon} />
        </svg>
    );
};

export default TypeIcon;
