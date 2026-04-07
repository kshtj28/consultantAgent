/**
 * Language Service
 * Provides multi-language support for the Readiness Analysis Platform
 */

export const SUPPORTED_LANGUAGES = {
    en: {
        code: 'en',
        name: 'English',
        nativeName: 'English',
        direction: 'ltr',
    },
    hi: {
        code: 'hi',
        name: 'Hindi',
        nativeName: 'हिंदी',
        direction: 'ltr',
    },
    ar: {
        code: 'ar',
        name: 'Arabic',
        nativeName: 'العربية',
        direction: 'rtl',
    },
    fr: {
        code: 'fr',
        name: 'French',
        nativeName: 'Français',
        direction: 'ltr',
    },
    es: {
        code: 'es',
        name: 'Spanish',
        nativeName: 'Español',
        direction: 'ltr',
    },
} as const;

export type LanguageCode = keyof typeof SUPPORTED_LANGUAGES;

export interface LanguageConfig {
    code: LanguageCode;
    name: string;
    nativeName: string;
    direction: 'ltr' | 'rtl';
}

/**
 * Get all supported languages
 */
export function getSupportedLanguages(): LanguageConfig[] {
    return Object.values(SUPPORTED_LANGUAGES);
}

/**
 * Validate if a language code is supported
 */
export function isValidLanguage(code: string): code is LanguageCode {
    return code in SUPPORTED_LANGUAGES;
}

/**
 * Get language configuration by code
 */
export function getLanguageConfig(code: LanguageCode): LanguageConfig {
    return SUPPORTED_LANGUAGES[code];
}

/**
 * Get LLM prompt instructions for a specific language
 * These instructions are appended to prompts to ensure AI responds in the correct language
 */
export function getLanguageInstructions(code: LanguageCode): string {
    const language = SUPPORTED_LANGUAGES[code];

    const instructions: Record<LanguageCode, string> = {
        en: `## LANGUAGE REQUIREMENT
You MUST respond entirely in English. All question text, options, and follow-up topics must be in English.`,
        hi: `## LANGUAGE REQUIREMENT — CRITICAL
कृपया हिंदी में उत्तर दें।
You MUST generate ALL content in Hindi (Devanagari script). This includes:
- The "question" field — MUST be in Hindi
- All "options" — MUST be in Hindi
- All "followUpTopics" — MUST be in Hindi
Do NOT write any question text, options, or topics in English. The entire response must be in Hindi.`,
        ar: `## LANGUAGE REQUIREMENT — CRITICAL
الرجاء الرد باللغة العربية.
You MUST generate ALL content in Arabic (Arabic script). This includes:
- The "question" field — MUST be in Arabic
- All "options" — MUST be in Arabic
- All "followUpTopics" — MUST be in Arabic
Do NOT write any question text, options, or topics in English. The entire response must be in Arabic.
Use right-to-left text direction.`,
        fr: `## LANGUAGE REQUIREMENT — CRITICAL
Répondez en français.
You MUST generate ALL content in French. This includes:
- The "question" field — MUST be in French
- All "options" — MUST be in French
- All "followUpTopics" — MUST be in French
Do NOT write any question text, options, or topics in English. The entire response must be in French.`,
        es: `## LANGUAGE REQUIREMENT — CRITICAL
Responda en español.
You MUST generate ALL content in Spanish. This includes:
- The "question" field — MUST be in Spanish
- All "options" — MUST be in Spanish
- All "followUpTopics" — MUST be in Spanish
Do NOT write any question text, options, or topics in English. The entire response must be in Spanish.`,
    };

    return instructions[code] || instructions.en;
}

/**
 * Get translated Yes/No options based on language
 */
export function getYesNoOptions(code: LanguageCode): [string, string] {
    const options: Record<LanguageCode, [string, string]> = {
        en: ['Yes', 'No'],
        hi: ['हाँ', 'नहीं'],
        ar: ['نعم', 'لا'],
        fr: ['Oui', 'Non'],
        es: ['Sí', 'No'],
    };
    return options[code] || options.en;
}

/**
 * Get UI translation strings for a language
 * This provides basic UI labels - can be extended or moved to separate JSON files
 */
export function getUITranslations(code: LanguageCode): Record<string, string> {
    const translations: Record<LanguageCode, Record<string, string>> = {
        en: {
            startAssessment: 'Start Assessment',
            selectAreas: 'Select Areas to Assess',
            nextQuestion: 'Next Question',
            submit: 'Submit',
            generateReport: 'Generate Report',
            progress: 'Progress',
            complete: 'Complete',
            inProgress: 'In Progress',
            notStarted: 'Not Started',
        },
        hi: {
            startAssessment: 'मूल्यांकन शुरू करें',
            selectAreas: 'मूल्यांकन के लिए क्षेत्र चुनें',
            nextQuestion: 'अगला प्रश्न',
            submit: 'जमा करें',
            generateReport: 'रिपोर्ट बनाएं',
            progress: 'प्रगति',
            complete: 'पूर्ण',
            inProgress: 'प्रगति में',
            notStarted: 'शुरू नहीं हुआ',
        },
        ar: {
            startAssessment: 'بدء التقييم',
            selectAreas: 'اختر المجالات للتقييم',
            nextQuestion: 'السؤال التالي',
            submit: 'إرسال',
            generateReport: 'إنشاء التقرير',
            progress: 'التقدم',
            complete: 'مكتمل',
            inProgress: 'قيد التنفيذ',
            notStarted: 'لم يبدأ',
        },
        fr: {
            startAssessment: 'Démarrer l\'évaluation',
            selectAreas: 'Sélectionner les domaines à évaluer',
            nextQuestion: 'Question suivante',
            submit: 'Soumettre',
            generateReport: 'Générer le rapport',
            progress: 'Progression',
            complete: 'Terminé',
            inProgress: 'En cours',
            notStarted: 'Non commencé',
        },
        es: {
            startAssessment: 'Iniciar evaluación',
            selectAreas: 'Seleccionar áreas a evaluar',
            nextQuestion: 'Siguiente pregunta',
            submit: 'Enviar',
            generateReport: 'Generar informe',
            progress: 'Progreso',
            complete: 'Completo',
            inProgress: 'En progreso',
            notStarted: 'No iniciado',
        },
    };

    return translations[code] || translations.en;
}
