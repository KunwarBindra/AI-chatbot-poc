import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import "./ahaan.css";

/**
 * Ahaan Chat UI (JavaScript + Axios) + Attachments via S3 Presigned URLs
 * Flow:
 *  1) POST /uploads/presign { files:[{name,type,size}] } -> [{ s3Key, url }]
 *  2) PUT file -> presigned S3 url (capture ETag)
 *  3) POST /uploads/complete { parts:[{ s3Key, etag }] } -> optional public URLs
 *  4) POST /chat { prompt, attachments: [s3Key, ...] }
 */

export default function AhaanChat() {
    const [messages, setMessages] = useState([
        { id: nanoid(), role: "assistant", content: "", done: true },
    ]);
    const [input, setInput] = useState("");
    const [attachments, setAttachments] = useState([]); // [{ tempId, name, size, mime, previewUrl?, s3Key?, url?, progress?, uploading? }]
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

    // Disable send while any file is still uploading or missing s3Key
    const pendingUploads = attachments.some((a) => a.uploading || !a.s3Key);

    async function onSend() {
        const text = input.trim();
        if (!text || isSending || pendingUploads) return;

        // Snapshot attachments for this message (for display)
        const sentFiles = attachments.map((f) => ({
            s3Key: f.s3Key,
            name: f.name,
            size: f.size,
            mime: f.mime,
            url: f.url || f.previewUrl, // prefer public URL; fallback to local preview
        }));
        const s3Keys = attachments.filter((f) => f.s3Key).map((f) => f.s3Key);

        const userMsg = {
            id: nanoid(),
            role: "user",
            content: text,
            done: true,
            attachments: sentFiles,
        };
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
        setAttachments([]); // clear composer
        setIsSending(true);

        const ctrl = new AbortController();
        setController(ctrl);

        try {
            const fullText = await callChatApi({
                prompt: text,
                attachments: s3Keys, // <— backend wants array of s3Keys
                signal: ctrl.signal,
            });

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

            {/* Bottom dock */}
            <div className="bottombar">
                <div className="stage">
                    <Composer
                        value={input}
                        onChange={setInput}
                        onSend={onSend}
                        disabled={isSending || pendingUploads}
                        onKeyDown={onKeyDown}
                        onCancel={onCancel}
                        isSending={isSending}
                        attachments={attachments}
                        setAttachments={setAttachments}
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

/* ----- Message bubble (renders attachments) ----- */
function Message({ msg }) {
    const isUser = msg.role === "user";
    const files = msg.attachments || [];

    return (
        <div className={`row ${isUser ? "right" : "left"}`}>
            {!isUser && (
                <div className={`avatar ${msg.thinking ? "spin" : ""}`} aria-label="Ahaan">
                    <AhaanLogo />
                </div>
            )}

            <div
                className={`bubble ${isUser ? "user" : "assistant"} ${msg.error ? "error" : ""
                    }`}
            >
                {msg.thinking ? <TypingDots /> : <RichText text={msg.content} />}
                {files.length > 0 && <AttachmentList files={files} />}
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

/* ----- Attachments renderer (inside message bubble) ----- */
function AttachmentList({ files }) {
    return (
        <div className="attachments">
            {files.map((f) => (
                <AttachmentItem key={f.s3Key || f.name} file={f} />
            ))}
        </div>
    );
}

function AttachmentItem({ file }) {
    const isImg = isImage(file.mime || file.name);
    const isPdf = /pdf$/i.test(file.mime) || /\.pdf$/i.test(file.name);
    const href = file.url || file.previewUrl || undefined;

    if (isImg && href) {
        return (
            <a className="att att-img" href={href} target="_blank" rel="noreferrer">
                <img src={href} alt={file.name} />
                <span className="att-name">{file.name}</span>
            </a>
        );
    }

    const Inner = (
        <>
            <span className="att-icon">{isPdf ? "📄" : "📎"}</span>
            <span className="att-name">{file.name}</span>
        </>
    );

    return href ? (
        <a className="att att-file" href={href} target="_blank" rel="noreferrer">
            {Inner}
        </a>
    ) : (
        <span className="att att-file">{Inner}</span>
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

/* ----- Composer with S3-presigned uploads ----- */
function Composer({
    value,
    onChange,
    onSend,
    disabled,
    onKeyDown,
    onCancel,
    isSending,
    attachments,
    setAttachments,
}) {
    async function onPick(e) {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;

        // create temp items with previews
        const temps = files.map((f) => ({
            tempId: nanoid(),
            name: f.name,
            size: f.size,
            mime: f.type,
            previewUrl: URL.createObjectURL(f),
            progress: 0,
            uploading: true,
        }));
        setAttachments((a) => [...a, ...temps]);

        // try {
        //     // 1) ask backend for presigned URLs (batch)
        //     const presigned = await presignFiles(files); // [{ s3Key, url }]
        //     if (!Array.isArray(presigned) || presigned.length !== files.length) {
        //         throw new Error("Presign response mismatch");
        //     }

        //     // 2) upload all to S3 (PUT)
        //     const parts = [];
        //     await Promise.all(
        //         files.map(async (file, idx) => {
        //             const tempId = temps[idx].tempId;
        //             const { s3Key, url } = presigned[idx];

        //             const etag = await putToS3(url, file, (p) =>
        //                 setAttachments((a) =>
        //                     a.map((x) =>
        //                         x.tempId === tempId ? { ...x, progress: p } : x
        //                     )
        //                 )
        //             );

        //             parts.push({ s3Key, etag });

        //             // mark as uploaded in UI
        //             setAttachments((a) =>
        //                 a.map((x) =>
        //                     x.tempId === tempId
        //                         ? {
        //                             ...x,
        //                             s3Key,
        //                             uploading: false,
        //                             progress: 100,
        //                             // if your complete API returns a public url later we’ll overwrite it
        //                             url: x.url, // keep undefined for now
        //                         }
        //                         : x
        //                 )
        //             );
        //         })
        //     );

        //     // 3) notify backend to complete uploads (single call)
        //     const completed = await completeUploads(parts);
        //     // Optionally returns [{ s3Key, url }] — set public URLs if provided
        //     if (Array.isArray(completed)) {
        //         setAttachments((a) =>
        //             a.map((x) => {
        //                 const found = completed.find((c) => c.s3Key === x.s3Key);
        //                 return found ? { ...x, url: found.url || x.url } : x;
        //             })
        //         );
        //     }
        // } catch (err) {
        //     // remove any failed temp entries
        //     const failedIds = temps.map((t) => t.tempId);
        //     setAttachments((a) => a.filter((x) => !failedIds.includes(x.tempId)));
        //     console.error("Upload failed:", err);
        //     // (optional) toast error here
        // } finally {
        //     // allow selecting same files again
        //     e.target.value = "";
        // }
    }

    function removeAttachment(idOrTempId) {
        setAttachments((a) =>
            a.filter((x) => (x.s3Key || x.tempId) !== idOrTempId)
        );
    }

    return (
        <>
            {!!attachments.length && (
                <div className="chips-inline">
                    {attachments.map((f) => {
                        const key = f.s3Key || f.tempId;
                        const uploading = f.uploading;
                        return (
                            <span className="chip file" key={key} title={f.name}>
                                <span className="file-name">{f.name}</span>
                                {uploading ? (
                                    <span className="file-progress">
                                        {Math.round(f.progress || 0)}%
                                    </span>
                                ) : (
                                    <button
                                        type="button"
                                        className="file-remove"
                                        onClick={() => removeAttachment(key)}
                                        aria-label="Remove attachment"
                                        title="Remove"
                                    >
                                        ×
                                    </button>
                                )}
                            </span>
                        );
                    })}
                </div>
            )}
            
            <div className="composer">

                <input
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={onKeyDown}
                    placeholder="Ask Ahaan anything…"
                    aria-label="Message Ahaan"
                />

                <label className="clip" title="Attach files">
                    📎
                    <input type="file" multiple hidden onChange={onPick} />
                </label>

                {isSending ? (
                    <button className="secondary" onClick={onCancel}>
                        Stop
                    </button>
                ) : (
                    <button
                        className="primary"
                        onClick={onSend}
                        disabled={!value.trim() || disabled}
                        aria-label="Send"
                        title="Send"
                        style={{ opacity: disabled ? 0.6 : 1 }}
                    >
                        ▶
                    </button>
                )}
            </div>
        </>
    );
}

/* ----- Axios client & API calls ----- */
const api = axios.create({ baseURL: "/api" });

async function callChatApi({ prompt, attachments = [], signal }) {
    // attachments = array of s3Keys
    try {
        // const { data } = await api.post("/chat", { prompt, attachments }, { signal });
        // return data?.text || data?.choices?.[0]?.message?.content || "";
    } catch (e) {
        // mock fallback
    }
    const data = await mockChat({ prompt });
    return data.choices[0].message.content;
}

/** Request presigned URLs for a batch of files */
async function presignFiles(files) {
    const payload = {
        files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
    };
    const { data } = await api.post("/uploads/presign", payload);
    // Expect: data = [{ s3Key, url }, ...] aligned to input order
    return data;
}

/** PUT a single file to its presigned S3 URL; return ETag string (without quotes) */
async function putToS3(url, file, onProgress) {
    const res = await axios.put(url, file, {
        headers: { "Content-Type": file.type || "application/octet-stream" },
        onUploadProgress: (evt) => {
            if (onProgress && evt.total) onProgress((evt.loaded / evt.total) * 100);
        },
    });
    const etag = (res.headers?.etag || res.headers?.ETag || "").replace(/\"/g, "");
    return etag;
}

/** Notify backend to finalize uploaded files; returns optional [{ s3Key, url }] */
async function completeUploads(parts) {
    // parts: [{ s3Key, etag }]
    const { data } = await api.post("/uploads/complete", { parts });
    return data;
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

function isImage(mimeOrName) {
    if (!mimeOrName) return false;
    const m = String(mimeOrName).toLowerCase();
    return m.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(m);
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
