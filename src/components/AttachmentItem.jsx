import React from 'react'

function AttachmentItem({ file, isImage }) {
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

export default AttachmentItem