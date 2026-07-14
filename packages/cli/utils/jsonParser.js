/**
 * Safely parse JSON from AI outputs.
 * Handles markdown code block stripping and common truncation issues.
 */
export const parseAiJson = (text) => {
    let cleanedText = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    
    try {
        return JSON.parse(cleanedText);
    } catch (e) {
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
