import React from 'react'
import TypingDots from './TypingDots';
import RichText from './RichText';
import AttachmentList from './AttachmentList';
import AhaanLogo from '../assets/AhaanLogo';

function Message({ msg, isImage }) {
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
                {files.length > 0 && <AttachmentList files={files} isImage={isImage} />}
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

export default Message