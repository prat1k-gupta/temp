# Freestand Flow Assistant — Agent API

Build and manage Freestand chatbot flows from your own AI agent via REST + SSE.

## Quick links

- [Quickstart](./quickstart.md) — get a flow running in 5 minutes
- [API Reference](./reference.md) — endpoints, request/response shapes, error codes
- [System Prompt](./system-prompt.md) — paste this into your agent's system prompt

## What you can do today

| Endpoint | Method | What it does |
|---|---|---|
| `/api/v1/agent/flows` | GET | Find/list your flows |
| `/api/v1/agent/flows` | POST | Create a new flow from natural language (SSE streaming, auto-publishes) |
| `/api/v1/agent/flows/{id}/edit` | POST | Edit an existing flow from natural language (SSE streaming, saves draft) |
| `/api/v1/agent/flows/{id}/publish` | POST | Publish the latest draft to make it live (idempotent) |

## Prerequisites

1. A Freestand account with a connected WhatsApp Business number
2. An API key — generate at **Settings > API Keys > General > Create Key**
3. Store the `whm_...` key as an environment variable
