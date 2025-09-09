import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import "../styles/ahaan.css";
import AhaanLogo from "../assets/AhaanLogo";
import Composer from "./Composer";
import Hero from "./Hero";
import Message from "./Message";

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

