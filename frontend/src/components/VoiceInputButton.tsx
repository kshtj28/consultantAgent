import { useCallback } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { useVoiceInput } from '../hooks/useVoiceInput';

interface VoiceInputButtonProps {
    onTranscript: (text: string) => void;
    lang?: string;
    className?: string;
}

export default function VoiceInputButton({ onTranscript, lang, className }: VoiceInputButtonProps) {
    const { isListening, isSupported, toggle, error } = useVoiceInput({ onTranscript, lang });

    const handleClick = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        toggle();
    }, [toggle]);

    if (!isSupported) return null;

    return (
        <>
        <button
            type="button"
            onClick={handleClick}
            title={isListening ? 'Stop recording' : 'Voice input'}
            className={[
                'voice-input-btn',
                isListening ? 'voice-input-btn--listening' : '',
                className ?? '',
            ].join(' ').trim()}
            style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
                color: isListening ? '#ef4444' : 'inherit',
                opacity: 0.8,
                transition: 'opacity 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.8'; }}
        >
            {isListening ? (
                <MicOff
                    size={16}
                    style={{ animation: 'pulse 1s ease-in-out infinite' }}
                />
            ) : (
                <Mic size={16} />
            )}
        </button>
        {error && (
            <span style={{ color: '#ef4444', fontSize: '12px', marginLeft: '4px' }}>
                {error}
            </span>
        )}
        </>
    );
}
