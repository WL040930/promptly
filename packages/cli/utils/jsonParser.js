const missingSeparatorPosition = error => {
    const match = String(error?.message || '').match(/^Expected ',' or '[}\]]' after (?:array element|property value) in JSON at position (\d+)/);
    return match ? Number(match[1]) : null;
};

const isJsonValueEnd = character => /[}\]"0-9a-z]/i.test(character || '');
const isJsonValueStart = character => /[\[{"0-9tfn-]/i.test(character || '');
const MAX_MISSING_SEPARATOR_RECOVERIES = 8;

const recoverMissingSeparator = (text, error) => {
    let candidate = text;
    let parserError = error;
    for (let repairCount = 0; repairCount < MAX_MISSING_SEPARATOR_RECOVERIES; repairCount += 1) {
        const position = missingSeparatorPosition(parserError);
        if (!Number.isInteger(position) || position <= 0 || position >= candidate.length) return null;

        const before = candidate.slice(0, position);
        const after = candidate.slice(position);
        const previousCharacter = before.trimEnd().at(-1);
        const nextCharacter = after.trimStart().at(0);
        if (!isJsonValueEnd(previousCharacter) || !isJsonValueStart(nextCharacter)) return null;

        candidate = `${before},${after}`;
        try {
            return JSON.parse(candidate);
        } catch (nextError) {
            parserError = nextError;
        }
    }
    return null;
};

/**
 * Safely parse JSON from AI outputs.
 * Handles markdown code block stripping and common truncation issues.
 */
export const parseAiJson = (text, { recoverTruncation = true, recoverMissingSeparator: shouldRecoverMissingSeparator = false } = {}) => {
    let cleanedText = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    
    try {
        return JSON.parse(cleanedText);
    } catch (e) {
        if (shouldRecoverMissingSeparator) {
            const recovered = recoverMissingSeparator(cleanedText, e);
            if (recovered !== null) return recovered;
        }
        if (!recoverTruncation) throw e;

        // Fallback for truncated JSON commonly seen with LLMs hitting token limits
        if (cleanedText.endsWith(']')) {
            cleanedText += '}';
        } else if (!cleanedText.endsWith('}')) {
            cleanedText += ']}';
        }
        
        try {
            return JSON.parse(cleanedText);
        } catch (fallbackError) {
            // If fallback also fails, throw original parsing error for accurate logging
            throw e;
        }
    }
};
