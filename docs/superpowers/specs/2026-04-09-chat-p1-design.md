# Chat P1 — Core Chat Interface

## Goal

Port the chat interface from fs-whatsapp's Vue frontend to MagicFlow React. Users can view contacts, send/receive messages (text + media), and see all message types rendered — with real-time updates via WebSocket.

## Scope

**In P1:**
- WebSocket service (app-wide, always connected)
- Contact list sidebar (server-side search, channel filter, offset pagination, unread badges)
- Chat conversation (all message type renderers, infinite scroll upward)
- Media display (image, video, audio, document, location, contacts, sticker)
- Media sending (file upload with preview, type/size validation)
- Text message sending (await response, not optimistic)
- Mark-as-read (automatic on message fetch — already built into the API)
- Sidebar unread count badge on Chat nav item
- Both WhatsApp + Instagram channels

**Deferred:**
- P2: Canned responses, emoji picker, reply-to, reactions, notification sounds
- P3: Agent transfers, contact info panel, custom actions
- Phase 4.1: Contacts management page (CRM-style filtering, bulk actions)

## Architecture

React Query for all state. WebSocket patches the React Query cache directly — one source of truth, no separate store. Components are standalone and composable for easy reshuffling.

```
AppShell (useWebSocket lives here — client component, app-wide)
  └─ Sidebar (unread badge from WebSocket events)
  └─ /chat page
       └─ ChatLayout (3-column grid)
            ├─ ContactList (useContacts + WebSocket subscription)
            ├─ Conversation (useMessages + WebSocket subscription)
            └─ Placeholder (P3: contact info panel)
```

**Important:** `useWebSocket` must live in `components/app-shell.tsx` (a `"use client"` component), NOT in `app/(dashboard)/layout.tsx` which is a server component. Hooks cannot be called in server components.

## Component Tree

All components are standalone — each has a single responsibility and communicates via props or React Query cache.

```
app/(dashboard)/chat/page.tsx                    — page shell, reads ?contact= from URL
  components/chat/chat-layout.tsx                — 3-column grid container
  
  components/chat/contact-list/
    contact-list.tsx                             — search + filter + scrollable list container
    contact-list-item.tsx                        — single row: avatar, name, last message preview, 
                                                   unread badge, channel icon, timestamp
    contact-list-filters.tsx                     — channel filter pills (All / WhatsApp / Instagram)
    contact-list-skeleton.tsx                    — loading state

  components/chat/conversation/
    conversation.tsx                             — header + message list + input, empty state
    conversation-header.tsx                      — contact name, avatar, channel icon, online status
    message-list.tsx                             — scrollable div, infinite scroll up with scroll preservation,
                                                   date separators, "new messages ↓" pill, blob URL cache
    message-bubble.tsx                           — wrapper: direction (in/out), timestamp, status icon,
                                                   delegates to type-specific renderer
    message-input.tsx                            — text input (Enter to send), attach button
    media-upload-preview.tsx                     — file preview dialog before sending

  components/chat/messages/                      — one pure renderer per message type
    text-message.tsx                             — plain text with URL linkification
    image-message.tsx                            — image with caption, click to expand
    video-message.tsx                            — video player with poster
    audio-message.tsx                            — audio player with duration display
    document-message.tsx                         — file icon + name + size + download link
    template-message.tsx                         — structured template with header/body/footer/buttons
    interactive-message.tsx                      — bot-sent buttons/lists (WA + IG)
    button-reply-message.tsx                     — user tapped a quick reply button
    location-message.tsx                         — static map placeholder + Google Maps link
    contacts-message.tsx                         — vCard display (name, phone)
    sticker-message.tsx                          — sticker image (WA only)
    unsupported-message.tsx                      — fallback for unknown types
```

## Data Layer

### Hooks

```
hooks/
  use-websocket.ts                — app-wide WebSocket connection, event dispatch, context provider

hooks/queries/
  use-contacts.ts                 — useContacts(), useContact(id)
  use-messages.ts                 — useMessages(contactId), useSendMessage(), useSendMedia()
  query-keys.ts                   — add contactKeys, messageKeys factories
```

### `useWebSocket`

Lives in `components/app-shell.tsx` via a `WebSocketProvider` context. Connects on mount if authenticated, stays connected. Exponential backoff reconnection (1s base, 5 attempts max, then retry every 30s indefinitely). After 5 fast retries fail, show a persistent banner: "Connection lost. Retrying..." with a manual "Retry now" button. The 30s slow-poll continues in the background. On successful reconnect, dismiss the banner and invalidate caches.

```typescript
interface UseWebSocket {
  sendEvent: (type: string, payload: any) => void
  subscribe: (eventType: string, handler: (payload: any) => void) => () => void
  isConnected: boolean
}
```

**WebSocket URL:** `ws(s)://${FS_WHATSAPP_URL}/ws?token=${jwt}`

**Token refresh on reconnect:** Get current token from auth context on each reconnection attempt, not the token captured at initial connect. This handles JWT expiry during long sessions.

**Data refresh on reconnect:** After successful reconnection (not initial connect), invalidate React Query caches:
```typescript
queryClient.invalidateQueries({ queryKey: contactKeys.all })
queryClient.invalidateQueries({ queryKey: messageKeys.lists() })
```

**Events handled (P1):**

| Event | Action |
|-------|--------|
| `new_message` | Append to active conversation's message cache (dedup by ID). Update contact's `last_message`, `unread_count`, reorder to top. |
| `status_update` | Patch message status in cache |
| `message_status` | Same as `status_update` — backend uses both names. Handle identically. |
| `ping` | Respond with `pong` |

**Message deduplication:** When inserting a `new_message` into the React Query cache, check if a message with that ID already exists in any page. Skip if duplicate. This prevents double-display when send response and WebSocket broadcast both deliver the same message.

**Message ordering:** WebSocket events can arrive out of order. When appending a `new_message` to the cache, insert by `created_at` timestamp (descending — newest first in page 0), not by arrival order. Binary search on the first page's timestamps to find the insertion index. This ensures two rapid messages display in chronological order regardless of delivery order.

**Events deferred:**
- `reaction_update` → P2
- `agent_transfer`, `agent_transfer_resume`, `agent_transfer_assign`, `transfer_escalation` → P3
- `campaign_stats_update` → Phase 4

### `useContacts`

React Query `useInfiniteQuery`. Server-side search and filtering. **Offset-based pagination** (not cursor-based — the backend uses `page` + `limit` with SQL OFFSET).

```typescript
function useContacts(options?: {
  search?: string          // debounced 300ms, server-side
  channel?: "whatsapp" | "instagram" | null  // server-side filter
}): UseInfiniteQueryResult

// Endpoint: GET /api/contacts?search=&channel=&page=1&limit=20
// Response: { contacts: Contact[], total: number, page: number, limit: number }
// getNextPageParam: (lastPage) => lastPage.contacts.length === lastPage.limit ? lastPage.page + 1 : undefined
```

**Contact reordering on `new_message`:** Flatten all pages into a single array. Remove the contact from wherever it appears, update its fields (`last_message_preview`, `unread_count`, `last_message_at`), prepend to position 0. Merge everything into page 0, keeping only the last page intact (its length drives `getNextPageParam`). No re-chunking — React Query's `useInfiniteQuery` renders all pages as a continuous list.

### `useMessages`

React Query `useInfiniteQuery` with **cursor-based pagination** (uses `before_id`).

```typescript
function useMessages(contactId: string | null): UseInfiniteQueryResult

// Endpoint: GET /api/contacts/:id/messages?before_id=<cursor>&limit=30
// First page: no before_id (gets latest 30)
// Next pages: before_id = oldest message ID from current data
```

**Mark-as-read:** The `GET /api/contacts/:id/messages` endpoint (first page, no `before_id`) automatically marks all incoming messages as read and sends WhatsApp read receipts. This is built into the backend handler — no separate API call needed.

**Footgun warning:** Because fetching messages triggers mark-as-read, set `staleTime: Infinity` for the first page query. This prevents React Query's background refetches and staleTime-based refetches from silently marking messages as read. Only an explicit user action (opening a conversation) should trigger the initial fetch. Do NOT add prefetching for messages — hovering over a contact in the list must not mark their messages as read.

WebSocket `new_message` for the active contact: append to the first page of the infinite query cache (with dedup check).

### `useSendMessage`

```typescript
function useSendMessage(contactId: string): UseMutationResult

// Endpoint: POST /api/contacts/:id/messages
// Body: { type: "text", content: { body: string }, reply_to_message_id?: string }
```

**No optimistic updates.** Disable the send button + show spinner while awaiting response. On success, append the returned message to the cache. The WebSocket may also broadcast the same message — dedup by ID prevents duplicates. This matches the Vue implementation and avoids the client-generated temp ID complexity.

### `useSendMedia`

```typescript
function useSendMedia(contactId: string): UseMutationResult

// Endpoint: POST /api/messages/media
// Body: FormData { file, contact_id, type, caption? }
//   type: "image" | "video" | "audio" | "document"
// Validation: image (5MB, JPEG/PNG), video (16MB, MP4), audio (16MB), document (100MB)
```

Show local file preview in `media-upload-preview.tsx` before sending. On success, append returned message to cache. Revoke the local preview URL after send completes.

### `useChat`

Minimal local state for the chat page UI (not React Query — ephemeral):

```typescript
interface ChatState {
  activeContactId: string | null   // synced with ?contact= URL param
  isAtBottom: boolean              // for scroll-to-bottom vs "new messages" pill
}
```

When `?contact=<id>` is present on page load but the contact isn't in the initial contacts page, use `useContact(id)` to fetch that contact's details independently for the conversation header.

## Performance Requirements

### Contact List
- Server-side search with 300ms debounce
- Offset-based pagination, load more on scroll to bottom
- WebSocket cache patches — no refetch on new message

### Message List
- **Plain scrollable div** — no virtualization library. The Vue production app renders all loaded messages without virtualization and performs fine. 30 messages per page, typical conversations load 1-3 pages (30-90 messages). Virtualization can be added later if conversations with 500+ loaded messages become a real performance issue.
- **Cursor-based infinite scroll upward** — `onScroll` handler checks `scrollTop < 100`, triggers `fetchNextPage`. Scroll position preserved after prepend via manual `scrollHeight` delta math (same technique as Vue):
  ```typescript
  const prevScrollHeight = container.scrollHeight
  const prevScrollTop = container.scrollTop
  await fetchNextPage()
  // After React re-render:
  container.scrollTop = container.scrollHeight - prevScrollHeight + prevScrollTop
  ```
- **Scroll-to-bottom on new message** — track `isAtBottom` via scroll handler (check if `scrollTop + clientHeight >= scrollHeight - 50`). If at bottom, auto-scroll on new message. If scrolled up, show "New messages ↓" pill.
- **Date separators** — inserted between messages from different days. Computed from message timestamps, not stored.

### Media Blob URL Lifecycle

Blob URL cache lives in `message-list.tsx` as a `useRef<Map<string, string>>()`. Media renderers receive blob URLs as props — they never fetch.

**Fetch trigger:** On mount, a `useEffect` in `message-list.tsx` iterates media messages and fetches any with no cached blob URL. For each, call `GET /api/media/:message_id` (auth header required — `apiClient` handles this), store the resulting `URL.createObjectURL(blob)` in the map, and pass it down as `blobUrl` prop. Re-run when messages change (new page loaded, new message received). Browser connection limits (6 per domain) naturally throttle concurrent fetches.

**Revocation:** Revoke all cached URLs on contact switch or conversation unmount (clear the map, `URL.revokeObjectURL` each entry).

**Aspect ratio preservation** — if the API provides dimensions, render a placeholder at the correct aspect ratio before the image loads (prevents layout shift during scroll)

### WebSocket Efficiency
- **Batch contact updates** — collect `new_message` events arriving within one microtask into a queue, flush all in a single `queryClient.setQueryData` call via `queueMicrotask`. This batches rapid-fire events without a timer.
- **Active contact optimization** — events for the viewed contact update both message cache and contact cache. Events for other contacts only update the contact list cache (unread count + last message).
- **`set_contact` event** — when user opens a conversation, send `{ type: "set_contact", payload: { contact_id } }` to the server. When switching to a different contact, send `set_contact` with the new ID (server replaces, no explicit "unset" needed). When deselecting (no active contact), send `{ type: "set_contact", payload: { contact_id: null } }` so the server stops scoping broadcasts. Stale `set_contact` state causes missed messages or unnecessary broadcasts.

## Routing & Navigation

- **Route:** `app/(dashboard)/chat/page.tsx`
- **Sidebar nav item:** `MessageSquare` icon, `feature: "chat"`, unread count badge
- **URL state:** `?contact=<id>` — shareable links, refresh preserves open conversation
- **Deep link handling:** If `?contact=<id>` is present on load, fetch that contact via `useContact(id)` independently of the paginated contact list
- **Empty states:**
  - No contact selected → "Select a conversation" centered in the conversation area
  - No contacts at all → "No conversations yet" in the contact list
  - Loading → skeleton in contact list, spinner in conversation

## API Endpoints (P1 Subset)

All routed through `apiClient` directly to fs-whatsapp.

| Area | Endpoint | Method | Notes |
|------|----------|--------|-------|
| Contacts | `/api/contacts?search=&channel=&page=&limit=` | GET | Offset-based pagination. Response: `{ contacts, total, page, limit }` |
| Contact | `/api/contacts/:id` | GET | Single contact details (for deep links) |
| Messages | `/api/contacts/:id/messages?before_id=&limit=` | GET | Cursor-based. **Side effect: marks messages as read.** |
| Send text | `/api/contacts/:id/messages` | POST | Body: `{ type: "text", content: { body: string } }` |
| Send media | `/api/messages/media` | POST | FormData: `{ file, contact_id, type, caption? }` |
| Media fetch | `/api/media/:message_id` | GET | Returns blob. Requires auth. |

## Data Types

```typescript
interface Contact {
  id: string
  channel: "whatsapp" | "instagram"
  phone_number: string
  name: string
  profile_name: string
  avatar_url: string
  unread_count: number
  assigned_user_id: string | null
  tags: string[]
  custom_fields: Record<string, any>
  channel_identifier: string       // IGSID for Instagram contacts
  status: string                   // "active"
  last_message_preview: string     // NOT "last_message" ��� actual API field name
  last_message_at: string
}

interface Message {
  id: string
  contact_id: string
  channel: "whatsapp" | "instagram"
  direction: "incoming" | "outgoing"
  message_type: "text" | "image" | "video" | "audio" | "document" | "template" |
                "interactive" | "button_reply" | "location" | "contacts" | "sticker" | "unsupported"
  content: { body: string }        // always wrapped in { body } by the API
  media_url: string | null
  status: "sending" | "sent" | "delivered" | "read" | "failed"
  error_message: string | null     // present when status === "failed"
  wamid: string | null             // WhatsApp message ID
  instagram_mid: string | null     // Instagram message ID
  template_name: string | null
  template_params: any | null
  interactive_data: any | null
  is_reply: boolean
  reply_to_message_id: string | null
  reply_to_message: { id: string; content: string; direction: string } | null
  reactions: any[]
  created_at: string
  updated_at: string
}

// WebSocket events — note backend uses two names for status updates
type WebSocketEvent =
  | { type: "new_message"; payload: Message & { assigned_user_id?: string; profile_name?: string } }
  | { type: "status_update"; payload: { message_id: string; status: string; contact_id?: string; error_message?: string } }
  | { type: "message_status"; payload: { message_id: string; status: string; contact_id: string; wamid?: string } }
  | { type: "ping" }
  | { type: "pong" }
  | { type: "set_contact"; payload: { contact_id: string } }
```

**Note on `new_message` payload:** The WebSocket broadcast payload has some extra fields (`assigned_user_id`, `profile_name`) not in the REST API response. Normalize the payload to match the `Message` interface before inserting into the React Query cache.

## Message Renderers

Each renderer is a pure component: `({ message, channel, blobUrl? }) => JSX`. No side effects, no data fetching (parent provides blob URLs via props).

| Type | Renderer | Notes |
|------|----------|-------|
| `text` | `text-message.tsx` | URL linkification, whitespace preservation |
| `image` | `image-message.tsx` | Thumbnail → full image on click, caption below |
| `video` | `video-message.tsx` | HTML5 video player, poster frame |
| `audio` | `audio-message.tsx` | HTML5 audio player with duration display |
| `document` | `document-message.tsx` | File icon + name + size + download button |
| `template` | `template-message.tsx` | Structured: header (text/image), body, footer, buttons |
| `interactive` | `interactive-message.tsx` | Bot-sent buttons or list. WA and IG handled with small conditionals. |
| `button_reply` | `button-reply-message.tsx` | User's reply text + the button they tapped |
| `location` | `location-message.tsx` | Static map placeholder + "Open in Google Maps" link |
| `contacts` | `contacts-message.tsx` | Name + phone number from vCard |
| `sticker` | `sticker-message.tsx` | Sticker image, WA only |
| `unsupported` | `unsupported-message.tsx` | "This message type is not supported" fallback |

## Error States

| Scenario | UX |
|----------|-----|
| WebSocket disconnected | Yellow banner at top of chat: "Reconnecting..." with spinner |
| Message send failed | Red text below failed message bubble + retry button |
| Media upload failed | Toast error + retry option in upload preview |
| Contacts API error | Error state in contact list with retry button |
| Messages API error | Error state in conversation with retry button |

## Testing

- Unit tests for `useWebSocket`: connect, reconnect, subscribe/unsubscribe, event dispatch, token refresh on reconnect
- Unit tests for `useContacts`: offset pagination, search debounce, cache patching, contact reorder
- Unit tests for `useMessages`: cursor pagination, send (await response), WebSocket append with dedup
- Component tests for `message-bubble.tsx`: renders correct renderer per message type
- Component tests for `contact-list-item.tsx`: unread badge, channel icon, timestamp format
- Integration: send message → appears in list → status updates via WebSocket

## Files Created/Modified

| File | Change |
|------|--------|
| `app/(dashboard)/chat/page.tsx` | **New** — page shell |
| `components/chat/chat-layout.tsx` | **New** — 3-column grid |
| `components/chat/contact-list/*.tsx` | **New** — 4 components |
| `components/chat/conversation/*.tsx` | **New** — 6 components |
| `components/chat/messages/*.tsx` | **New** — 12 renderers |
| `hooks/use-websocket.ts` | **New** — WebSocket hook + context provider |
| `hooks/use-chat.ts` | **New** — chat UI state |
| `hooks/queries/use-contacts.ts` | **New** — contacts query hooks |
| `hooks/queries/use-messages.ts` | **New** — messages query hooks |
| `hooks/queries/query-keys.ts` | **Modify** — add contactKeys, messageKeys |
| `types/chat.ts` | **New** — Contact, Message, WebSocketEvent types |
| `components/app-shell.tsx` | **Modify** — add WebSocketProvider |
| `components/app-sidebar.tsx` | **Modify** — add Chat nav item with unread badge |

## Out of Scope

- Canned responses (P2)
- Emoji picker (P2)
- Reply-to UI (P2 — data field exists, just not the input/display UI)
- Reactions (P2)
- Notification sounds (P2 — needs user preference setting)
- Agent transfers (P3)
- Contact info panel (P3)
- Custom actions (P3)
- Contacts management page (Phase 4.1)
- Typing indicators (P2)
- Sticky date header on scroll (P2 — nice UX polish, not critical)
- Retry failed messages (P2 — error state shows in P1, retry button in P2)
