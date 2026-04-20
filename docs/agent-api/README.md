# Freestand API

Build, manage, and broadcast Freestand chatbot flows from your own code or AI agent. REST CRUD for structured operations, SSE-streamed agent endpoints for natural-language flow creation and editing.

## Quick links

- [REST integration guide](./integration-rest.md) — flows / templates / campaigns / accounts CRUD, with curl walkthrough
- [Agent integration guide](./integration-guide.md) — natural-language flow creation + editing
- [Quickstart](./quickstart.md) — get a flow running in 5 minutes
- [API Reference](./reference.md) — full endpoint reference, request/response shapes, error codes
- [System Prompt](./system-prompt.md) — paste this into your agent's system prompt

## What you can do today

**Natural-language agent endpoints** (SSE streaming, expensive 10/min):

| Endpoint | Method | What it does |
|---|---|---|
| `/api/v1/agent/flows` | POST | Create a flow from a sentence (auto-publishes) |
| `/api/v1/agent/flows/{id}/edit` | POST | Edit a flow from a sentence (saves draft) |

**Structured REST endpoints** (deterministic, cheap):

| Resource | Endpoints |
|---|---|
| Flows | list / get / delete / publish / trigger / variables |
| Templates | full CRUD + submit-for-approval + sync-from-meta |
| Campaigns | full CRUD + preview-audience + start / pause / cancel |
| Accounts | list |

See [integration-rest.md](./integration-rest.md) for the full REST surface with sample curl + responses.

## Prerequisites

1. A Freestand account with a connected WhatsApp Business number
2. An API key — generate at **Settings > API Keys > General > Create Key**
3. Store the `whm_...` key as an environment variable
