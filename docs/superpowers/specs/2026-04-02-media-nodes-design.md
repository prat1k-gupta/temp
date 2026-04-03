# Media Nodes — Design Spec

**Date:** 2026-04-02
**Scope:** WhatsApp only (v1). Instagram/Web can follow the same pattern later.
**Approach:** Media as a field on existing nodes (not separate media nodes).

## Problem

Marketers think in intent — "send an image with a question" — not WhatsApp primitives. Competitors (ManyChat, Landbot) use separate media blocks/nodes, forcing users to think about message structure. WhatsApp natively supports media headers on reply buttons as a single message, but no builder takes advantage of this.

## Design Decisions

- **No new node types.** Media is an optional attachment on three existing WhatsApp nodes: Message, Quick Reply, Question.
- **URL-only for v1.** User pastes a public URL. Meta's Cloud API accepts `"link": url` directly. S3 upload replaces this later — same runtime code (`"link": s3_url`).
- **No Meta upload path.** Media IDs expire after 30 days. URL path has no expiry as long as URL stays live.
- **Media fields on existing step types.** No new `message_type` constants. Existing `text` and `buttons` types gain optional `media_type` + `media_url` fields. This matches WhatsApp's API — buttons with image header is one API call, not two.

## Data Model

### Node Data (TypeScript)

Add to `WhatsAppMessageNodeData`, `WhatsAppQuickReplyNodeData`, `WhatsAppQuestionNodeData`:

```typescript
media?: {
  type: 'image' | 'video' | 'audio' | 'document'
  url: string
}
```

### Flow Step (Converter output / Go model)

Add to `FsWhatsAppFlowStep` and `ChatbotFlowStep`:

```
media_type?: "image" | "video" | "audio" | "document"
media_url?: string
```

## Runtime Behavior (fs-whatsapp)

### Send function changes (`client.go`)

Modify `SendImageMessage`, `SendVideoMessage`, `SendAudioMessage`, `SendDocumentMessage` — accept URL alongside mediaID. When mediaID is empty but URL is provided, use `"link": url` instead of `"id": mediaID`. ~5 lines per function.

### Chatbot processor (`chatbot_processor.go`)

Existing step handlers check for `media_url` and branch:

| `message_type` | `input_type` | Media behavior |
|---|---|---|
| `text` | `none` (message node) | Send as media message with caption (message text = caption). Skip text send. |
| `text` | other (question node) | Send media message first (no caption), then send text question as separate message. Wait for input as usual. |
| `buttons` | `button` (quick reply) | Build interactive message with media header. Single API call. |
| `buttons` | `select` (list) | Ignore media. WhatsApp doesn't support media headers on lists. |

### Interactive buttons media header (`message.go`)

Modify `SendInteractiveButtons` to accept optional media header:

```go
// When media provided:
"header": { "type": "image", "image": { "link": url } }
// When no media: no header (current behavior)
```

### No new constants

No new `FlowStepType` constants in `constants.go`. Media is a property on existing step types.

## Builder UI (magic-flow)

### Add Media trigger

- Only visible when node is selected AND no media attached
- Styled trigger at bottom of node content (icon + "Add media" label) — not a generic button
- Opens the media modal

### Media modal

- Media type selection: Image / Video / Audio / Document
- Audio option disabled on Quick Reply nodes (WhatsApp doesn't support audio headers on buttons)
- URL text input with placeholder ("Paste a public URL")
- URL validation: extension must match selected type
- Guidance text for size limits ("Image must be under 5MB", "Video must be under 16MB", etc.)
- Save / Cancel buttons

### Thumbnail on node

- Always visible when media is attached (even when node not selected)
- Image/video: load thumbnail from URL
- Audio/document: icon + filename derived from URL
- When node is selected: thumbnail gains replace (re-open modal) and remove (X button) controls

### List conversion alert

When user adds a 4th button on a quick reply that has media attached:

- **Title:** "Media won't be shown in lists"
- **Body:** "WhatsApp lists don't support media headers. Your media will be kept but won't appear in the message."
- **"Convert anyway"** — proceeds with conversion, keeps media in node data
- **"Cancel"** — doesn't add the 4th button, stays as quick reply with media

Media stays in node data after conversion. If user removes buttons back to <=3, media reappears in the message.

## Converter (`whatsapp-converter.ts`)

### Forward conversion

When a node has `media` in its data, add to the flow step:
- `media_type`: the type string
- `media_url`: the public URL

No changes to `message_type`. Quick reply and list both remain `"buttons"`.

### Reverse conversion

When a flow step has `media_type` + `media_url`, reconstruct the `media` object on the node data. `inferNodeType()` does not change — media doesn't affect node type inference.

### List with media

If a `buttons` step with `input_type: "select"` has media fields, converter preserves them. Runtime ignores them. Data stays intact for round-trip editing.

## Validation & Constraints

### Modal validation (at media add time)

- URL must be non-empty
- File extension must match selected media type:
  - Image: `.jpg`, `.jpeg`, `.png`
  - Video: `.mp4`
  - Audio: `.mp3`, `.ogg`, `.amr`, `.aac`
  - Document: `.pdf`, `.doc`, `.docx`, `.xls`, `.xlsx`, `.ppt`, `.pptx`, `.txt`
- Quick Reply node: audio type disabled

### Publish validation (`publish-modal.tsx`)

- Node has media but URL is empty: block publish, show error
- List node has media: warning (not blocking — media is just ignored at runtime)

### Size limits (guidance only, not enforced)

- Image: 5 MB (JPEG, PNG)
- Video: 16 MB (MP4, H.264 + AAC)
- Audio: 16 MB (AAC, MP4 audio, MPEG, AMR, OGG with Opus codec)
- Document: 100 MB (PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT)
- Caption: 1024 chars max (enforced by existing character limits on nodes)

Cannot validate file size from a URL without fetching it. If Meta rejects at runtime, chatbot processor logs the error.

### WhatsApp restrictions for interactive message headers

- Reply buttons (<=3): image, video, document headers supported. No audio.
- List messages (>3): text header only. No media.

## Competitive Advantage

| Capability | ManyChat | Landbot | Freestand |
|---|---|---|---|
| Media + buttons in one message | No (separate blocks) | No (separate nodes) | Yes — image header on quick reply |
| Separate media node needed | No (block inside node) | Yes | No — embedded in existing nodes |
| User must know quick reply vs list | Yes | Yes | No — auto-converts |
| Warns about media loss on conversion | N/A | N/A | Yes — alert modal |
| Media input options | Upload | Upload + URL + GIPHY | URL (v1), S3 upload later |

## Future (out of scope for v1)

- S3 upload: drag-drop file upload in modal, stored in S3, `"link": s3_url` — same runtime code
- Instagram/Web nodes: same `media` field pattern, platform-specific constraints
- Media library: reuse uploaded media across flows
- GIPHY / YouTube embed support
