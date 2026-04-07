import { describe, it, expect } from 'vitest';
import {
    SUPPORTED_LANGUAGES,
    getSupportedLanguages,
    isValidLanguage,
    getLanguageConfig,
    getLanguageInstructions,
    getUITranslations,
    LanguageCode,
} from '../services/languageService';

describe('Language Service', () => {
    describe('SUPPORTED_LANGUAGES', () => {
        it('should contain 5 supported languages', () => {
            const languages = Object.keys(SUPPORTED_LANGUAGES);
            expect(languages).toHaveLength(5);
            expect(languages).toContain('en');
            expect(languages).toContain('hi');
            expect(languages).toContain('ar');
            expect(languages).toContain('fr');
            expect(languages).toContain('es');
        });

        it('should have correct structure for each language', () => {
            for (const lang of Object.values(SUPPORTED_LANGUAGES)) {
                expect(lang).toHaveProperty('code');
                expect(lang).toHaveProperty('name');
                expect(lang).toHaveProperty('nativeName');
                expect(lang).toHaveProperty('direction');
                expect(['ltr', 'rtl']).toContain(lang.direction);
            }
        });

        it('should mark Arabic as RTL', () => {
            expect(SUPPORTED_LANGUAGES.ar.direction).toBe('rtl');
        });

        it('should mark English as LTR', () => {
            expect(SUPPORTED_LANGUAGES.en.direction).toBe('ltr');
        });
    });

    describe('getSupportedLanguages', () => {
        it('should return array of language configs', () => {
            const languages = getSupportedLanguages();
            expect(Array.isArray(languages)).toBe(true);
            expect(languages.length).toBe(5);
        });

        it('should return language objects with all required fields', () => {
            const languages = getSupportedLanguages();
            for (const lang of languages) {
                expect(lang.code).toBeDefined();
                expect(lang.name).toBeDefined();
                expect(lang.nativeName).toBeDefined();
                expect(lang.direction).toBeDefined();
            }
        });
    });

    describe('isValidLanguage', () => {
        it('should return true for valid language codes', () => {
            expect(isValidLanguage('en')).toBe(true);
            expect(isValidLanguage('hi')).toBe(true);
            expect(isValidLanguage('ar')).toBe(true);
            expect(isValidLanguage('fr')).toBe(true);
            expect(isValidLanguage('es')).toBe(true);
        });

        it('should return false for invalid language codes', () => {
            expect(isValidLanguage('invalid')).toBe(false);
            expect(isValidLanguage('zz')).toBe(false);
            expect(isValidLanguage('')).toBe(false);
            expect(isValidLanguage('EN')).toBe(false); // Case sensitive
        });
    });

    describe('getLanguageConfig', () => {
        it('should return correct config for English', () => {
            const config = getLanguageConfig('en');
            expect(config.code).toBe('en');
            expect(config.name).toBe('English');
            expect(config.direction).toBe('ltr');
        });

        it('should return correct config for Arabic', () => {
            const config = getLanguageConfig('ar');
            expect(config.code).toBe('ar');
            expect(config.name).toBe('Arabic');
            expect(config.nativeName).toBe('العربية');
            expect(config.direction).toBe('rtl');
        });

        it('should return correct config for Hindi', () => {
            const config = getLanguageConfig('hi');
            expect(config.code).toBe('hi');
            expect(config.name).toBe('Hindi');
            expect(config.nativeName).toBe('हिंदी');
        });
    });

    describe('getLanguageInstructions', () => {
        it('should return English instructions for en', () => {
            const instructions = getLanguageInstructions('en');
            expect(instructions).toBe('Respond in English.');
        });

        it('should return Hindi instructions with Devanagari mention', () => {
            const instructions = getLanguageInstructions('hi');
            expect(instructions).toContain('Hindi');
            expect(instructions).toContain('Devanagari');
        });

        it('should return Arabic instructions with RTL mention', () => {
            const instructions = getLanguageInstructions('ar');
            expect(instructions).toContain('Arabic');
            expect(instructions).toContain('right-to-left');
        });

        it('should return French instructions', () => {
            const instructions = getLanguageInstructions('fr');
            expect(instructions).toContain('French');
            expect(instructions).toContain('français');
        });

        it('should return Spanish instructions', () => {
            const instructions = getLanguageInstructions('es');
            expect(instructions).toContain('Spanish');
            expect(instructions).toContain('español');
        });
    });

    describe('getUITranslations', () => {
        it('should return English translations for en', () => {
            const translations = getUITranslations('en');
            expect(translations.startAssessment).toBe('Start Assessment');
            expect(translations.submit).toBe('Submit');
        });

        it('should return Hindi translations for hi', () => {
            const translations = getUITranslations('hi');
            expect(translations.startAssessment).toBe('मूल्यांकन शुरू करें');
            expect(translations.submit).toBe('जमा करें');
        });

        it('should return Arabic translations for ar', () => {
            const translations = getUITranslations('ar');
            expect(translations.startAssessment).toBe('بدء التقييم');
            expect(translations.submit).toBe('إرسال');
        });

        it('should have all required keys for each language', () => {
            const requiredKeys = [
                'startAssessment',
                'selectAreas',
                'nextQuestion',
                'submit',
                'generateReport',
                'progress',
                'complete',
                'inProgress',
                'notStarted',
            ];

            const languages: LanguageCode[] = ['en', 'hi', 'ar', 'fr', 'es'];
            for (const lang of languages) {
                const translations = getUITranslations(lang);
                for (const key of requiredKeys) {
                    expect(translations[key]).toBeDefined();
                    expect(translations[key].length).toBeGreaterThan(0);
                }
            }
        });
    });
});
