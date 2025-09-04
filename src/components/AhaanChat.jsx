import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import "./ahaan.css";

/**
 * Ahaan Chat UI (JavaScript + Axios)
 * - Rotating Ahaan icon while waiting ("thinking")
 * - Typewriter effect for the response
 * - Stable 3-row layout: header | scrollable main | bottom dock
 */

export default function AhaanChat() {
    const [messages, setMessages] = useState([
        { id: nanoid(), role: "assistant", content: "", done: true },
    ]);
    const [input, setInput] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [controller, setController] = useState(null);
    const scrollerRef = useRef(null);

    const hasUserMsgs = messages.some((m) => m.role === "user");
    const isHome = !hasUserMsgs; // hero screen until first user message

    useEffect(() => {
        if (scrollerRef.current) {
            scrollerRef.current.scrollTo({
                top: scrollerRef.current.scrollHeight,
                behavior: "smooth",
            });
        }
    }, [messages.length]);

    async function onSend() {
        const text = input.trim();
        if (!text || isSending) return;

        const userMsg = { id: nanoid(), role: "user", content: text, done: true };
        const assistantMsg = {
            id: nanoid(),
            role: "assistant",
            content: "",
            done: false,
            thinking: true,
        };

        if (isHome) setMessages([userMsg, assistantMsg]);
        else setMessages((m) => [...m, userMsg, assistantMsg]);

        setInput("");
        setIsSending(true);

        const ctrl = new AbortController();
        setController(ctrl);

        try {
            const fullText = await callChatApi({ prompt: text, signal: ctrl.signal });

            // stop spinning -> start typing
            setMessages((m) =>
                m.map((msg) =>
                    msg.id === assistantMsg.id
                        ? { ...msg, thinking: false, content: "", done: false }
                        : msg
                )
            );

            await typewriterAppend(setMessages, assistantMsg.id, fullText, 10);
            setMessages((m) =>
                m.map((msg) =>
                    msg.id === assistantMsg.id ? { ...msg, done: true } : msg
                )
            );
        } catch (err) {
            if (err?.name === "AbortError") return;
            setMessages((m) =>
                m.map((msg) =>
                    msg.id === assistantMsg.id
                        ? {
                            ...msg,
                            thinking: false,
                            error: true,
                            content: "Sorry—something went wrong.",
                            done: true,
                        }
                        : msg
                )
            );
        } finally {
            setIsSending(false);
            setController(null);
        }
    }

    function onKeyDown(e) {
        if ((e.key === "Enter" || e.keyCode === 13) && !e.shiftKey) {
            e.preventDefault();
            onSend();
        }
    }

    function onCancel() {
        if (controller) controller.abort();
    }

    return (
        <div className="page">
            {/* Header */}
            <div className="topbar">
                <div className="brand">
                    <AhaanLogo />
                    <div className="titles">
                        <strong>Ahaan</strong>
                        <span>Explore, Dream, and Discover!</span>
                    </div>
                </div>
            </div>

            {/* Main */}
            <div className="main">
                {isHome ? (
                    <Hero />
                ) : (
                    <div className="stage col">
                        <div className="chat" ref={scrollerRef}>
                            {messages.map((m) => (
                                <Message key={m.id} msg={m} />
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom dock (always visible) */}
            <div className="bottombar">
                <div className="stage">
                    <Composer
                        value={input}
                        onChange={setInput}
                        onSend={onSend}
                        disabled={isSending}
                        onKeyDown={onKeyDown}
                        onCancel={onCancel}
                        isSending={isSending}
                    />
                </div>
            </div>
        </div>
    );
}

/* ----- Hero (welcome) ----- */
function Hero() {
    const quick = [
        "Save me time",
        "Tell me what you can do",
        "Help me plan",
        "Research a topic",
    ];
    return (
        <div className="hero">
            <h1>Hello, Wyatt!</h1>
            <p>How can Ahaan assist you today?</p>
            <div className="chips">
                {quick.map((q) => (
                    <button className="chip" key={q}>
                        {q}
                    </button>
                ))}
            </div>
        </div>
    );
}

/* ----- Message bubble ----- */
function Message({ msg }) {
    const isUser = msg.role === "user";
    return (
        <div className={`row ${isUser ? "right" : "left"}`}>
            {!isUser && (
                <div
                    className={`avatar ${msg.thinking ? "spin" : ""}`}
                    aria-label="Ahaan"
                >
                    <AhaanLogo />
                </div>
            )}

            <div
                className={`bubble ${isUser ? "user" : "assistant"} ${msg.error ? "error" : ""
                    }`}
            >
                {msg.thinking ? <TypingDots /> : <RichText text={msg.content} />}
            </div>

            {isUser && (
                <div className="user-meta">
                    <div className="user-name">Wyatt</div>
                    <div className="user-badge">W</div>
                </div>
            )}
        </div>
    );
}

/* ----- Small pieces ----- */
function TypingDots() {
    return (
        <div className="dots" aria-live="polite" aria-label="Ahaan is thinking">
            <span></span>
            <span></span>
            <span></span>
        </div>
    );
}

function RichText({ text }) {
    const paragraphs = String(text || "").split(/\r?\n\r?\n/g).filter(Boolean);
    return (
        <div>
            {paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
            ))}
        </div>
    );
}

function Composer({
    value,
    onChange,
    onSend,
    disabled,
    onKeyDown,
    onCancel,
    isSending,
}) {
    return (
        <div className="composer">
            <input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ask Ahaan anything…"
                aria-label="Message Ahaan"
            />
            <button
                className="primary"
                onClick={onSend}
                disabled={!value.trim() || disabled || isSending}
                aria-label="Send"
                title="Send"
                style={{ opacity: isSending ? 0.6 : 1 }}
            >
                ▶
            </button>
        </div>
    );
}

/* ----- Axios client & API call ----- */
const api = axios.create({ baseURL: "/api" });

async function callChatApi({ prompt, signal }) {
    try {
        // const { data } = await api.post("/chat", { prompt }, { signal });
        // return data?.choices?.[0]?.message?.content || data?.text || "";
    } catch (e) {
        // fall back to mock
    }
    const data = await mockChat({ prompt });
    return data.choices[0].message.content;
}

function mockChat({ prompt }) {
    const SAMPLE_JSON = {
        id: "chatcmpl_mock",
        choices: [
            {
                index: 0,
                message: {
                    role: "assistant",
                    content: `Here are some ideas for: “${prompt}”

1) Start with what you know and build from a concrete example.
2) Read in the same genre to mirror structure and tone.
3) Write daily—momentum matters more than length.
4) Show, don’t tell—use actions and sensory details.
5) Expect messy first drafts; revise later.`,
                },
                finish_reason: "stop",
            },
        ],
        created: Date.now(),
        model: "mock-gpt",
    };
    return new Promise((r) => setTimeout(() => r(SAMPLE_JSON), 900));
}

/* ----- Utilities ----- */
function typewriterAppend(setMessages, id, full, delayMs = 8) {
    return new Promise((resolve) => {
        let i = 0;
        const tick = () => {
            setMessages((m) =>
                m.map((msg) =>
                    msg.id === id ? { ...msg, content: full.slice(0, i) } : msg
                )
            );
            if (i >= full.length) return resolve();
            i += Math.max(1, Math.round(full.length / 1000));
            setTimeout(tick, delayMs);
        };
        tick();
    });
}

function nanoid() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/* ----- Minimal Ahaan logo ----- */
function AhaanLogo() {
    return (
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
            <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 1v3" />
                <path d="M12 20v3" />
                <path d="M1 12h3" />
                <path d="M20 12h3" />
                <path d="M4.2 4.2l2.1 2.1" />
                <path d="M17.7 17.7l2.1 2.1" />
                <path d="M19.8 4.2l-2.1 2.1" />
                <path d="M6.3 17.7l-2.1 2.1" />
            </g>
        </svg>
    );
}
