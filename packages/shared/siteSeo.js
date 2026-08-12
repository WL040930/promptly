const INDEXABLE_PATHS = new Set(['/', '/security']);

const stripQueryAndHash = value => String(value || '/').split(/[?#]/, 1)[0] || '/';

export const normalizeSitePath = value => {
    const pathname = stripQueryAndHash(value);
    if (pathname === '/') return pathname;
    return pathname.replace(/\/+$/, '') || '/';
};

export const isIndexableSitePath = value => INDEXABLE_PATHS.has(normalizeSitePath(value));

export const robotsDirectiveForPath = value => isIndexableSitePath(value) ? 'index, follow' : 'noindex, nofollow';

export const sitemapPaths = () => [...INDEXABLE_PATHS];

export const pageMetadataForPath = value => {
    const pathname = normalizeSitePath(value);
    if (pathname === '/security') {
        return {
            title: 'Security | Promptly',
            description: 'Learn how Promptly protects automation workflows with authenticated access, request limits, and practical security controls.',
            indexable: true
        };
    }
    if (pathname.startsWith('/f/')) {
        return {
            title: 'Secure form | Promptly',
            description: 'Complete this form securely with Promptly.',
            indexable: false
        };
    }
    if (pathname === '/') {
        return {
            title: 'Promptly | Build trusted automations with AI',
            description: 'Promptly turns plain-language intent into reviewable workflows your team can understand, approve, and run.',
            indexable: true
        };
    }
    return {
        title: 'Promptly',
        description: 'Promptly helps teams build trusted automations with AI.',
        indexable: false
    };
};
