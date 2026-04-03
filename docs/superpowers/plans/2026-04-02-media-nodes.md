# Media Nodes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **IMPORTANT:** Do NOT commit any changes until the user has reviewed all work. No intermediate commits.

**Goal:** Add media attachment capability (image/video/audio/document via public URL) to WhatsApp Message, Quick Reply, and Question nodes.

**Architecture:** Media is an optional field on existing node types — no new nodes or step types. Runtime Send functions gain URL support (`"link"` instead of `"id"`). Converter passes `media_type`/`media_url` as step fields. Processor branches on existing `input_type` to decide how to send media (standalone, caption, or header).

**Tech Stack:** Go (fs-whatsapp runtime), React/TypeScript (magic-flow builder), shadcn UI components, WhatsApp Cloud API

**Spec:** `magic-flow/docs/superpowers/specs/2026-04-02-media-nodes-design.md`

---

### Task 1: Go — URL support in Send functions

**Files:**
- Modify: `fs-whatsapp/pkg/whatsapp/client.go:252-389` (4 Send functions)
- Modify: `fs-whatsapp/test/testutil/mocks.go:23-204` (mock signatures + recording)
- Modify: `fs-whatsapp/internal/handlers/messages.go:155-163` (callers pass empty URL)
- Test: `fs-whatsapp/pkg/whatsapp/client_test.go`

Each of the 4 Send functions (`SendImageMessage`, `SendVideoMessage`, `SendAudioMessage`, `SendDocumentMessage`) needs a new `mediaURL string` parameter. When `mediaURL != ""`, the payload uses `"link": mediaURL` instead of `"id": mediaID`.

- [ ] **Step 1: Write test for SendImageMessage with URL**

Add to `fs-whatsapp/pkg/whatsapp/client_test.go`:

```go
func TestClient_SendImageMessageWithURL(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]interface{}
		_ = json.NewDecoder(r.Body).Decode(&body)

		assert.Equal(t, "image", body["type"])
		image := body["image"].(map[string]interface{})
		assert.Nil(t, image["id"])
		assert.Equal(t, "https://example.com/photo.jpg", image["link"])
		assert.Equal(t, "Test caption", image["caption"])

		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"messages": []map[string]string{{"id": "wamid.img456"}},
		})
	}))
	defer server.Close()

	log := testutil.NopLogger()
	client := whatsapp.NewWithTimeout(log, 5*time.Second)
	client.HTTPClient = &http.Client{
		Transport: &testServerTransport{serverURL: server.URL},
	}

	account := testAccount(server.URL)
	ctx := testutil.TestContext(t)

	msgID, err := client.SendImageMessage(ctx, account, "1234567890", "", "https://example.com/photo.jpg", "Test caption")

	require.NoError(t, err)
	assert.Equal(t, "wamid.img456", msgID)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd fs-whatsapp && go test ./pkg/whatsapp/ -run TestClient_SendImageMessageWithURL -v`
Expected: compilation error — `SendImageMessage` doesn't accept 6 args yet.

- [ ] **Step 3: Modify SendImageMessage to accept mediaURL**

In `fs-whatsapp/pkg/whatsapp/client.go`, change `SendImageMessage`:

```go
func (c *Client) SendImageMessage(ctx context.Context, account *Account, phoneNumber, mediaID, mediaURL, caption string) (string, error) {
	imagePayload := map[string]interface{}{
		"caption": caption,
	}
	if mediaURL != "" {
		imagePayload["link"] = mediaURL
	} else {
		imagePayload["id"] = mediaID
	}
	payload := map[string]interface{}{
		"messaging_product": "whatsapp",
		"recipient_type":    "individual",
		"to":                phoneNumber,
		"type":              "image",
		"image":             imagePayload,
	}
	// ... rest unchanged
```

- [ ] **Step 4: Apply same pattern to SendVideoMessage**

```go
func (c *Client) SendVideoMessage(ctx context.Context, account *Account, phoneNumber, mediaID, mediaURL, caption string) (string, error) {
	videoPayload := map[string]interface{}{
		"caption": caption,
	}
	if mediaURL != "" {
		videoPayload["link"] = mediaURL
	} else {
		videoPayload["id"] = mediaID
	}
	payload := map[string]interface{}{
		"messaging_product": "whatsapp",
		"recipient_type":    "individual",
		"to":                phoneNumber,
		"type":              "video",
		"video":             videoPayload,
	}
```

- [ ] **Step 5: Apply same pattern to SendAudioMessage**

```go
func (c *Client) SendAudioMessage(ctx context.Context, account *Account, phoneNumber, mediaID, mediaURL string) (string, error) {
	audioPayload := map[string]interface{}{}
	if mediaURL != "" {
		audioPayload["link"] = mediaURL
	} else {
		audioPayload["id"] = mediaID
	}
	payload := map[string]interface{}{
		"messaging_product": "whatsapp",
		"recipient_type":    "individual",
		"to":                phoneNumber,
		"type":              "audio",
		"audio":             audioPayload,
	}
```

- [ ] **Step 6: Apply same pattern to SendDocumentMessage**

```go
func (c *Client) SendDocumentMessage(ctx context.Context, account *Account, phoneNumber, mediaID, mediaURL, filename, caption string) (string, error) {
	docPayload := map[string]interface{}{
		"filename": filename,
		"caption":  caption,
	}
	if mediaURL != "" {
		docPayload["link"] = mediaURL
	} else {
		docPayload["id"] = mediaID
	}
	payload := map[string]interface{}{
		"messaging_product": "whatsapp",
		"recipient_type":    "individual",
		"to":                phoneNumber,
		"type":              "document",
		"document":          docPayload,
	}
```

- [ ] **Step 7: Update existing callers in messages.go**

In `fs-whatsapp/internal/handlers/messages.go:155-163`, add empty `""` for the new `mediaURL` parameter:

```go
case models.MessageTypeImage:
	return a.WhatsApp.SendImageMessage(sendCtx, waAccount, req.Contact.PhoneNumber, mediaID, "", req.Caption)
case models.MessageTypeVideo:
	return a.WhatsApp.SendVideoMessage(sendCtx, waAccount, req.Contact.PhoneNumber, mediaID, "", req.Caption)
case models.MessageTypeAudio:
	return a.WhatsApp.SendAudioMessage(sendCtx, waAccount, req.Contact.PhoneNumber, mediaID, "")
default: // document
	return a.WhatsApp.SendDocumentMessage(sendCtx, waAccount, req.Contact.PhoneNumber, mediaID, "", req.MediaFilename, req.Caption)
```

- [ ] **Step 8: Update mock signatures**

In `fs-whatsapp/test/testutil/mocks.go`, update the mock struct func fields and method implementations to match new signatures. Add `mediaURL` parameter to:
- `SendImageMessageFunc` field (line 34)
- `SendDocumentMessageFunc` field (line 35)
- `SendImageMessage` method (line 159)
- `SendDocumentMessage` method (line 183)
- Add `SendVideoMessageFunc` and `SendAudioMessageFunc` fields if not present
- Add `SendVideoMessage` and `SendAudioMessage` mock methods if not present

Record `media_url` in `MockSentMessage.Content` when provided.

- [ ] **Step 9: Update existing test for SendImageMessage with mediaID**

The existing `TestClient_SendImageMessage` (line 398) needs the new `mediaURL` param added as empty string:

```go
msgID, err := client.SendImageMessage(ctx, account, "1234567890", "media123", "", "Test caption")
```

Same for `TestClient_SendDocumentMessage` (line 432):

```go
msgID, err := client.SendDocumentMessage(ctx, account, "1234567890", "media456", "", "report.pdf", "Monthly report")
```

- [ ] **Step 10: Run all tests**

Run: `cd fs-whatsapp && go test ./pkg/whatsapp/ -v && go test ./internal/handlers/ -v`
Expected: ALL PASS (existing tests updated, new URL test passes)

---

### Task 2: Go — Media header in SendInteractiveButtons

**Files:**
- Modify: `fs-whatsapp/pkg/whatsapp/message.go:46-144`
- Test: `fs-whatsapp/pkg/whatsapp/message_test.go` (create if doesn't exist, or add to client_test.go)

`SendInteractiveButtons` needs an optional `MediaHeader` parameter. When provided and button count <= 3, add a `"header"` to the interactive payload. Ignore for lists (>3 buttons).

- [ ] **Step 1: Define MediaHeader struct**

Add to `fs-whatsapp/pkg/whatsapp/message.go` (or `types.go` near the Button struct):

```go
// MediaHeader represents an optional media header for interactive messages.
// Only supported on reply buttons (<=3), not lists.
type MediaHeader struct {
	Type string // "image", "video", "document"
	URL  string // public URL
}
```

- [ ] **Step 2: Write test for interactive buttons with media header**

```go
func TestClient_SendInteractiveButtonsWithMediaHeader(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]interface{}
		_ = json.NewDecoder(r.Body).Decode(&body)

		interactive := body["interactive"].(map[string]interface{})
		assert.Equal(t, "button", interactive["type"])

		// Verify media header present
		header := interactive["header"].(map[string]interface{})
		assert.Equal(t, "image", header["type"])
		image := header["image"].(map[string]interface{})
		assert.Equal(t, "https://example.com/photo.jpg", image["link"])

		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"messages": []map[string]string{{"id": "wamid.btn123"}},
		})
	}))
	defer server.Close()

	log := testutil.NopLogger()
	client := whatsapp.NewWithTimeout(log, 5*time.Second)
	client.HTTPClient = &http.Client{
		Transport: &testServerTransport{serverURL: server.URL},
	}

	account := testAccount(server.URL)
	ctx := testutil.TestContext(t)

	buttons := []whatsapp.Button{
		{ID: "btn1", Title: "Yes"},
		{ID: "btn2", Title: "No"},
	}
	header := &whatsapp.MediaHeader{Type: "image", URL: "https://example.com/photo.jpg"}

	msgID, err := client.SendInteractiveButtons(ctx, account, "1234567890", "Pick one", buttons, header)
	require.NoError(t, err)
	assert.Equal(t, "wamid.btn123", msgID)
}
```

- [ ] **Step 3: Write test for list ignoring media header**

```go
func TestClient_SendInteractiveListIgnoresMediaHeader(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]interface{}
		_ = json.NewDecoder(r.Body).Decode(&body)

		interactive := body["interactive"].(map[string]interface{})
		assert.Equal(t, "list", interactive["type"])
		// No header on lists
		assert.Nil(t, interactive["header"])

		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(map[string]interface{}{
			"messages": []map[string]string{{"id": "wamid.list123"}},
		})
	}))
	defer server.Close()

	log := testutil.NopLogger()
	client := whatsapp.NewWithTimeout(log, 5*time.Second)
	client.HTTPClient = &http.Client{
		Transport: &testServerTransport{serverURL: server.URL},
	}

	account := testAccount(server.URL)
	ctx := testutil.TestContext(t)

	buttons := []whatsapp.Button{
		{ID: "opt1", Title: "Option 1"},
		{ID: "opt2", Title: "Option 2"},
		{ID: "opt3", Title: "Option 3"},
		{ID: "opt4", Title: "Option 4"},
	}
	header := &whatsapp.MediaHeader{Type: "image", URL: "https://example.com/photo.jpg"}

	msgID, err := client.SendInteractiveButtons(ctx, account, "1234567890", "Pick one", buttons, header)
	require.NoError(t, err)
	assert.Equal(t, "wamid.list123", msgID)
}
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd fs-whatsapp && go test ./pkg/whatsapp/ -run "TestClient_SendInteractiveButtons(With|List)" -v`
Expected: compilation error — `SendInteractiveButtons` doesn't accept `header` param yet.

- [ ] **Step 5: Implement media header support**

Modify `SendInteractiveButtons` in `fs-whatsapp/pkg/whatsapp/message.go`:

```go
func (c *Client) SendInteractiveButtons(ctx context.Context, account *Account, phoneNumber, bodyText string, buttons []Button, mediaHeader *MediaHeader) (string, error) {
```

After building the `interactive` map for the button case (line 75-83), add header if provided and buttons <= 3:

```go
	if len(buttons) <= 3 {
		// ... existing button building code ...

		interactive = map[string]interface{}{
			"type": "button",
			"body": map[string]interface{}{
				"text": bodyText,
			},
			"action": map[string]interface{}{
				"buttons": buttonsList,
			},
		}

		// Add media header for reply buttons only (not lists)
		if mediaHeader != nil && mediaHeader.URL != "" {
			interactive["header"] = map[string]interface{}{
				"type": mediaHeader.Type,
				mediaHeader.Type: map[string]interface{}{
					"link": mediaHeader.URL,
				},
			}
		}
	} else {
		// list code unchanged — no header added even if mediaHeader provided
```

- [ ] **Step 6: Update all callers of SendInteractiveButtons**

In `fs-whatsapp/internal/handlers/messages.go:171`:
```go
return a.WhatsApp.SendInteractiveButtons(sendCtx, waAccount, req.Contact.PhoneNumber, req.BodyText, req.Buttons, nil)
```

In `fs-whatsapp/test/testutil/mocks.go`, update:
- `SendInteractiveButtonsFunc` field signature to include `*whatsapp.MediaHeader`
- `SendInteractiveButtons` mock method signature

Update any existing tests that call `SendInteractiveButtons` to pass `nil` as the last arg.

- [ ] **Step 7: Run all tests**

Run: `cd fs-whatsapp && go test ./pkg/whatsapp/ -v && go test ./internal/handlers/ -v`
Expected: ALL PASS

---

### Task 3: Go — Chatbot processor media handling

**Files:**
- Modify: `fs-whatsapp/internal/handlers/chatbot_processor.go:647-689` (sendAndSave helpers), `2021-2081` (buttons case), `2545-2553` (default/text case)
- Test: `fs-whatsapp/internal/handlers/chatbot_processor_test.go` (create)

The chatbot processor needs to check `step.InputConfig["media_type"]` and `step.InputConfig["media_url"]` on text and buttons steps.

- [ ] **Step 1: Create sendAndSaveMediaMessage helper**

Add to `fs-whatsapp/internal/handlers/chatbot_processor.go` near the other `sendAndSave*` helpers (after line 689):

```go
// sendAndSaveMediaMessage sends a media message (image/video/audio/document) via URL and saves it.
func (a *App) sendAndSaveMediaMessage(account *models.WhatsAppAccount, contact *models.Contact, mediaType, mediaURL, caption string) error {
	ctx := context.Background()

	var msgType models.MessageType
	switch mediaType {
	case "image":
		msgType = models.MessageTypeImage
	case "video":
		msgType = models.MessageTypeVideo
	case "audio":
		msgType = models.MessageTypeAudio
	case "document":
		msgType = models.MessageTypeDocument
	default:
		return fmt.Errorf("unsupported media type: %s", mediaType)
	}

	_, err := a.SendOutgoingMessage(ctx, OutgoingMessageRequest{
		Account:  account,
		Contact:  contact,
		Type:     msgType,
		MediaURL: mediaURL,
		Caption:  caption,
	}, ChatbotSendOptions())
	return err
}
```

- [ ] **Step 2: Update SendOutgoingMessage to support media URL without upload**

In `fs-whatsapp/internal/handlers/messages.go:144-164`, the media case currently uploads if `MediaData` is provided. Add a path for when `MediaURL` is a remote URL (not local path) — pass it through to the Send functions:

```go
case models.MessageTypeImage, models.MessageTypeVideo, models.MessageTypeAudio, models.MessageTypeDocument:
	mediaID := req.MediaID
	remoteURL := ""

	if mediaID == "" && len(req.MediaData) > 0 {
		// Upload raw data to Meta
		var err error
		mediaID, err = a.WhatsApp.UploadMedia(sendCtx, waAccount, req.MediaData, req.MediaMimeType, req.MediaFilename)
		if err != nil {
			return "", fmt.Errorf("failed to upload media: %w", err)
		}
	} else if mediaID == "" && req.MediaURL != "" && (strings.HasPrefix(req.MediaURL, "http://") || strings.HasPrefix(req.MediaURL, "https://")) {
		// Use remote URL directly — Meta will fetch it
		remoteURL = req.MediaURL
	}

	switch req.Type {
	case models.MessageTypeImage:
		return a.WhatsApp.SendImageMessage(sendCtx, waAccount, req.Contact.PhoneNumber, mediaID, remoteURL, req.Caption)
	case models.MessageTypeVideo:
		return a.WhatsApp.SendVideoMessage(sendCtx, waAccount, req.Contact.PhoneNumber, mediaID, remoteURL, req.Caption)
	case models.MessageTypeAudio:
		return a.WhatsApp.SendAudioMessage(sendCtx, waAccount, req.Contact.PhoneNumber, mediaID, remoteURL)
	default: // document
		return a.WhatsApp.SendDocumentMessage(sendCtx, waAccount, req.Contact.PhoneNumber, mediaID, remoteURL, req.MediaFilename, req.Caption)
	}
```

Add `"strings"` to imports if not already present.

- [ ] **Step 3: Extract media info helper for processor**

Add helper to read media from InputConfig:

```go
// getStepMedia extracts media_type and media_url from a step's InputConfig.
// Returns empty strings if no media is configured.
func getStepMedia(step *models.ChatbotFlowStep) (mediaType, mediaURL string) {
	if step.InputConfig == nil {
		return "", ""
	}
	mediaType, _ = step.InputConfig["media_type"].(string)
	mediaURL, _ = step.InputConfig["media_url"].(string)
	if mediaType == "" || mediaURL == "" {
		return "", ""
	}
	return mediaType, mediaURL
}
```

- [ ] **Step 4: Modify the default (text) case to handle media**

Replace the default case in `sendStepMessage` (lines 2545-2553) with an explicit `FlowStepTypeText` case and a media-aware default:

```go
	case models.FlowStepTypeText:
		message = processTemplate(step.Message, session.SessionData)
		mediaType, mediaURL := getStepMedia(step)

		if mediaType != "" && mediaURL != "" {
			if step.InputType == models.InputTypeNone {
				// Message node: send as media message with caption
				if err := a.sendAndSaveMediaMessage(account, contact, mediaType, mediaURL, message); err != nil {
					a.Log.Error("Failed to send media message", "error", err, "contact", contact.PhoneNumber)
					return err
				}
			} else {
				// Question node: send media first (no caption), then question text
				if err := a.sendAndSaveMediaMessage(account, contact, mediaType, mediaURL, ""); err != nil {
					a.Log.Error("Failed to send media before question", "error", err, "contact", contact.PhoneNumber)
					return err
				}
				if err := a.sendAndSaveTextMessage(account, contact, message); err != nil {
					a.Log.Error("Failed to send question text", "error", err, "contact", contact.PhoneNumber)
					return err
				}
			}
		} else {
			// No media — plain text
			if err := a.sendAndSaveTextMessage(account, contact, message); err != nil {
				a.Log.Error("Failed to send step message", "error", err, "contact", contact.PhoneNumber)
				return err
			}
		}
		a.logSessionMessage(session.ID, models.DirectionOutgoing, message, step.StepName)

	default:
		a.Log.Debug("Unhandled message type, falling back to text", "message_type", step.MessageType, "step", step.StepName)
		message = processTemplate(step.Message, session.SessionData)
		if err := a.sendAndSaveTextMessage(account, contact, message); err != nil {
			a.Log.Error("Failed to send step message", "error", err, "contact", contact.PhoneNumber)
			return err
		}
		a.logSessionMessage(session.ID, models.DirectionOutgoing, message, step.StepName)
```

- [ ] **Step 5: Modify the buttons case to pass media header**

In the buttons handler (lines 2021-2081), after building `replyButtons`, read media and pass to `sendAndSaveInteractiveButtons`:

```go
	case models.FlowStepTypeButtons:
		message = processTemplate(step.Message, session.SessionData)
		mediaType, mediaURL := getStepMedia(step)

		if len(step.Buttons) > 0 {
			replyButtons := make([]map[string]interface{}, 0)
			urlButtons := make([]map[string]interface{}, 0)

			for _, btn := range step.Buttons {
				if btnMap, ok := btn.(map[string]interface{}); ok {
					btnType, _ := btnMap["type"].(string)
					if btnType == "url" {
						urlButtons = append(urlButtons, btnMap)
					} else {
						replyButtons = append(replyButtons, btnMap)
					}
				}
			}

			if len(replyButtons) > 0 {
				if err := a.sendAndSaveInteractiveButtons(account, contact, message, replyButtons, mediaType, mediaURL); err != nil {
					// ... existing error handling
```

- [ ] **Step 6: Update sendAndSaveInteractiveButtons to accept media**

Modify the helper at line 647:

```go
func (a *App) sendAndSaveInteractiveButtons(account *models.WhatsAppAccount, contact *models.Contact, bodyText string, buttons []map[string]interface{}, mediaType, mediaURL string) error {
	// ... existing button conversion code ...

	// Build media header if provided
	var mediaHeader *whatsapp.MediaHeader
	if mediaType != "" && mediaURL != "" {
		mediaHeader = &whatsapp.MediaHeader{
			Type: mediaType,
			URL:  mediaURL,
		}
	}

	ctx := context.Background()
	_, err := a.SendOutgoingMessage(ctx, OutgoingMessageRequest{
		Account:         account,
		Contact:         contact,
		Type:            models.MessageTypeInteractive,
		InteractiveType: interactiveType,
		BodyText:        bodyText,
		Buttons:         waButtons,
		MediaHeader:     mediaHeader,
	}, ChatbotSendOptions())
	return err
}
```

- [ ] **Step 7: Add MediaHeader to OutgoingMessageRequest**

In `fs-whatsapp/internal/handlers/messages.go`, add to `OutgoingMessageRequest` struct:

```go
	// Interactive messages
	InteractiveType string            // "button", "list", "cta_url"
	BodyText        string            // Body text for interactive messages
	Buttons         []whatsapp.Button // For button/list messages
	ButtonText      string            // For CTA URL button
	URL             string            // For CTA URL button
	MediaHeader     *whatsapp.MediaHeader // Optional media header for interactive buttons
```

And in the interactive send path (line 170-171):

```go
default: // "button" or "list"
	return a.WhatsApp.SendInteractiveButtons(sendCtx, waAccount, req.Contact.PhoneNumber, req.BodyText, req.Buttons, req.MediaHeader)
```

- [ ] **Step 8: Update all other callers of sendAndSaveInteractiveButtons**

Any other place that calls `sendAndSaveInteractiveButtons` needs the two extra `""` args for mediaType/mediaURL. Search for all call sites.

- [ ] **Step 9: Run all Go tests**

Run: `cd fs-whatsapp && go test ./... -v`
Expected: ALL PASS

---

### Task 4: TypeScript — Data model and media types

**Files:**
- Modify: `magic-flow/types/index.ts:45-68`

- [ ] **Step 1: Add MediaAttachment type**

Add to `magic-flow/types/index.ts` after the existing interfaces:

```typescript
export interface MediaAttachment {
  type: 'image' | 'video' | 'audio' | 'document'
  url: string
}

export type MediaType = MediaAttachment['type']
```

- [ ] **Step 2: Add media field to node data interfaces**

Add `media?: MediaAttachment` to each:

```typescript
export interface QuestionNodeData extends BaseNodeData {
  question?: string
  characterLimit?: number
  storeAs?: string
  validation?: ValidationConfig
  media?: MediaAttachment
}

export interface QuickReplyNodeData extends BaseNodeData {
  question?: string
  buttons?: ButtonData[]
  storeAs?: string
  validation?: ValidationConfig
  media?: MediaAttachment
}

export interface MessageNodeData extends BaseNodeData {
  text?: string
  media?: MediaAttachment
}
```

`ListNodeData` also gets `media?: MediaAttachment` (preserved after conversion, but ignored at runtime).

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd magic-flow && npx tsc --noEmit`
Expected: no errors (field is optional, existing code unaffected)

---

### Task 5: TypeScript — Media modal component

**Files:**
- Create: `magic-flow/components/nodes/shared/media-modal.tsx`

A shadcn Dialog for selecting media type and entering URL.

- [ ] **Step 1: Create the media modal component**

```tsx
// magic-flow/components/nodes/shared/media-modal.tsx
"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import type { MediaAttachment, MediaType } from "@/types"
import { ImageIcon, VideoIcon, FileAudioIcon, FileTextIcon } from "lucide-react"

const MEDIA_OPTIONS: Array<{ value: MediaType; label: string; icon: typeof ImageIcon; sizeHint: string }> = [
  { value: "image", label: "Image", icon: ImageIcon, sizeHint: "JPEG, PNG — max 5 MB" },
  { value: "video", label: "Video", icon: VideoIcon, sizeHint: "MP4 — max 16 MB" },
  { value: "audio", label: "Audio", icon: FileAudioIcon, sizeHint: "MP3, OGG, AAC, AMR — max 16 MB" },
  { value: "document", label: "Document", icon: FileTextIcon, sizeHint: "PDF, DOC, XLS, PPT, TXT — max 100 MB" },
]

const EXTENSION_MAP: Record<MediaType, string[]> = {
  image: [".jpg", ".jpeg", ".png"],
  video: [".mp4"],
  audio: [".mp3", ".ogg", ".amr", ".aac"],
  document: [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt"],
}

interface MediaModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialMedia?: MediaAttachment
  disabledTypes?: MediaType[]
  onSave: (media: MediaAttachment) => void
}

export function MediaModal({ open, onOpenChange, initialMedia, disabledTypes = [], onSave }: MediaModalProps) {
  const [mediaType, setMediaType] = useState<MediaType>(initialMedia?.type ?? "image")
  const [url, setUrl] = useState(initialMedia?.url ?? "")
  const [error, setError] = useState("")

  const validate = (): boolean => {
    if (!url.trim()) {
      setError("URL is required")
      return false
    }
    try {
      new URL(url)
    } catch {
      setError("Enter a valid URL")
      return false
    }
    const extensions = EXTENSION_MAP[mediaType]
    const urlLower = url.toLowerCase().split("?")[0] // strip query params
    if (!extensions.some(ext => urlLower.endsWith(ext))) {
      setError(`URL must end with ${extensions.join(", ")}`)
      return false
    }
    setError("")
    return true
  }

  const handleSave = () => {
    if (validate()) {
      onSave({ type: mediaType, url: url.trim() })
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Media</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Media Type</Label>
            <RadioGroup value={mediaType} onValueChange={(v) => { setMediaType(v as MediaType); setError("") }}>
              {MEDIA_OPTIONS.map(opt => {
                const Icon = opt.icon
                const disabled = disabledTypes.includes(opt.value)
                return (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted ${
                      mediaType === opt.value ? "border-primary bg-primary/5" : ""
                    } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    <RadioGroupItem value={opt.value} disabled={disabled} />
                    <Icon className="h-4 w-4 shrink-0" />
                    <div>
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div className="text-xs text-muted-foreground">{opt.sizeHint}</div>
                    </div>
                  </label>
                )
              })}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>Public URL</Label>
            <Input
              placeholder="https://example.com/image.jpg"
              value={url}
              onChange={(e) => { setUrl(e.target.value); setError("") }}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd magic-flow && npx tsc --noEmit`
Expected: no errors

---

### Task 6: TypeScript — MediaAttachment node component

**Files:**
- Create: `magic-flow/components/nodes/shared/media-attachment.tsx`

Shared component used by all 3 WhatsApp nodes. Handles trigger, thumbnail, and remove/replace controls.

- [ ] **Step 1: Create the component**

```tsx
// magic-flow/components/nodes/shared/media-attachment.tsx
"use client"

import { useState } from "react"
import { ImageIcon, VideoIcon, FileAudioIcon, FileTextIcon, XIcon, PaperclipIcon } from "lucide-react"
import { MediaModal } from "./media-modal"
import type { MediaAttachment as MediaAttachmentType, MediaType } from "@/types"

const ICON_MAP: Record<MediaType, typeof ImageIcon> = {
  image: ImageIcon,
  video: VideoIcon,
  audio: FileAudioIcon,
  document: FileTextIcon,
}

function filenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname
    return pathname.split("/").pop() || "media"
  } catch {
    return "media"
  }
}

interface MediaAttachmentProps {
  media?: MediaAttachmentType
  selected: boolean
  disabledTypes?: MediaType[]
  onUpdate: (media: MediaAttachmentType | undefined) => void
}

export function MediaAttachment({ media, selected, disabledTypes = [], onUpdate }: MediaAttachmentProps) {
  const [modalOpen, setModalOpen] = useState(false)

  // Thumbnail when media is attached (always visible)
  if (media) {
    const Icon = ICON_MAP[media.type]
    const isVisual = media.type === "image" || media.type === "video"

    return (
      <>
        <div className="relative group rounded-md overflow-hidden border bg-muted/50 mb-2">
          {isVisual ? (
            <div className="relative h-24 w-full">
              {media.type === "image" ? (
                <img
                  src={media.url}
                  alt="Media preview"
                  className="h-full w-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
                />
              ) : (
                <div className="flex items-center justify-center h-full bg-muted">
                  <VideoIcon className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2">
              <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground truncate">{filenameFromUrl(media.url)}</span>
            </div>
          )}

          {/* Replace/remove controls — only when selected */}
          {selected && (
            <div className="absolute top-1 right-1 flex gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); setModalOpen(true) }}
                className="rounded-full bg-background/80 p-1 hover:bg-background cursor-pointer"
                title="Replace media"
              >
                <PaperclipIcon className="h-3 w-3" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onUpdate(undefined) }}
                className="rounded-full bg-background/80 p-1 hover:bg-background cursor-pointer"
                title="Remove media"
              >
                <XIcon className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        <MediaModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          initialMedia={media}
          disabledTypes={disabledTypes}
          onSave={onUpdate}
        />
      </>
    )
  }

  // Trigger when no media (only visible when selected)
  if (!selected) return null

  return (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setModalOpen(true) }}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground py-1.5 px-2 rounded-md hover:bg-muted cursor-pointer transition-colors w-full"
      >
        <PaperclipIcon className="h-3.5 w-3.5" />
        <span>Add media</span>
      </button>

      <MediaModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        disabledTypes={disabledTypes}
        onSave={onUpdate}
      />
    </>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd magic-flow && npx tsc --noEmit`
Expected: no errors

---

### Task 7: TypeScript — Integrate into WhatsApp nodes

**Files:**
- Modify: `magic-flow/components/nodes/whatsapp/whatsapp-message-node.tsx`
- Modify: `magic-flow/components/nodes/whatsapp/whatsapp-quick-reply-node.tsx`
- Modify: `magic-flow/components/nodes/whatsapp/whatsapp-question-node.tsx`

- [ ] **Step 1: Add to whatsapp-message-node.tsx**

Import `MediaAttachment` component and add it inside CardContent, above the message text area (before line 118). The node needs to know if it's selected — check how other nodes detect selection (likely via `selected` prop from ReactFlow).

```tsx
import { MediaAttachment } from "@/components/nodes/shared/media-attachment"

// Inside CardContent, before the text section:
<MediaAttachment
  media={data.media}
  selected={selected}
  onUpdate={(media) => data.onNodeUpdate?.(id, { ...data, media })}
/>
```

- [ ] **Step 2: Add to whatsapp-question-node.tsx**

Same pattern — add `MediaAttachment` inside CardContent before the question section (before line 254). No `disabledTypes` needed (all 4 types supported on question node).

```tsx
<MediaAttachment
  media={data.media}
  selected={selected}
  onUpdate={(media) => data.onNodeUpdate?.(id, { ...data, media })}
/>
```

- [ ] **Step 3: Add to whatsapp-quick-reply-node.tsx**

Same pattern but with `disabledTypes={["audio"]}` (WhatsApp doesn't support audio headers on buttons). Add inside CardContent before the question section (before line 292).

```tsx
<MediaAttachment
  media={data.media}
  selected={selected}
  disabledTypes={["audio"]}
  onUpdate={(media) => data.onNodeUpdate?.(id, { ...data, media })}
/>
```

- [ ] **Step 4: Add list conversion alert to quick reply node**

In `whatsapp-quick-reply-node.tsx`, modify `handleConvertToListWithButtons` (line 157). When `data.media` is present, show an AlertDialog before converting:

Import AlertDialog components and add state:

```tsx
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

// Add state inside component:
const [showMediaAlert, setShowMediaAlert] = useState(false)
const [pendingConversion, setPendingConversion] = useState<(() => void) | null>(null)
```

Modify the conversion trigger (wherever the 4th button add or conversion is triggered) to check for media first:

```tsx
const attemptConversion = (conversionFn: () => void) => {
  if (data.media) {
    setPendingConversion(() => conversionFn)
    setShowMediaAlert(true)
  } else {
    conversionFn()
  }
}
```

Add the AlertDialog JSX:

```tsx
<AlertDialog open={showMediaAlert} onOpenChange={setShowMediaAlert}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Media won't be shown in lists</AlertDialogTitle>
      <AlertDialogDescription>
        WhatsApp lists don't support media headers. Your media will be kept but won't appear in the message.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel onClick={() => setPendingConversion(null)}>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={() => { pendingConversion?.(); setPendingConversion(null) }}>
        Convert anyway
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 5: Verify TypeScript compiles and app renders**

Run: `cd magic-flow && npx tsc --noEmit`
Expected: no errors

---

### Task 8: TypeScript — Converter forward + reverse + tests

**Files:**
- Modify: `magic-flow/utils/whatsapp-converter.ts:8-44` (FsWhatsAppFlowStep), `273-347` (forward), `732-754` (reverse)
- Modify: `magic-flow/utils/__tests__/whatsapp-converter.test.ts`

- [ ] **Step 1: Add media fields to FsWhatsAppFlowStep interface**

In `magic-flow/utils/whatsapp-converter.ts`, add to the interface (after `input_config`):

```typescript
  media_type?: "image" | "video" | "audio" | "document"
  media_url?: string
```

- [ ] **Step 2: Add media to forward conversion — whatsappQuestion case**

At the end of the `whatsappQuestion` case (around line 277), before `break`:

```typescript
      case "whatsappQuestion":
      case "question": {
        step.message_type = "text"
        // ... existing code ...

        // Media attachment
        if (data.media?.type && data.media?.url) {
          step.media_type = data.media.type
          step.media_url = data.media.url
        }
        break
      }
```

- [ ] **Step 3: Add media to forward conversion — whatsappQuickReply case**

At the end of the `whatsappQuickReply` case (around line 307), before `break`:

```typescript
        // Media attachment
        if (data.media?.type && data.media?.url) {
          step.media_type = data.media.type
          step.media_url = data.media.url
        }
```

- [ ] **Step 4: Add media to forward conversion — whatsappInteractiveList case**

Same pattern at end of the `whatsappInteractiveList` case (around line 337):

```typescript
        // Media attachment (preserved for round-trip, runtime ignores for lists)
        if (data.media?.type && data.media?.url) {
          step.media_type = data.media.type
          step.media_url = data.media.url
        }
```

- [ ] **Step 5: Add media to forward conversion — whatsappMessage case**

At end of `whatsappMessage` case (around line 346):

```typescript
        // Media attachment
        if (data.media?.type && data.media?.url) {
          step.media_type = data.media.type
          step.media_url = data.media.url
        }
```

- [ ] **Step 6: Add media to reverse conversion**

In the reverse conversion switch (around line 732-754), after reconstructing node data for each type, add:

```typescript
      // After each case that sets data.question or data.text:
      if (step.media_type && step.media_url) {
        ;(data as any).media = { type: step.media_type, url: step.media_url }
      }
```

Add this for all 4 cases: `whatsappQuestion`, `whatsappQuickReply`, `whatsappInteractiveList`, `whatsappMessage`.

- [ ] **Step 7: Write converter test — forward with media**

Add to `magic-flow/utils/__tests__/whatsapp-converter.test.ts`:

```typescript
describe("media attachment", () => {
  it("includes media_type and media_url in forward conversion for message node", () => {
    const nodes = [
      startNode,
      {
        id: "msg1",
        type: "whatsappMessage",
        position: { x: 200, y: 0 },
        data: {
          platform: "whatsapp",
          text: "Check out this image",
          media: { type: "image", url: "https://example.com/photo.jpg" },
        },
      },
    ]
    const edges = [
      { id: "e1", source: "start", target: "msg1", sourceHandle: null, targetHandle: null },
    ]

    const result = convertToFsWhatsApp(nodes as any, edges as any, "Test", "test")
    const step = result.steps.find(s => s.step_name.includes("msg1") || s.message === "Check out this image")!
    expect(step.media_type).toBe("image")
    expect(step.media_url).toBe("https://example.com/photo.jpg")
  })

  it("preserves media on interactive list for round-trip", () => {
    const nodes = [
      startNode,
      {
        id: "list1",
        type: "whatsappInteractiveList",
        position: { x: 200, y: 0 },
        data: {
          platform: "whatsapp",
          question: "Pick one",
          options: [
            { id: "o1", text: "A" },
            { id: "o2", text: "B" },
            { id: "o3", text: "C" },
            { id: "o4", text: "D" },
          ],
          media: { type: "image", url: "https://example.com/photo.jpg" },
        },
      },
    ]
    const edges = [
      { id: "e1", source: "start", target: "list1", sourceHandle: null, targetHandle: null },
    ]

    const result = convertToFsWhatsApp(nodes as any, edges as any, "Test", "test")
    const step = result.steps.find(s => s.message === "Pick one")!
    expect(step.media_type).toBe("image")
    expect(step.media_url).toBe("https://example.com/photo.jpg")
  })
})
```

- [ ] **Step 8: Write converter test — reverse with media**

```typescript
  it("reconstructs media from reverse conversion", () => {
    const flow = {
      name: "Test",
      steps: [
        {
          step_name: "msg1",
          step_order: 1,
          message: "Check out this image",
          message_type: "text" as const,
          input_type: "none" as const,
          media_type: "image" as const,
          media_url: "https://example.com/photo.jpg",
        },
      ],
    }

    const { nodes } = convertFromFsWhatsApp(flow as any)
    const msgNode = nodes.find(n => n.type === "whatsappMessage")!
    expect((msgNode.data as any).media).toEqual({
      type: "image",
      url: "https://example.com/photo.jpg",
    })
  })
```

- [ ] **Step 9: Run converter tests**

Run: `cd magic-flow && npx vitest run utils/__tests__/whatsapp-converter.test.ts`
Expected: ALL PASS

---

### Task 9: TypeScript — Publish validation + AI docs

**Files:**
- Modify: `magic-flow/components/publish-modal.tsx:114-146`
- Modify: `magic-flow/constants/node-categories.ts` (NODE_TEMPLATES AI fields)
- Modify: `magic-flow/lib/ai/core/node-documentation.ts` (buildDataStructure)

- [ ] **Step 1: Add media validation to publish modal**

In `magic-flow/components/publish-modal.tsx`, add validation after the existing checks (around line 146):

```typescript
// Check for media nodes with empty URLs
const mediaWarnings: string[] = []
for (const node of nodes) {
  const data = node.data as any
  if (data.media) {
    if (!data.media.url) {
      errors.push(`Node "${data.label || node.id}" has media attached but no URL`)
    }
    // Warn about media on list nodes (not blocking)
    if (node.type === "whatsappInteractiveList" && data.media.url) {
      mediaWarnings.push(`Node "${data.label || node.id}" has media but lists don't show media headers`)
    }
  }
}
```

Display `mediaWarnings` as non-blocking warnings in the UI (yellow/warning color) if the publish modal already has a warning display pattern. If not, add them to the validation output.

- [ ] **Step 2: Update NODE_TEMPLATES AI fields**

In `magic-flow/constants/node-categories.ts`, add `media` to the `ai.contentFields` for each relevant template:

For `question` (around line 174):
```typescript
ai: {
  // ... existing fields ...
  contentFields: ["question", "storeAs", "media"],
}
```

For `quickReply` (around line 201):
```typescript
ai: {
  // ... existing fields ...
  contentFields: ["question", "buttons", "storeAs", "media"],
}
```

For `whatsappMessage` (around line 253):
```typescript
ai: {
  // ... existing fields ...
  contentFields: ["text", "media"],
}
```

- [ ] **Step 3: Update node-documentation buildDataStructure**

In `magic-flow/lib/ai/core/node-documentation.ts`, find the `buildDataStructure` function and add media to the relevant cases:

```typescript
case "whatsappMessage":
  return {
    text: "string — the message content",
    media: "{ type: 'image'|'video'|'audio'|'document', url: string } — optional media attachment",
  }

case "whatsappQuickReply":
case "whatsappQuestion":
  return {
    question: "string — the question text",
    // ... existing fields ...
    media: "{ type: 'image'|'video'|'audio'|'document', url: string } — optional media attachment (audio not supported on quick reply)",
  }
```

- [ ] **Step 4: Verify everything compiles**

Run: `cd magic-flow && npx tsc --noEmit && npx vitest run`
Expected: no type errors, all tests pass

---

### Task 10: Final verification

**Files:** All modified files across both repos

- [ ] **Step 1: Run full Go test suite**

Run: `cd fs-whatsapp && make lint && make test`
Expected: ALL PASS

- [ ] **Step 2: Run full TypeScript checks**

Run: `cd magic-flow && npx tsc --noEmit && npx vitest run`
Expected: ALL PASS

- [ ] **Step 3: Check if fs-whatsapp docs need updating**

Check `fs-whatsapp/docs/src/content/docs/` for any chatbot flow or message type documentation that should mention media support.

- [ ] **Step 4: Notify user for review**

All changes are ready for review. No commits have been made. Present a summary of all modified files for the user to review before committing.
