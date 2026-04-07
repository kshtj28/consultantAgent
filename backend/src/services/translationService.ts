import { generateCompletion, LLMMessage } from './llmService';
import { InterviewAnswer } from './interviewService';
import { SUPPORTED_LANGUAGES, LanguageCode } from './languageService';
import { extractJSON } from '../utils/jsonUtils';

export interface TranslatedResponse {
    questionId: string;
    translatedQuestion: string;
    translatedAnswer: string;
}

/**
 * Batch translates interview responses into a target language.
 */
export async function translateInterviewHistory(
    responses: Record<string, InterviewAnswer[]>,
    targetLanguage: string,
    modelId?: string
): Promise<Record<string, InterviewAnswer[]>> {
    const langCode = targetLanguage as LanguageCode;
    const langConfig = SUPPORTED_LANGUAGES[langCode] || SUPPORTED_LANGUAGES.en;
    
    // Flatten all responses to translate in fewer calls
    const flattened: { areaId: string; index: number; q: string; a: any }[] = [];
    Object.entries(responses).forEach(([areaId, answers]) => {
        answers.forEach((ans, idx) => {
            flattened.push({ areaId, index: idx, q: ans.question, a: ans.answer });
        });
    });

    if (flattened.length === 0) return responses;

    const transcript = flattened.map((f, i) => `${i+1}. Q: ${f.q}\nA: ${JSON.stringify(f.a)}`).join('\n\n');

    const prompt = `You are a professional business translator. 
Translate the following interview transcript into **${langConfig.name}** (${langConfig.nativeName}).

## TRANSCRIPT TO TRANSLATE
${transcript}

## INSTRUCTIONS
1. Translate BOTH the questions and the answers.
2. Maintain the exact meaning and professional tone/context (ERP/Business Analysis).
3. If an answer is a list or a number, only translate the textual components.
4. Output ONLY a JSON array of objects with the exact same order as the input:
   [
     { "q": "Translated Question 1", "a": "Translated Answer 1" },
     ...
   ]

Return ONLY the JSON array.`;

    const messages: LLMMessage[] = [
        { role: 'system', content: 'You are a precise business translator. Output only JSON.' },
        { role: 'user', content: prompt }
    ];

    try {
        const completion = await generateCompletion(modelId || null, messages, { temperature: 0.1 });
        const translated = extractJSON<{ q: string; a: any }[]>(completion.content);

        if (Array.isArray(translated) && translated.length === flattened.length) {
            // Reconstruct the responses object with translated values
            const newResponses: Record<string, InterviewAnswer[]> = JSON.parse(JSON.stringify(responses));
            flattened.forEach((f, i) => {
                const trans = translated[i];
                newResponses[f.areaId][f.index].question = trans.q;
                // For 'a', we need to be careful if it was a number or array
                if (typeof f.a === 'string') {
                    newResponses[f.areaId][f.index].answer = trans.a;
                } else if (Array.isArray(f.a)) {
                    // Try to parse array if LLM returned a string-formatted array, or trust string version
                    newResponses[f.areaId][f.index].answer = trans.a;
                } else {
                    // Keep number as is
                    newResponses[f.areaId][f.index].answer = f.a;
                }
            });
            return newResponses;
        }
    } catch (err) {
        console.error('Batch translation failed:', err);
    }

    return responses; // Fallback to original on error
}
