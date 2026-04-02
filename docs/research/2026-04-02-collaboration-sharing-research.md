# Collaboration, Sharing & Locking — Research

Research conducted 2026-04-02 across open-source projects and libraries for adding sharing, commenting, node locking, and real-time collaboration to MagicFlow (ReactFlow-based flow builder).

---

## ReactFlow View-Only Mode

No single `readOnly` prop exists. Compose ~10 props:

```tsx
const READ_ONLY_PROPS = {
  nodesDraggable: false,
  nodesConnectable: false,
  elementsSelectable: false,
  connectOnClick: false,
  deleteKeyCode: null,
  selectionKeyCode: null,
  multiSelectionKeyCode: null,
  edgesReconnectable: false,
  nodesFocusable: false,
  edgesFocusable: false,
}
```

Pan/zoom still works. ReactFlow maintainers explicitly decided against a meta-prop ([Discussion #3254](https://github.com/xyflow/xyflow/discussions/3254)).

---

## ReactFlow Pro

Paid subscription ($139-999/mo). Only provides code examples + priority support. No hosted features.

- **Pro Examples**: collaborative editing (Yjs), auto-layout, copy/paste, helper lines
- **No built-in** commenting, sharing, or collaboration features
- The collaboration example uses Yjs + y-websocket — a starting point, not turnkey

---

## Open-Source Projects Using ReactFlow

### Langflow (best sharing model)
- `is_public` boolean on flow, separate `/public_flow/{id}` route
- No auth needed for public flows — clean and simple
- Templates stored as JSON with metadata

### Flowise
- Public by default, API key gating to restrict
- Embed widget for chatflows

### n8n
- No public sharing (only JSON export/import)
- Sticky Notes for canvas annotations (Markdown, not threaded comments)
- 9000+ community template gallery — the end goal for templates

### Activepieces / Windmill / BuildShip
- Various template/sharing patterns, none with real-time collaboration
- Windmill: draft/deploy model (no explicit editor locking)

---

## Excalidraw — Deep Dive

The gold standard for open-source collaboration.

### Sharing (E2E Encrypted)
- Encryption key in URL hash (`#key=...`) — browsers never send hash to server
- AES-GCM 128-bit via Web Crypto API
- Server stores encrypted blobs, never sees the key
- Static shares = snapshots, live collaboration = real-time
- View-only for live sessions is **paid only** (Excalidraw+)

### Collaboration Architecture
- **Socket.IO** over WebSocket (not CRDT, not Yjs)
- **Dumb relay server** (~140 lines) — receives encrypted messages, broadcasts to room. Zero server-side intelligence.
- **Custom conflict resolution** using `version` + `versionNonce`:
  - Higher `version` wins
  - If versions tie, lower `versionNonce` wins (deterministic tiebreaker)
  - Simpler than CRDT, trades off concurrent edit merging for simplicity
- Tombstoning for deletes (prevents ghost resurrection on sync)
- Volatile messages for cursors (lossy OK), reliable for element changes

### Element Locking
- `locked: boolean` on every element
- Blocks: selection, dragging, resizing, deletion, eraser
- **Cmd+click overrides** to select locked elements
- Context menu only (no toolbar — prevents accidental locking)
- Lock/unlock in undo/redo history
- Group behavior: locked elements excluded from group selection

### Self-Hosting
- Frontend: Docker image (static React app)
- Collaboration server: `excalidraw-room` (~140 LOC, Socket.IO + Express)
- HTTPS mandatory (Web Crypto API requires secure context)
- Collab server URL hardcoded at build time — must rebuild to change

---

## tldraw-sync-cloudflare — Deep Dive

Elegant server-authoritative sync using Cloudflare Durable Objects.

### Architecture
- Client → WebSocket → Cloudflare Worker → Durable Object (one per room)
- DO holds authoritative in-memory state, broadcasts changes
- Persistence: SQLite (DO storage) for room data, R2 for binary assets
- DO hibernates when empty (no cost while idle)
- ~4 files, ~150 lines total for the backend

### Sync Protocol
- **Not CRDT** — server-authoritative optimistic concurrency
- Client applies locally (optimistic), sends to server, server validates + broadcasts
- Last-write-wins at record level
- Per-user mutation numbers for ordering
- Full state snapshot on reconnect

### Read-Only Mode
- Server-enforced `readonly: true` per socket connection
- Server rejects writes from read-only clients

### Applicability to ReactFlow
- `@tldraw/sync-core` is **tightly coupled to tldraw's data model** — cannot reuse for ReactFlow
- The **pattern** is reusable: room-based, single instance per room, WebSocket broadcast, server validates
- For ReactFlow, **Yjs is the proven community approach** (official docs + examples exist)

### Self-Hosting Without Cloudflare
- Node.js + better-sqlite3 works (community example exists)
- Go + PostgreSQL + Redis pub/sub would also work for the pattern
- The hard part: guaranteeing single room instance (Redis locks or sticky sessions)

### Cost (Cloudflare)
- $5/month base, free tier covers a small team easily
- DO hibernation = no cost while idle

---

## Commenting Solutions

| Solution | Type | Features | Cost |
|----------|------|----------|------|
| n8n Sticky Notes | Canvas annotation | Markdown notes on canvas, not threaded | Free (OSS) |
| Liveblocks Comments | Managed service | Threaded, mentions, reactions, resolution, pins | $99+/mo |
| SuperViz HTMLPin | Managed SDK | Pin comments to DOM elements | Free tier |
| Velt SDK | Commercial SDK | Comments on nodes/edges directly | Commercial |
| Custom build | DIY | Whatever we want | Free |

No open-source project has proper node-level threaded comments.

---

## Collaboration Libraries Comparison

| Solution | Type | Conflict Resolution | Offline | Cost |
|----------|------|-------------------|---------|------|
| **Yjs** | CRDT library | Automatic merge | Yes | Free (OSS) |
| **Excalidraw pattern** | Custom version+nonce | Last writer wins (deterministic) | No | Free (OSS) |
| **tldraw-sync** | Server-authoritative | Last writer wins (server decides) | No | Free (OSS) |
| **Liveblocks** | Managed CRDT | Automatic merge | Partial | $99+/mo |
| **SuperViz** | Managed pub/sub | No merge (echo filter) | No | Free tier |

---

## Recommended Implementation Order for Freestand

### Phase 1: View-Only + Node Locking (zero dependencies)
- `READ_ONLY_PROPS` spread on ReactFlow for view-only mode
- `locked: boolean` on node data, filter `onNodesChange`, context menu toggle
- Effort: ~1 day

### Phase 2: Public Sharing (Langflow model)
- `is_public` / `share_token` column on `magic_flow_projects`
- Public route `/public/flow/{id}?token={token}` renders read-only ReactFlow
- Share button in header generates/copies link
- Effort: ~2 days

### Phase 3: Pessimistic Flow Locking
- `flow_locks(flow_id, user_id, locked_at, heartbeat_at)` table
- Lock on edit mode enter, show "Editing by {name}" to others
- Auto-expire after 2min no heartbeat
- Effort: ~1 day

### Phase 4: Node-Level Comments
- `node_comments` table + comment indicators on nodes
- Comment panel sidebar
- Effort: ~3-5 days

### Phase 5: Real-Time Collaboration (when needed)
- **Option A: Yjs** — proven for ReactFlow, CRDT, handles conflicts automatically
  - `y-websocket` server (Node.js sidecar) or hosted provider
  - Two `Y.Map` instances (nodes, edges)
  - Yjs Awareness for cursors/presence
  - Effort: ~1-2 weeks

- **Option B: Custom Go WebSocket** (Excalidraw/tldraw pattern)
  - Room-based WebSocket hub in Go
  - version+nonce conflict resolution
  - Redis pub/sub for multi-instance
  - Effort: ~2-3 weeks

- **Option C: Liveblocks** — managed, ReactFlow integration exists
  - Simplest setup, vendor dependency
  - $99+/mo

---

## Sources

- [ReactFlow Interaction Props](https://reactflow.dev/examples/interaction/interaction-props)
- [ReactFlow Multiplayer Guide](https://reactflow.dev/learn/advanced-use/multiplayer)
- [ReactFlow isReadOnly Discussion](https://github.com/xyflow/xyflow/discussions/3254)
- [ReactFlow Pro](https://reactflow.dev/pro)
- [Excalidraw E2E Encryption Blog](https://plus.excalidraw.com/blog/end-to-end-encryption)
- [Excalidraw P2P Collaboration Blog](https://plus.excalidraw.com/blog/building-excalidraw-p2p-collaboration-feature)
- [Excalidraw Element Locking PR #4964](https://github.com/excalidraw/excalidraw/pull/4964)
- [excalidraw-room (~140 LOC relay)](https://github.com/excalidraw/excalidraw-room)
- [tldraw-sync-cloudflare](https://github.com/tldraw/tldraw-sync-cloudflare)
- [tldraw sync docs](https://tldraw.dev/docs/sync)
- [tldraw locked shapes](https://tldraw.dev/sdk-features/locked-shapes)
- [Synergy Codes: ReactFlow + Yjs ebook](https://www.synergycodes.com/blog/real-time-collaboration-for-multiple-users-in-react-flow-projects-with-yjs-e-book)
- [Langflow Share docs](https://docs.langflow.org/concepts-publish)
- [n8n Sticky Notes](https://docs.n8n.io/workflows/components/sticky-notes/)
- [n8n Templates Gallery](https://n8n.io/workflows/)
- [Liveblocks Comments](https://liveblocks.io/comments)
- [Liveblocks Collaborative Flowchart](https://liveblocks.io/examples/collaborative-flowchart/zustand-flowchart)
- [SuperViz React Flow](https://www.superviz.com/react-flow)
- [Windmill Draft and Deploy](https://www.windmill.dev/docs/core_concepts/draft_and_deploy)
