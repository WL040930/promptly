export const hasFallbackToolMarkup = text => /<TOOL\b/i.test(String(text || ''));

export const parseFallbackToolCall = text => {
    const source = String(text || '');
    const wrappedMatch = source.match(/<TOOL\s*>(.*?)<\/TOOL\s*>/is);
    if (wrappedMatch) {
        try {
            const value = JSON.parse(wrappedMatch[1]);
            return value && typeof value.name === 'string' ? value : null;
        } catch {
            return null;
        }
    }

    const selfClosingMatch = source.match(/<TOOL\b([^>]*?)\/\s*>/is);
    if (!selfClosingMatch) return null;

    const attributes = {};
    const attributePattern = /([a-z][\w-]*)\s*=\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|([^\s>]+))/gi;
    for (const match of selfClosingMatch[1].matchAll(attributePattern)) {
        const value = match[2] ?? match[3] ?? match[4] ?? '';
        attributes[match[1].toLowerCase()] = value
            .replace(/&quot;/gi, '"')
            .replace(/&#39;|&apos;/gi, "'")
            .replace(/&amp;/gi, '&')
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/\\(["'])/g, '$1');
    }

    const name = attributes.name;
    if (!name) return null;

    try {
        const args = attributes.args ? JSON.parse(attributes.args) : {};
        return { name, args };
    } catch {
        return null;
    }
};
