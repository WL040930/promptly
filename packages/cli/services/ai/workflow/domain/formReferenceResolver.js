const MAX_OPTIONS = 8;
const MIN_MATCH_SCORE = 0.5;
const TIE_MARGIN = 0.05;

const normalizeText = value => String(value || '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const stemToken = token => {
    if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
    if (token.length > 4 && token.endsWith('es')) return token.slice(0, -2);
    if (token.length > 3 && token.endsWith('s')) return token.slice(0, -1);
    return token;
};

const tokensFor = value => normalizeText(value)
    .split(' ')
    .map(stemToken)
    .filter(Boolean);

const tokenOverlap = (titleTokens, requestTokens) => {
    if (titleTokens.length === 0 || requestTokens.length === 0) return 0;
    const requestSet = new Set(requestTokens);
    return titleTokens.filter(token => requestSet.has(token)).length / titleTokens.length;
};

const bestTokenWindowScore = (titleTokens, requestTokens) => {
    if (titleTokens.length === 0 || requestTokens.length === 0) return 0;
    const windowLengths = new Set([
        Math.max(1, titleTokens.length - 1),
        titleTokens.length,
        titleTokens.length + 1
    ]);
    let best = 0;
    for (const length of windowLengths) {
        for (let index = 0; index <= requestTokens.length - length; index += 1) {
            best = Math.max(best, tokenOverlap(titleTokens, requestTokens.slice(index, index + length)));
        }
    }
    return best;
};

const scoreForm = (request, form) => {
    const title = normalizeText(form?.title);
    const requestText = normalizeText(request);
    const titleTokens = tokensFor(form?.title);
    const requestTokens = tokensFor(request);
    if (!title || titleTokens.length === 0 || !requestText) return 0;

    // A literal title phrase is the strongest possible signal. This covers
    // requests such as “the Event Registration form was submitted”.
    if (requestText.includes(title)) return 1;

    // A one-word form title is too generic to infer from a partial match.
    if (titleTokens.length < 2) return 0;
    return bestTokenWindowScore(titleTokens, requestTokens);
};

/**
 * Resolve a natural-language form reference against summaries the caller has
 * already ownership-checked. The module never queries the database and never
 * returns a form that was not supplied by the caller.
 */
export const resolveFormReference = ({ request = '', forms = [] } = {}) => {
    const candidates = forms
        .filter(form => form?.id && form?.title)
        .map((form, index) => ({ form, index, score: scoreForm(request, form) }))
        .filter(candidate => candidate.score >= MIN_MATCH_SCORE)
        .sort((left, right) => right.score - left.score || left.index - right.index);

    if (candidates.length === 0) return { status: 'missing', options: [] };

    const best = candidates[0];
    const tied = candidates.filter(candidate => best.score - candidate.score <= TIE_MARGIN);
    if (tied.length > 1) {
        return {
            status: 'ambiguous',
            options: tied.slice(0, MAX_OPTIONS).map(candidate => candidate.form)
        };
    }

    return { status: 'selected', form: best.form };
};

export const formReferenceResolverInternals = Object.freeze({
    normalizeText,
    scoreForm,
    MIN_MATCH_SCORE,
    TIE_MARGIN
});
