import { pageMetadataForPath } from '../../../shared/siteSeo.js';

const setMeta = (selector, attributes) => {
    let element = document.head.querySelector(selector);
    if (!element) {
        element = document.createElement('meta');
        document.head.appendChild(element);
    }
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
};

const setCanonical = href => {
    let element = document.head.querySelector('link[rel="canonical"]');
    if (!href) {
        element?.remove();
        return;
    }
    if (!element) {
        element = document.createElement('link');
        element.setAttribute('rel', 'canonical');
        document.head.appendChild(element);
    }
    element.setAttribute('href', href);
};

export const applySiteMetadata = (pathname = window.location.pathname) => {
    const metadata = pageMetadataForPath(pathname);
    const origin = window.location.origin.replace(/\/$/, '');
    const canonical = metadata.indexable ? `${origin}${pathname === '/' ? '/' : pathname.replace(/\/$/, '')}` : null;

    document.title = metadata.title;
    setMeta('meta[name="description"]', { name: 'description', content: metadata.description });
    setMeta('meta[name="robots"]', { name: 'robots', content: metadata.indexable ? 'index, follow' : 'noindex, nofollow' });
    setMeta('meta[property="og:title"]', { property: 'og:title', content: metadata.title });
    setMeta('meta[property="og:description"]', { property: 'og:description', content: metadata.description });
    setMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' });
    setMeta('meta[property="og:url"]', { property: 'og:url', content: canonical || `${origin}${pathname}` });
    setMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary' });
    setCanonical(canonical);

    return metadata;
};
