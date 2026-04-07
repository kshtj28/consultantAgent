import { useState, useCallback, useRef, useEffect } from 'react';

// Web Speech API types (not yet in standard TypeScript DOM lib)
declare global {
    interface Window {
        SpeechRecognition: typeof SpeechRecognition;
        webkitSpeechRecognition: typeof SpeechRecognition;
    }
}

interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start(): void;
    stop(): void;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
    onend: (() => void) | null;
}

declare const SpeechRecognition: {
    new (): SpeechRecognition;
};

interface SpeechRecognitionResult {
    readonly length: number;
    item(index: number): SpeechRecognitionAlternative;
    [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
    readonly transcript: string;
    readonly confidence: number;
}

interface SpeechRecognitionResultList {
    readonly length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
    error: string;
}

export interface UseVoiceInputOptions {
    onTranscript: (text: string) => void;
    lang?: string; // BCP-47 language tag, e.g. 'en-US', 'ar-SA', 'hi-IN'
}

export interface UseVoiceInputReturn {
    isListening: boolean;
    isSupported: boolean;
    startListening: () => void;
    stopListening: () => void;
    toggle: () => void;
    /** @deprecated use toggle instead */
    toggleListening: () => void;
    error: string | null;
}

export function useVoiceInput({ onTranscript, lang = 'en-US' }: UseVoiceInputOptions): UseVoiceInputReturn {
    const [isListening, setIsListening] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const recognitionRef = useRef<SpeechRecognition | null>(null);

    const SpeechRecognitionAPI =
        typeof window !== 'undefined'
            ? window.SpeechRecognition || (window as any).webkitSpeechRecognition
            : null;

    const isSupported = !!SpeechRecognitionAPI;

    const stopListening = useCallback(() => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }
        setIsListening(false);
    }, []);

    const startListening = useCallback(() => {
        if (!SpeechRecognitionAPI) {
            setError('Speech recognition is not supported in this browser');
            return;
        }

        const recognition = new SpeechRecognitionAPI();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = lang;

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            const transcript = Array.from(event.results)
                .map((result: SpeechRecognitionResult) => result[0].transcript)
                .join(' ')
                .trim();
            onTranscript(transcript);
        };

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            if (event.error !== 'aborted') {
                setError(`Speech error: ${event.error}`);
            }
            setIsListening(false);
            recognitionRef.current = null;
        };

        recognition.onend = () => {
            setIsListening(false);
            recognitionRef.current = null;
        };

        recognitionRef.current = recognition;
        recognition.start();
        setIsListening(true);
        setError(null);
    }, [SpeechRecognitionAPI, lang, onTranscript]);

    const toggle = useCallback(() => {
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    }, [isListening, startListening, stopListening]);

    // Keep backward-compat alias
    const toggleListening = toggle;

    useEffect(() => {
        return () => {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
        };
    }, []);

    return { isListening, isSupported, startListening, stopListening, toggle, toggleListening, error };
}
