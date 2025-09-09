import React from 'react'

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
    presignFiles,
    putToS3,
    completeUploads,
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

export default Composer