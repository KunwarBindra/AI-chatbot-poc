import React from 'react'
import AttachmentItem from './AttachmentItem';

function AttachmentList({ files, isImage }) {
    return (
        <div className="attachments">
            {files.map((f) => (
                <AttachmentItem key={f.s3Key || f.name} file={f} isImage={isImage} />
            ))}
        </div>
    );
}

export default AttachmentList