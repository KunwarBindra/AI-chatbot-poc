# AI Chatbot PoC — Ahaan Chat (React + Vite + Axios)

A proof-of-concept LLM chat UI for GPT/Gemini/Claude backends.

The UI includes:
- hero screen before the first message
- assistant/user bubbles
- a "thinking" avatar animation (breathing/scale)
- typewriter reveal for assistant replies
- file attachments uploaded directly to Amazon S3 using presigned URLs
- attachments rendered both in the composer (chips with progress) and inside the chat (thumbnails/file chips)

The front end is backend-agnostic and uses plain React, CSS, and Axios.

---

## Features

- Clean chat layout (assistant on the left, user on the right)
- Thinking state animation while awaiting a response
- Typewriter effect for assistant messages (can be swapped for streaming later)
- Multiple file attachments with S3 presigned upload flow
- Attachment previews in chat (image thumbnails, PDF/other chips)
- Auto-scroll to the latest message, Enter-to-send, cancel/stop
- Hidden chat scrollbar for a clean look

---

## Project structure

```
public/
src/
  assets/
    AhaanLogo.jsx
    react.svg
  components/
    AhaanChat.jsx        # orchestrates state, messages, API calls
    AttachmentItem.jsx   # renders a single attachment (image thumbnail or file chip)
    AttachmentList.jsx   # renders attachments inside a message bubble
    Composer.jsx         # input + file picker + progress chips + send/stop
    Hero.jsx             # landing screen shown before the first user message
    Message.jsx          # assistant/user bubbles, avatar animation
    RichText.jsx         # paragraph rendering (swap for react-markdown if desired)
    TypingDots.jsx       # typing indicator
  styles/
    ahaan.css            # all styles (layout, bubbles, attachments, composer)
  App.jsx                # mounts <AhaanChat />
  index.css              # global styles
  main.jsx               # Vite bootstrap
index.html
package.json
vite.config.js
eslint.config.js
```

---

## Getting started

```bash
npm install
npm run dev        # start Vite dev server
npm run build      # build for production
npm run preview    # serve the production build locally
```

Open the URL printed by Vite (for example http://localhost:5173).

---

## Configuration

`src/components/AhaanChat.jsx` creates an Axios client. Keep `/api` or use an environment variable:

```js
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
});
```

Optional `.env` for local development:
```
VITE_API_BASE_URL=http://localhost:3000/api
```

---

## Backend contract

This UI expects S3 presigned uploads and a chat endpoint. Adjust paths to match your backend.

### 1) Presign uploads (batch)

**POST** `/uploads/presign`

Request:
```json
{
  "files": [
    { "name": "photo.jpg", "type": "image/jpeg", "size": 123456 },
    { "name": "report.pdf", "type": "application/pdf", "size": 234567 }
  ]
}
```

Response:
```json
[
  { "s3Key": "uploads/abc123.jpg", "url": "https://s3-example/presigned-put-1" },
  { "s3Key": "uploads/def456.pdf", "url": "https://s3-example/presigned-put-2" }
]
```

If your S3 setup requires additional headers (for example `x-amz-*`, `Content-MD5`, ACL), include them per file in the response and forward them in the client `PUT` call.

### 2) Upload each file to S3 (client → S3)

**PUT** `<presigned.url>`  
Headers: `Content-Type: <file.type>`  
Client captures the response header `ETag`.

### 3) Complete uploads

**POST** `/uploads/complete`

Request:
```json
{
  "parts": [
    { "s3Key": "uploads/abc123.jpg", "etag": "etag-1" },
    { "s3Key": "uploads/def456.pdf", "etag": "etag-2" }
  ]
}
```

Response (optional public URLs for previews):
```json
[
  { "s3Key": "uploads/abc123.jpg", "url": "https://cdn.example.com/abc123.jpg" },
  { "s3Key": "uploads/def456.pdf", "url": "https://cdn.example.com/def456.pdf" }
]
```

### 4) Chat with attachments

**POST** `/chat`

Request:
```json
{
  "prompt": "Summarize the attached PDF",
  "attachments": ["uploads/abc123.jpg", "uploads/def456.pdf"]
}
```

Response:
```json
{ "text": "Here is a short summary..." }
```

---

## How the UI works

1. Composer (`Composer.jsx`)
   - Text input with Enter-to-send.
   - File picker with multiple selection adds items to an attachments tray.
   - Calls `/uploads/presign` for all files, then `PUT`s each file to S3 and collects `ETag` values.
   - Calls `/uploads/complete` with `{ parts: [{ s3Key, etag }, ...] }`.
   - Send is disabled until all uploads complete.

2. Messages (`AhaanChat.jsx` + `Message.jsx`)
   - Adds a user message (with attachments) and a placeholder assistant message.
   - Assistant shows thinking animation while awaiting a response.
   - Calls `/chat`; on success, typewriter reveals the assistant text.

3. Attachments (`AttachmentList.jsx` / `AttachmentItem.jsx`)
   - Images render as thumbnails with a link.
   - PDFs and other types render as compact chips with an icon and name.

---

## Styling notes

- Three-row page grid: header, scrollable main, bottom dock.
- Only `.chat` scrolls; scrollbar is hidden while keeping scroll functionality:
  ```css
  .chat { -ms-overflow-style: none; scrollbar-width: none; }
  .chat::-webkit-scrollbar { display: none; }
  ```
- The "thinking" state scales the SVG in and out using a `pulse` class.
- On iOS you may prefer `height: 100svh` for the page grid to handle address bar resizing.

---

## Customization

- Branding: change the logo in `src/assets/AhaanLogo.jsx` and colors in `src/styles/ahaan.css`.
- Markdown: replace `RichText.jsx` with `react-markdown` and `remark-gfm` if you need Markdown rendering.
- Streaming: replace the typewriter effect with SSE or WebSocket streaming and append chunks to the last assistant message.
- Drag and drop: integrate `react-dropzone` or Uppy; the attachments tray already supports multiple files.

---

## Security checklist

- Configure S3 CORS to allow `PUT` from your web origin.
- Validate file type and size on both client and server.
- For private buckets, provide signed GET URLs for previews and historical messages.
- Consider antivirus scanning, rate limiting, and authentication on `/uploads/*` and `/chat`.

---

## Troubleshooting

- Send button disabled: uploads are still in progress (see progress on chips).
- CORS or 403 on S3 PUT: check S3 CORS and presign headers match the client request.
- No image thumbnail after upload: ensure `/uploads/complete` returns a public URL; otherwise the UI only has a local ObjectURL preview for the current session.
- No assistant text: ensure `/chat` returns `{ "text": "..." }` or adapt the client mapping.