import { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, X, Send, Sparkles, BarChart3, AlertTriangle, Lightbulb, Trash2, Database } from 'lucide-react';
import './AssessmentChat.css';

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

const SUGGESTED_PROMPTS = [
    { icon: <BarChart3 size={13} />, text: 'Give me a CXO-level summary of our assessment' },
    { icon: <AlertTriangle size={13} />, text: 'What are the top 5 critical gaps and their mitigations?' },
    { icon: <Lightbulb size={13} />, text: 'Which quick wins can we implement in the first 90 days?' },
    { icon: <Sparkles size={13} />, text: 'Compare process maturity across all assessed areas' },
];

function renderMarkdown(text: string) {
    // Lightweight markdown: bold, tables, lists, line breaks
    let html = text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        // Bold
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        // Tables
        .replace(/^\|(.+)\|$/gm, (_, row) => {
            const cells = row.split('|').map((c: string) => c.trim());
            return `<tr>${cells.map((c: string) => `<td>${c}</td>`).join('')}</tr>`;
        })
        // Unordered list items
        .replace(/^- (.+)$/gm, '<li>$1</li>')
        // Numbered list items
        .replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>')
        // Paragraphs (double newline)
        .replace(/\n\n/g, '</p><p>')
        // Single line breaks
        .replace(/\n/g, '<br/>');

    // Wrap consecutive <li> in <ul>
    html = html.replace(/((?:<li>.*?<\/li>\s*(?:<br\/>)?)+)/g, '<ul>$1</ul>');
    // Wrap consecutive <tr> in <table>
    html = html.replace(/((?:<tr>.*?<\/tr>\s*)+)/g, '<table>$1</table>');
    // Strip separator rows (---|---|---)
    html = html.replace(/<tr><td>[\s-]+<\/td>(?:<td>[\s-]+<\/td>)*<\/tr>/g, '');
    // Make first row headers
    html = html.replace(/<table><tr>(.*?)<\/tr>/, (_, row) =>
        `<table><tr>${row.replace(/<td>/g, '<th>').replace(/<\/td>/g, '</th>')}</tr>`
    );

    return `<p>${html}</p>`;
}

export default function AssessmentChat() {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [streaming, setStreaming] = useState(false);
    const [contextLoading, setContextLoading] = useState(false);
    const [conversationId, setConversationId] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, streaming, scrollToBottom]);

    useEffect(() => {
        if (open && inputRef.current) {
            inputRef.current.focus();
        }
    }, [open]);

    const sendMessage = useCallback(async (text: string) => {
        if (!text.trim() || streaming) return;

        const userMsg: ChatMessage = { role: 'user', content: text.trim() };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setStreaming(true);
        setContextLoading(true);

        // Add placeholder assistant message for streaming
        setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

        try {
            const token = localStorage.getItem('token');
            const controller = new AbortController();
            abortRef.current = controller;

            const resp = await fetch('/api/chat/assessment/stream', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    message: text.trim(),
                    conversationId,
                }),
                signal: controller.signal,
            });

            if (!resp.ok) {
                throw new Error(`HTTP ${resp.status}`);
            }

            const reader = resp.body?.getReader();
            if (!reader) throw new Error('No response body');

            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const jsonStr = line.slice(6);
                    try {
                        const data = JSON.parse(jsonStr);

                        if (data.status === 'context_loaded') {
                            setContextLoading(false);
                            continue;
                        }

                        if (data.content) {
                            setMessages(prev => {
                                const updated = [...prev];
                                const last = updated[updated.length - 1];
                                if (last.role === 'assistant') {
                                    updated[updated.length - 1] = { ...last, content: last.content + data.content };
                                }
                                return updated;
                            });
                        }

                        if (data.done) {
                            if (data.conversationId) setConversationId(data.conversationId);
                        }

                        if (data.error) {
                            setMessages(prev => {
                                const updated = [...prev];
                                const last = updated[updated.length - 1];
                                if (last.role === 'assistant') {
                                    updated[updated.length - 1] = { ...last, content: `Error: ${data.error}` };
                                }
                                return updated;
                            });
                        }
                    } catch {
                        // skip malformed JSON
                    }
                }
            }
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                setMessages(prev => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last?.role === 'assistant' && !last.content) {
                        updated[updated.length - 1] = { ...last, content: `Error: ${err.message}` };
                    }
                    return updated;
                });
            }
        } finally {
            setStreaming(false);
            setContextLoading(false);
            abortRef.current = null;
        }
    }, [streaming, conversationId]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(input);
        }
    };

    const handleClear = () => {
        setMessages([]);
        setConversationId(null);
    };

    // Floating action button (closed state)
    if (!open) {
        return (
            <button className="achat-fab" onClick={() => setOpen(true)} title="Ask Your Assessment">
                <MessageSquare size={24} />
                <span className="achat-fab__badge" />
            </button>
        );
    }

    // Chat panel (open state)
    return (
        <div className="achat-panel">
            {/* Header */}
            <div className="achat-header">
                <div className="achat-header__icon">
                    <Sparkles size={16} />
                </div>
                <div className="achat-header__text">
                    <div className="achat-header__title">Ask Your Assessment</div>
                    <div className="achat-header__subtitle">AI-powered insights from your data</div>
                </div>
                <div className="achat-header__actions">
                    {messages.length > 0 && (
                        <button className="achat-header__btn" onClick={handleClear} title="Clear chat">
                            <Trash2 size={14} />
                        </button>
                    )}
                    <button className="achat-header__btn" onClick={() => setOpen(false)} title="Close">
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* Context loading bar */}
            {contextLoading && (
                <div className="achat-context-bar">
                    <Database size={12} />
                    Analyzing gaps, reports, and session data...
                </div>
            )}

            {/* Messages */}
            <div className="achat-messages">
                {messages.length === 0 ? (
                    <div className="achat-welcome">
                        <div className="achat-welcome__icon">
                            <Sparkles size={24} />
                        </div>
                        <div className="achat-welcome__title">Your AI Assessment Consultant</div>
                        <div className="achat-welcome__desc">
                            Ask anything about your assessment — gaps, risks, recommendations, process maturity, or readiness scores. All answers are grounded in your actual data.
                        </div>
                        <div className="achat-suggestions">
                            {SUGGESTED_PROMPTS.map((p, i) => (
                                <button
                                    key={i}
                                    className="achat-suggestion"
                                    onClick={() => sendMessage(p.text)}
                                >
                                    <span className="achat-suggestion__icon">{p.icon}</span>
                                    {p.text}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <>
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`achat-msg achat-msg--${msg.role}`}>
                                <div className="achat-msg__avatar">
                                    {msg.role === 'user' ? 'You' : <Sparkles size={13} />}
                                </div>
                                <div className="achat-msg__bubble">
                                    {msg.role === 'assistant' ? (
                                        msg.content ? (
                                            <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                                        ) : streaming && idx === messages.length - 1 ? (
                                            <div className="achat-streaming">
                                                <span className="achat-streaming__dots">
                                                    <span className="achat-streaming__dot" />
                                                    <span className="achat-streaming__dot" />
                                                    <span className="achat-streaming__dot" />
                                                </span>
                                                {contextLoading ? 'Loading assessment data...' : 'Thinking...'}
                                            </div>
                                        ) : null
                                    ) : (
                                        msg.content
                                    )}
                                </div>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </>
                )}
            </div>

            {/* Input */}
            <div className="achat-input">
                <textarea
                    ref={inputRef}
                    className="achat-input__field"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask about gaps, risks, recommendations..."
                    rows={1}
                    disabled={streaming}
                />
                <button
                    className="achat-input__send"
                    onClick={() => sendMessage(input)}
                    disabled={!input.trim() || streaming}
                    title="Send"
                >
                    <Send size={16} />
                </button>
            </div>
        </div>
    );
}
