import React from 'react'

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

export default RichText