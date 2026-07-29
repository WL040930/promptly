const normalizeName = value => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();

/** Finds only a safe exact match; partial matches always require a user choice. */
export const discoverResource = ({ options = [], query = '' } = {}) => {
    const name = normalizeName(query);
    const candidates = (options || []).filter(option => option?.value && option?.label);
    const exact = candidates.filter(option => normalizeName(option.label) === name);
    if (exact.length === 1) return { status: 'selected', option: exact[0] };
    const partial = name ? candidates.filter(option => normalizeName(option.label).includes(name)) : [];
    return { status: exact.length > 1 || partial.length > 0 ? 'ambiguous' : 'missing', options: (exact.length > 1 ? exact : partial).slice(0, 8) };
};
