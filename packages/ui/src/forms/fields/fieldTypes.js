/**
 * Field type registry — single source of truth for all form field types.
 * Each entry defines: label, icon SVG, category, and default field config.
 */

export const FIELD_CATEGORIES = [
    { id: 'input', label: 'Input' },
    { id: 'choice', label: 'Choice' },
    { id: 'datetime', label: 'Date & Time' },
    { id: 'special', label: 'Special' },
    { id: 'layout', label: 'Layout' },
];

export const FIELD_TYPES = {
    text: {
        label: 'Short Text',
        category: 'input',
        icon: 'M4 7V4h16v3M9 20h6M12 4v16',
        defaults: { placeholder: '' },
    },
    email: {
        label: 'Email',
        category: 'input',
        icon: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L2 6',
        defaults: { placeholder: '' },
    },
    number: {
        label: 'Number',
        category: 'input',
        icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM8 12h8M12 8v8',
        defaults: { placeholder: '', min: '', max: '' },
    },
    phone: {
        label: 'Phone',
        category: 'input',
        icon: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z',
        defaults: { placeholder: '' },
    },
    url: {
        label: 'URL',
        category: 'input',
        icon: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71',
        defaults: { placeholder: '' },
    },
    textarea: {
        label: 'Long Text',
        category: 'input',
        icon: 'M21 11V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6M7 7h10M7 11h4M15.5 19l2.5 2 5-5',
        defaults: { placeholder: '', rows: 4 },
    },
    select: {
        label: 'Dropdown',
        category: 'choice',
        icon: 'M6 9l6 6 6-6',
        defaults: { choices: ['Option 1', 'Option 2', 'Option 3'] },
    },
    radio: {
        label: 'Single Choice',
        category: 'choice',
        icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8z',
        defaults: { choices: ['Option 1', 'Option 2', 'Option 3'] },
    },
    checkbox: {
        label: 'Multiple Choice',
        category: 'choice',
        icon: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
        defaults: { choices: ['Option 1', 'Option 2', 'Option 3'] },
    },
    date: {
        label: 'Date',
        category: 'datetime',
        icon: 'M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zM16 2v4M8 2v4M3 10h18',
        defaults: {},
    },
    time: {
        label: 'Time',
        category: 'datetime',
        icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6v6l4 2',
        defaults: {},
    },
    file: {
        label: 'File Upload',
        category: 'special',
        icon: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
        defaults: { accept: '' },
    },
    rating: {
        label: 'Rating',
        category: 'special',
        icon: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
        defaults: { maxRating: 5 },
    },
    heading: {
        label: 'Section Heading',
        category: 'layout',
        icon: 'M6 12h12M4 6h16M8 18h8',
        defaults: { headingText: 'Section Title', subtext: '' },
    },
    hidden: {
        label: 'Hidden Field',
        category: 'special',
        icon: 'M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22',
        defaults: { defaultValue: '' },
    },
};

/** Get a flat array of all type keys */
export const ALL_TYPE_KEYS = Object.keys(FIELD_TYPES);

/** Get types grouped by category */
export const getTypesByCategory = () => {
    return FIELD_CATEGORIES.map(cat => ({
        ...cat,
        types: ALL_TYPE_KEYS.filter(key => FIELD_TYPES[key].category === cat.id),
    })).filter(cat => cat.types.length > 0);
};

/** Create a new field with defaults for a given type */
export const createField = (type = 'text') => {
    const def = FIELD_TYPES[type];
    return {
        id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        label: type === 'heading' ? 'Section Title' : 'Untitled Question',
        type,
        required: false,
        ...(def?.defaults || {}),
    };
};
