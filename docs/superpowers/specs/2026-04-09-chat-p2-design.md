# Chat P2 Design Spec

**Date:** 2026-04-09
**Branch:** `feat/chat-p2`
**Approach:** Two PRs — PR1 (message interactions + input), PR2 (panels + polish)

## Scope

9 features, all with backend ready in fs-whatsapp. No backend changes needed. Typing indicators deferred to future scope.

## PR1 — Message Interactions + Input Enhancements

### 1. Hover Toolbar

Floating action bar on message hover. Foundation for reply, react, and retry.

**Component:** `components/chat/conversation/message-actions.tsx`

**Behavior:**
- Wraps each `MessageBubble` in `message-list.tsx` with a `group` container
- Toolbar: `opacity-0 group-hover:opacity-100 transition-opacity` positioned above the bubble
- Outgoing messages: toolbar above-left. Incoming: above-right.
- Actions vary by message state:
  - **All messages:** Reply (CornerUpLeft icon), React (Smile icon)
  - **Failed outgoing, non-template:** Retry (RotateCw icon)

**Props:**
```ts
interface MessageActionsProps {
  message: Message
  onReply: (message: Message) => void
  onReact: (messageId: string, emoji: string) => void
  onRetry: (message: Message) => void
}
```

**React button behavior:** Click opens a small popover with 6 quick emojis: `['👍', '❤️', '😂', '😮', '😢', '🙏']`. Clicking an emoji calls `onReact(messageId, emoji)`. Clicking the same emoji the user already reacted with removes the reaction by sending `{ emoji: "" }` to backend (verified: `contacts.go:938-944` — empty string removes, non-empty replaces).

### 2. Reply-to Input UI

Select a message to reply to, show indicator bar above input, send with `reply_to_message_id`.

**State:** `replyingTo: Message | null` added to `use-chat.ts` (local useState, not URL param — ephemeral).

**Reply indicator bar:** Rendered inside `message-input.tsx` above the textarea.
- Left border accent (`border-l-2 border-primary`)
- Shows "Replying to Customer" or "Replying to You" based on direction
- 2-line clamp content preview (text body or message type label)
- X button to dismiss (calls `clearReplyingTo`)

**Send flow:**
1. User clicks Reply in hover toolbar → `setReplyingTo(message)` → focus textarea
2. Reply bar appears above input
3. User types and sends → `useSendMessage` includes `reply_to_message_id`
4. On success or dismiss → `clearReplyingTo()`

**Keyboard dismiss:** Pressing Escape while textarea is focused clears `replyingTo` (standard UX pattern). Add `onKeyDown` handler to textarea: if `e.key === "Escape" && replyingTo`, call `clearReplyingTo()` and `e.preventDefault()`.

**Changes to `useSendMessage`:**
Current signature: `mutationFn: (body: string) => ...`
New signature: `mutationFn: ({ body, replyToMessageId }: { body: string; replyToMessageId?: string }) => ...`

Backend `SendMessage` handler accepts `reply_to_message_id` (string UUID) in the POST JSON body (contacts.go:515).

**Call site update:** `message-input.tsx` line 21 currently calls `sendMessage(trimmed, { onSuccess })` — must change to `sendMessage({ body: trimmed, replyToMessageId: replyingTo?.id }, { onSuccess })`. All call sites of `useSendMessage` must adopt the new object signature.

**Data flow:** `conversation.tsx` passes `replyingTo` + `setReplyingTo` + `clearReplyingTo` to both `MessageList` (for hover toolbar callback) and `MessageInput` (for indicator bar + send payload). Also passes `contact` object down to `MessageInput` (needed for canned response placeholder replacement).

### 3. Reactions

Emoji reactions on messages with real-time sync.

**Display:** Reaction pills rendered inside `message-bubble.tsx`, below the message content, above the timestamp row.
- Group reactions by emoji: `👍 2` if multiple users reacted with the same emoji
- Each pill: `bg-muted/50 rounded-full px-2 py-0.5 text-xs` with emoji + count
- Tooltip on pill shows who reacted (`from_phone` or `from_user`)

**Type update in `types/chat.ts`:**
```ts
export interface Reaction {
  emoji: string
  from_phone?: string
  from_user?: string
}

// Message.reactions changes from any[] to Reaction[]
// Backend uses omitempty — field may be undefined, not []. Always use (message.reactions ?? []).
reactions: Reaction[]
```

**Sending:** Via hover toolbar quick emoji picker (see section 1). Mutation in `use-messages.ts`:
```ts
export function useReaction(contactId: string) {
  return useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      apiClient.post(`/api/contacts/${contactId}/messages/${messageId}/reaction`, { emoji }),
  })
}
```
**Optimistic update:** Reactions must feel instant — 200-500ms latency on a tap feels broken. On mutate:
1. Snapshot current reactions array
2. Optimistically append/remove the reaction in React Query cache (simple array filter + push)
3. On error: rollback to snapshot
4. WebSocket `reaction_update` will also arrive and overwrite — but since the data matches, it's a no-op.
This is low risk: it's a simple array operation with rollback.

**WebSocket sync:** New subscription in `use-chat-websocket.ts`:
- Subscribe to `reaction_update` event
- Payload: `{ message_id, contact_id, reactions[] }`
- Handler: find message by ID in React Query cache, replace its `reactions` array
- Guard: only patch if `payload.contact_id === activeContactIdRef.current` (explicit contact_id check from payload, not inferred)

**WebSocket event type:** Add `"reaction_update"` to `WebSocketEventType` union in `types/chat.ts`.

### 4. Emoji Picker

`emoji-picker-react` in message input toolbar for inserting emojis into text.

**Package:** `emoji-picker-react` (npm install)

**Placement:** New button (Smile icon) in `message-input.tsx` between the paperclip button and the textarea.

**Behavior:** Click opens a Popover (side="top", align="start") containing the emoji picker. On emoji select, insert at current cursor position in textarea (not just append). Close popover after selection.

**Config:**
```tsx
<EmojiPicker
  native
  skinTonesDisabled
  theme={resolvedTheme === "dark" ? Theme.DARK : Theme.LIGHT}
  onEmojiClick={(emojiData) => insertAtCursor(emojiData.emoji)}
/>
```

**`insertAtCursor` helper:** Uses `textareaRef.current.selectionStart` to insert emoji at cursor position, then restores focus.

### 5. Canned Responses

Type `/` to trigger a searchable picker of pre-configured response templates.

**Component:** `components/chat/conversation/canned-response-picker.tsx`

**Trigger mechanism (matches Vue):**
- Watch `text` state in `message-input.tsx`
- If text starts with `/` **as the first character**: open picker, extract everything after `/` as search query
- If `/` removed or text no longer starts with `/`: close picker
- Can also open via button click (MessageSquareText icon in input toolbar, between emoji and textarea)
- **Important:** Only trigger on `/` at position 0. Mid-text slashes (e.g., typing a URL like `https://example.com/path`) must NOT trigger the picker. The check is `text.startsWith("/")`, not "text contains /".

**Picker UI:**
- Popover positioned above textarea (side="top", align="start")
- Search input at top with Search icon
- Grouped by category: Greetings, Support, Sales, Closing, General
- Each item shows: name (bold), `/shortcut` mono badge, 2-line content preview
- Empty state: "No canned responses found"
- Loading spinner on first open
- Width: `w-80` (320px), scroll area: `h-[300px]`

**Selection behavior:**
1. User clicks a response
2. Replace placeholders: `{{contact_name}}` → contact's profile_name/name, `{{phone_number}}` → contact's phone
3. Replace textarea text entirely with processed content
4. Track usage: `POST /api/canned-responses/{id}/use` (fire and forget)
5. Close picker, clear search

**Query hook:** New file `hooks/queries/use-canned-responses.ts`:
```ts
// Backend returns { canned_responses: CannedResponse[] } after apiClient envelope unwrap.
// The hook returns the full object — consumers access data?.canned_responses.
export function useCannedResponses() {
  return useQuery({
    queryKey: cannedResponseKeys.list(),
    queryFn: () => apiClient.get<{ canned_responses: CannedResponse[] }>('/api/canned-responses?active_only=true'),
    staleTime: 5 * 60 * 1000, // 5 min — responses don't change often
  })
}
```

Query key added to `query-keys.ts`:
```ts
export const cannedResponseKeys = {
  all: ["cannedResponses"] as const,
  lists: () => [...cannedResponseKeys.all, "list"] as const,
  list: () => [...cannedResponseKeys.lists()] as const,
}
```

**Props:** `message-input.tsx` needs `contact: Contact` prop for placeholder replacement.

### 6. Retry Failed Messages

Retry button in hover toolbar for failed outgoing **text** messages only.

**Behavior:**
1. User clicks Retry in hover toolbar
2. Extract `message.content.body` from the failed message
3. Call `useSendMessage` with `{ body: message.content.body }`
4. On success: remove the failed message from React Query cache
5. Show spinner on retry button while sending

**State:** `retryingMessageId: string | null` in message-list level, passed to `MessageActions` to disable button and show spinner during retry.

**Visibility rule:** Retry button only shows when ALL of:
- `message.status === "failed"`
- `message.direction === "outgoing"`
- `message.message_type === "text"` (not template, not media, not interactive)

`useSendMessage` is hardcoded to `type: "text"` — retrying media/interactive messages would require a separate `useRetryMessage` mutation. Defer that to future scope; text retry covers the common case.

**Atomic cache update on success:** In the `onSuccess` callback, use a single `setQueryData` call that both removes the failed message (by ID) and appends the new message. This avoids two separate renders and prevents race conditions with WebSocket delivery (which also appends the new message — dedup by ID handles this).

## PR2 — Panels + Polish

### 7. Contact Info Panel

Right sidebar showing contact details, session data, tags, and variables. Replicates Vue's dynamic `panel_config` system.

**Components:**
- `components/chat/contact-info-panel/contact-info-panel.tsx` — main container
- `components/chat/contact-info-panel/session-data-section.tsx` — dynamic section renderer
- `components/chat/contact-info-panel/contact-variables.tsx` — variables by flow

**Sections (top to bottom):**
1. **Header:** Close button (X), "Contact Info" title
2. **Contact card:** Avatar (h-16 w-16 centered), name, phone with Phone icon
3. **Flow badge:** Current flow name from session data (Badge variant="outline")
4. **Dynamic sections from `panel_config`:**
   - Sorted by `order` field
   - Collapsible sections: Collapsible component with ChevronDown toggle
   - Non-collapsible sections: static header + content
   - Grid layout: `grid-cols-1` or `grid-cols-2` per section config
   - Fields sorted by `order` within each section
   - Display types:
     - `text`: label (10px uppercase muted) + value (sm semibold)
     - `badge`: rounded-full pill with color variant
     - `tag`: rounded-md pill with color variant
   - Color variants: success (green), warning (yellow), error (red), info (blue), default (muted)
   - All fields in `bg-muted/50 rounded-md px-3 py-2` cards
5. **Tags:** Badge variant="secondary" for each tag. Only shown if contact has tags.
6. **Variables:** Collapsible section with Database icon. Grouped by flow slug (Badge variant="outline" for slug name). Each variable: label + value in same card style as dynamic fields.

**Empty state:** User icon + "No data configured" + "Configure panel display in the chatbot flow settings."

**Resizable (mouse-only, desktop v1):**
- Left-edge drag handle: `w-1 cursor-col-resize hover:bg-primary/20 active:bg-primary/30`
- Min: 280px, Max: 480px
- `mousedown` → `document.addEventListener('mousemove/mouseup')`
- Panel width in local state (not persisted)
- Note: touch/pointer events not handled — this is desktop-only for v1. Not a bug, intentional scope limit.

**Toggle:** Info button (PanelRight or Info icon) added to right side of `conversation-header.tsx`. `showInfoPanel: boolean` state in `use-chat.ts`.

**Data fetching:** New file `hooks/queries/use-contact-info.ts`:
```ts
// Backend returns SessionData directly after envelope unwrap.
export function useContactSessionData(contactId: string) {
  return useQuery({
    queryKey: contactInfoKeys.sessionData(contactId),
    queryFn: () => apiClient.get<SessionData>(`/api/contacts/${contactId}/session-data`),
    enabled: !!contactId,
  })
}

// Backend returns { variables: Record<string, ContactVariable[]> } after envelope unwrap.
// Consumers access data?.variables.
export function useContactVariables(contactId: string) {
  return useQuery({
    queryKey: contactInfoKeys.variables(contactId),
    queryFn: () => apiClient.get<{ variables: Record<string, ContactVariable[]> }>(`/api/contacts/${contactId}/variables`),
    enabled: !!contactId,
  })
}
```

**Defensive `panel_config` handling:** Backend stores `panel_config` as JSONB (`map[string]any`). Fields may be partially populated. The dynamic section renderer must:
- Default `sections` to `[]` if missing
- Default `collapsible` to `false`, `columns` to `1`, `order` to `0` if missing per section
- Default `display_type` to `"text"` if missing per field
- Skip fields with missing `key`

**Integration:**
- `chat-layout.tsx` — remove hardcoded `w-80` from the infoPanel wrapper div. Instead, render `{infoPanel}` directly (the panel component manages its own width via inline style). The `border-l` and `flex-shrink-0` stay on the panel component itself.
- `page.tsx` — pass `<ContactInfoPanel contactId={activeContactId} onClose={toggleInfoPanel} />` as `infoPanel` when `showInfoPanel` is true
- `conversation-header.tsx` — add toggle button, accept `onInfoToggle` + `showInfoPanel` props

**Types added to `types/chat.ts`:**
```ts
export interface PanelFieldConfig {
  key: string
  label: string
  order: number
  display_type?: "text" | "badge" | "tag"
  color?: "default" | "success" | "warning" | "error" | "info"
}

export interface PanelSection {
  id: string
  label: string
  columns: number
  collapsible: boolean
  default_collapsed: boolean
  order: number
  fields: PanelFieldConfig[]
}

export interface PanelConfig {
  sections: PanelSection[]
}

export interface SessionData {
  session_id?: string
  flow_id?: string
  flow_name?: string
  session_data: Record<string, any>
  panel_config?: PanelConfig // May be null/missing — backend stores as JSONB map[string]any
}

export interface ContactVariable {
  variable_name: string
  value: string
  updated_at: string
}
```

### 8. Sticky Date Headers

Make existing date separators sticky during scroll.

**Change in `message-list.tsx`:**

Current (line 155):
```tsx
<div className="flex justify-center my-3">
```

New:
```tsx
<div className="sticky top-0 z-10 flex justify-center my-3 bg-background">
```

Add `bg-background` on the sticky div to prevent messages showing through behind the pill when stuck. Add `shadow-sm` to the span for visual separation. The scroll container (`scrollRef`) already has `overflow-y-auto`, so sticky children pin to its top edge. Each date header naturally unsticks when the next one scrolls into view.

No JavaScript needed — pure CSS.

### 9. Notification Sounds

Play a sound on incoming messages when user is not viewing that contact.

**New file:** `lib/notification-sound.ts`
```ts
let audio: HTMLAudioElement | null = null

export function playNotificationSound() {
  if (!audio) {
    audio = new Audio("/notification.mp3")
    audio.volume = 0.5
  }
  audio.currentTime = 0
  audio.play().catch(() => {})  // Suppress autoplay policy errors
}
```

**Sound file:** Copy `notification.mp3` from `fs-whatsapp/frontend/public/` to `magic-flow/public/`. If it doesn't exist there, source a standard notification chime.

**Trigger:** In `use-chat-websocket.ts`, inside `handleNewMessage`:
```ts
// After cache patching, before return
if (
  payload.direction === "incoming" &&
  activeContactIdRef.current !== payload.contact_id &&
  document.hasFocus() // Only play in the focused tab — prevents multiple tabs all playing
) {
  playNotificationSound()
}
```

`document.hasFocus()` ensures users with multiple MagicFlow tabs don't get a sound from every tab. Only the active tab plays. No settings toggle for now — can add when we build a user preferences page.

## Files Changed Summary

### New files:
- `components/chat/conversation/message-actions.tsx`
- `components/chat/conversation/canned-response-picker.tsx`
- `components/chat/contact-info-panel/contact-info-panel.tsx`
- `components/chat/contact-info-panel/session-data-section.tsx`
- `components/chat/contact-info-panel/contact-variables.tsx`
- `hooks/queries/use-canned-responses.ts`
- `hooks/queries/use-contact-info.ts`
- `lib/notification-sound.ts`
- `public/notification.mp3`

### Modified files:
- `types/chat.ts` — Reaction interface, SessionData types, WebSocketEventType union
- `hooks/use-chat.ts` — replyingTo state, showInfoPanel state
- `hooks/use-chat-websocket.ts` — reaction_update subscription, notification sound trigger
- `hooks/queries/use-messages.ts` — useReaction mutation, useSendMessage signature change
- `hooks/queries/query-keys.ts` — cannedResponseKeys, contactInfoKeys
- `components/chat/conversation/message-list.tsx` — wrap bubbles with MessageActions, sticky date headers, retryingMessageId state
- `components/chat/conversation/message-bubble.tsx` — reaction pills display
- `components/chat/conversation/message-input.tsx` — emoji picker button, canned response trigger, reply indicator bar, contact prop
- `components/chat/conversation/conversation.tsx` — thread replyingTo/infoPanel state through children
- `components/chat/conversation/conversation-header.tsx` — info panel toggle button
- `app/(dashboard)/chat/page.tsx` — pass infoPanel to ChatLayout

### Also modified (PR2):
- `components/chat/chat-layout.tsx` — remove hardcoded `w-80` from infoPanel wrapper, let panel manage own width

### No changes:
- Backend (fs-whatsapp) — all endpoints already exist

## Backend Endpoints Used

All existing, no new endpoints needed:

| Endpoint | Feature |
|----------|---------|
| `GET /api/canned-responses?active_only=true` | Canned responses list |
| `POST /api/canned-responses/{id}/use` | Track canned response usage |
| `POST /api/contacts/{id}/messages` (with `reply_to_message_id`) | Reply-to send |
| `POST /api/contacts/{id}/messages/{mid}/reaction` | Send/remove reaction |
| `GET /api/contacts/{id}/session-data` | Contact info panel |
| `GET /api/contacts/{id}/variables` | Contact variables |
| WebSocket `reaction_update` event | Real-time reaction sync |

## Dependencies

- `emoji-picker-react` (npm package) — for emoji picker in input toolbar
