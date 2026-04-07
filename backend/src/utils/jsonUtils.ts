/**
 * Robust JSON extraction and parsing utility for LLM responses.
 * Handles common LLM output issues like unescaped quotes, trailing commas, 
 * and Markdown formatting wrapping the JSON.
 */

export function extractJSON<T = any>(text: string): T | null {
    if (!text) return null;

    // 1. Remove Markdown code blocks if present
    let cleaned = text.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, '$1').trim();

    // 2. Find the first '{' and last '}' (or '[' and ']')
    const firstBrace = cleaned.indexOf('{');
    const firstBracket = cleaned.indexOf('[');
    const lastBrace = cleaned.lastIndexOf('}');
    const lastBracket = cleaned.lastIndexOf(']');

    let start = -1;
    let end = -1;

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
        start = firstBrace;
        end = lastBrace;
    } else if (firstBracket !== -1) {
        start = firstBracket;
        end = lastBracket;
    }

    if (start === -1 || end === -1 || end < start) {
        // Fallback to searching if cleaned version failed
        const m = text.match(/[\{\[][\s\S]*[\}\]]/);
        if (m) {
            cleaned = m[0];
        } else {
            return null;
        }
    } else {
        cleaned = cleaned.substring(start, end + 1);
    }

    // 3. Attempt simple parse first
    try {
        return JSON.parse(cleaned);
    } catch (e) {
        // 4. If parse fails, attempt basic repairs
        try {
            const repaired = repairJSONString(cleaned);
            return JSON.parse(repaired);
        } catch (e2) {
            console.error('[JSONUtils] Failed to parse/repair JSON:', e2);
            console.debug('[JSONUtils] Faulty JSON string:', cleaned);
            return null;
        }
    }
}

/**
 * Attempts to repair common JSON syntax errors from LLMs.
 * - Handles unescaped newlines in strings.
 * - Fixes some unescaped quotes (heuristic-based).
 * - Removes trailing commas in objects and arrays.
 */
function repairJSONString(json: string): string {
    let s = json.trim();

    // Fix unescaped newlines in middle of strings
    // (matches a quote, some text, a literal newline, then more text until next quote)
    // This is risky but often needed for long LLM descriptions
    s = s.replace(/"([^"]*?)\n([^"]*?)"/g, '"$1\\n$2"');

    // Remove trailing commas before closing braces/brackets
    s = s.replace(/,\s*([\}\]])/g, '$1');

    // Fix common "unescaped double quote" issue for nested strings
    // If we see a " followed by text that isn't a key or a value-ending quote,
    // it might be an internal quote. This is very hard to fix perfectly via regex.
    // We'll focus on the most common error: "Some word "quoted" more words"
    // s = s.replace(/: \s*"([\s\S]*?)"/g, (match, p1) => {
    //    // escape internal quotes in values
    //    return ': "' + p1.replace(/(?<!\\)"/g, '\\"') + '"';
    // });

    return s;
}

/**
 * Safer version of JSON.parse that handles common LLM formatting.
 */
export function safeParseJSON<T = any>(text: string, fallback: T): T {
    try {
        const result = extractJSON<T>(text);
        return result !== null ? result : fallback;
    } catch (e) {
        return fallback;
    }
}
