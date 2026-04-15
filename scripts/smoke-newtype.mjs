#!/usr/bin/env node
/**
 * Smoke test for PR #3 (newType on nodeUpdate + edge topology handling).
 *
 * Usage:
 *   MF_EMAIL=you@example.com MF_PASSWORD=... node scripts/smoke-newtype.mjs
 *
 * Logs in via /api/auth/login, then runs 4 scenarios against
 * /api/ai/flow-assistant. Streams the NDJSON response, applies the final
 * flow_ready updates, and asserts the resulting canvas state matches
 * expectations.
 */

const BASE_URL = process.env.MF_URL || "http://localhost:3002"
const EMAIL = process.env.MF_EMAIL
const PASSWORD = process.env.MF_PASSWORD

if (!EMAIL || !PASSWORD) {
  console.error("Missing MF_EMAIL / MF_PASSWORD env vars.")
  process.exit(1)
}

async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Login failed: HTTP ${res.status} ${text}`)
  }
  const data = await res.json()
  const token = data.accessToken || data.access_token || data.token
  if (!token) {
    throw new Error(`Login response missing accessToken: ${JSON.stringify(data).slice(0, 200)}`)
  }
  return token
}

let TOKEN = ""

// ---------- Helpers ----------

const BASE_TYPE = (t) =>
  (t || "")
    .replace(/^whatsapp/, "")
    .replace(/^instagram/, "")
    .replace(/^web/, "")
    .replace(/^./, (c) => c.toLowerCase())
    .replace(/^interactiveList$/, "list")

const log = {
  title: (s) => console.log(`\n\x1b[1m\x1b[36m${s}\x1b[0m`),
  ok: (s) => console.log(`  \x1b[32m✓\x1b[0m ${s}`),
  fail: (s) => console.log(`  \x1b[31m✗\x1b[0m ${s}`),
  info: (s) => console.log(`  \x1b[90m${s}\x1b[0m`),
}

async function postFlowAssistant(message, existingFlow) {
  const res = await fetch(`${BASE_URL}/api/ai/flow-assistant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `mf_access_token=${TOKEN}`,
    },
    body: JSON.stringify({
      message,
      platform: "whatsapp",
      existingFlow,
      conversationHistory: [],
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`HTTP ${res.status}: ${text}`)
  }

  const events = []
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() || ""
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        events.push(JSON.parse(line))
      } catch {
        /* ignore */
      }
    }
  }
  if (buffer.trim()) {
    try {
      events.push(JSON.parse(buffer))
    } catch {
      /* ignore */
    }
  }
  return events
}

function applyUpdates(existing, updates) {
  if (!updates) return existing

  const byId = new Map(existing.nodes.map((n) => [n.id, n]))
  if (updates.nodes) {
    for (const n of updates.nodes) byId.set(n.id, n)
  }
  if (updates.removeNodeIds) {
    for (const id of updates.removeNodeIds) byId.delete(id)
  }
  const nodes = Array.from(byId.values())

  let edges = [...existing.edges]
  if (updates.removeEdges) {
    edges = edges.filter(
      (e) =>
        !updates.removeEdges.some(
          (r) =>
            r.source === e.source &&
            r.target === e.target &&
            (r.sourceHandle === undefined || r.sourceHandle === e.sourceHandle)
        )
    )
  }
  if (updates.edges) {
    edges = [...edges, ...updates.edges]
  }
  return { nodes, edges }
}

function collectFinalState(existingFlow, events) {
  const flowReady = events.filter((e) => e.type === "flow_ready").pop()
  if (!flowReady) return { final: existingFlow, flowReady: null, committed: false }
  return { final: applyUpdates(existingFlow, flowReady.updates), flowReady, committed: true }
}

function scenarioText(events) {
  return events
    .filter((e) => e.type === "text_delta")
    .map((e) => e.delta)
    .join("")
}

// ---------- Scenarios ----------

const scenarios = [
  {
    name: "1. Same-family preserve: quickReply → interactiveList (3 distinct targets)",
    message:
      "Convert the quick reply node qr1 to an interactive list, keeping all buttons as list options.",
    existingFlow: {
      nodes: [
        { id: "start", type: "start", position: { x: -300, y: 0 }, data: { platform: "whatsapp" } },
        {
          id: "qr1",
          type: "whatsappQuickReply",
          position: { x: 0, y: 0 },
          data: {
            platform: "whatsapp",
            question: "What do you want to do?",
            choices: [
              { id: "c1", text: "Order food" },
              { id: "c2", text: "Track order" },
              { id: "c3", text: "Contact support" },
            ],
          },
        },
        {
          id: "m1",
          type: "whatsappMessage",
          position: { x: 300, y: -100 },
          data: { platform: "whatsapp", text: "Ordering menu..." },
        },
        {
          id: "m2",
          type: "whatsappMessage",
          position: { x: 300, y: 0 },
          data: { platform: "whatsapp", text: "Tracking..." },
        },
        {
          id: "m3",
          type: "whatsappMessage",
          position: { x: 300, y: 100 },
          data: { platform: "whatsapp", text: "Connecting to agent..." },
        },
      ],
      edges: [
        { id: "estart", source: "start", target: "qr1" },
        { id: "e1", source: "qr1", target: "m1", sourceHandle: "c1" },
        { id: "e2", source: "qr1", target: "m2", sourceHandle: "c2" },
        { id: "e3", source: "qr1", target: "m3", sourceHandle: "c3" },
      ],
    },
    assert: ({ final, committed }) => {
      const results = []
      if (!committed) {
        results.push({ ok: false, msg: "no flow_ready event (edit not committed)" })
        return results
      }
      const qr1 = final.nodes.find((n) => n.id === "qr1")
      results.push({ ok: !!qr1, msg: "qr1 still exists (ID preserved)" })
      if (!qr1) return results

      const base = BASE_TYPE(qr1.type)
      results.push({
        ok: base === "list",
        msg: `qr1 is now an interactiveList (got type="${qr1.type}")`,
      })

      const outgoing = final.edges.filter((e) => e.source === "qr1")
      const targets = new Set(outgoing.map((e) => e.target))
      results.push({
        ok: outgoing.length === 3 && targets.has("m1") && targets.has("m2") && targets.has("m3"),
        msg: `3 outgoing edges to {m1,m2,m3} (got ${outgoing.length} edges → {${[...targets].join(",")}})`,
      })
      return results
    },
  },

  {
    name: "2. Fanout expansion: question → quickReply(3 buttons) → single target",
    message:
      "Change the question node q1 into a quick reply with three buttons: Yes, No, Maybe.",
    existingFlow: {
      nodes: [
        { id: "start", type: "start", position: { x: -300, y: 0 }, data: { platform: "whatsapp" } },
        {
          id: "q1",
          type: "whatsappQuestion",
          position: { x: 0, y: 0 },
          data: {
            platform: "whatsapp",
            question: "Do you want to continue?",
            storeAs: "continue",
          },
        },
        {
          id: "m1",
          type: "whatsappMessage",
          position: { x: 300, y: 0 },
          data: { platform: "whatsapp", text: "Thanks for answering!" },
        },
      ],
      edges: [
        { id: "estart", source: "start", target: "q1" },
        { id: "e1", source: "q1", target: "m1" },
      ],
    },
    assert: ({ final, committed }) => {
      const results = []
      if (!committed) {
        results.push({ ok: false, msg: "no flow_ready event (edit not committed)" })
        return results
      }
      const q1 = final.nodes.find((n) => n.id === "q1")
      results.push({ ok: !!q1, msg: "q1 still exists (ID preserved)" })
      if (!q1) return results

      const base = BASE_TYPE(q1.type)
      results.push({
        ok: base === "quickReply",
        msg: `q1 is now a quickReply (got type="${q1.type}")`,
      })

      const choiceCount = Array.isArray(q1.data?.choices) ? q1.data.choices.length : 0
      results.push({ ok: choiceCount === 3, msg: `q1.data.choices has 3 items (got ${choiceCount})` })

      const outgoing = final.edges.filter((e) => e.source === "q1")
      const toM1 = outgoing.filter((e) => e.target === "m1")
      const distinctHandles = new Set(outgoing.map((e) => e.sourceHandle)).size
      results.push({
        ok: toM1.length >= 3 && distinctHandles >= 3,
        msg: `fanout: 3+ edges to m1 with distinct sourceHandles (got ${toM1.length} edges, ${distinctHandles} handles)`,
      })
      return results
    },
  },

  {
    name: "3. Collapse: quickReply(3 same-target) → question",
    message:
      "Change the quick reply node qr1 back to a simple question (no buttons).",
    existingFlow: {
      nodes: [
        { id: "start", type: "start", position: { x: -300, y: 0 }, data: { platform: "whatsapp" } },
        {
          id: "qr1",
          type: "whatsappQuickReply",
          position: { x: 0, y: 0 },
          data: {
            platform: "whatsapp",
            question: "Ready to proceed?",
            choices: [
              { id: "c1", text: "Yes" },
              { id: "c2", text: "No" },
              { id: "c3", text: "Maybe" },
            ],
          },
        },
        {
          id: "m1",
          type: "whatsappMessage",
          position: { x: 300, y: 0 },
          data: { platform: "whatsapp", text: "Moving on..." },
        },
      ],
      edges: [
        { id: "estart", source: "start", target: "qr1" },
        { id: "e1", source: "qr1", target: "m1", sourceHandle: "c1" },
        { id: "e2", source: "qr1", target: "m1", sourceHandle: "c2" },
        { id: "e3", source: "qr1", target: "m1", sourceHandle: "c3" },
      ],
    },
    assert: ({ final, committed }) => {
      const results = []
      if (!committed) {
        results.push({ ok: false, msg: "no flow_ready event (edit not committed)" })
        return results
      }
      const qr1 = final.nodes.find((n) => n.id === "qr1")
      results.push({ ok: !!qr1, msg: "qr1 still exists (ID preserved)" })
      if (!qr1) return results

      const base = BASE_TYPE(qr1.type)
      results.push({
        ok: base === "question",
        msg: `qr1 is now a question (got type="${qr1.type}")`,
      })

      const outgoing = final.edges.filter((e) => e.source === "qr1")
      results.push({
        ok: outgoing.length === 1 && outgoing[0].target === "m1",
        msg: `collapsed to 1 edge → m1 (got ${outgoing.length} edges)`,
      })
      return results
    },
  },

  {
    name: "4. Ambiguous refuse: quickReply(3 different-targets) → apiFetch",
    message:
      "Replace the quick reply qr1 with an API fetch node that calls GET https://api.example.com/users/{{user_id}}.",
    existingFlow: {
      nodes: [
        { id: "start", type: "start", position: { x: -300, y: 0 }, data: { platform: "whatsapp" } },
        {
          id: "qr1",
          type: "whatsappQuickReply",
          position: { x: 0, y: 0 },
          data: {
            platform: "whatsapp",
            question: "Pick a destination",
            choices: [
              { id: "c1", text: "A" },
              { id: "c2", text: "B" },
              { id: "c3", text: "C" },
            ],
          },
        },
        {
          id: "m1",
          type: "whatsappMessage",
          position: { x: 300, y: -100 },
          data: { platform: "whatsapp", text: "Destination A" },
        },
        {
          id: "m2",
          type: "whatsappMessage",
          position: { x: 300, y: 0 },
          data: { platform: "whatsapp", text: "Destination B" },
        },
        {
          id: "m3",
          type: "whatsappMessage",
          position: { x: 300, y: 100 },
          data: { platform: "whatsapp", text: "Destination C" },
        },
      ],
      edges: [
        { id: "estart", source: "start", target: "qr1" },
        { id: "e1", source: "qr1", target: "m1", sourceHandle: "c1" },
        { id: "e2", source: "qr1", target: "m2", sourceHandle: "c2" },
        { id: "e3", source: "qr1", target: "m3", sourceHandle: "c3" },
      ],
    },
    assert: ({ final, committed, events }) => {
      const results = []
      // Success criterion: either AI did NOT commit an edit (asked the user),
      // OR committed but kept qr1 as-is (no mangled state).
      const text = scenarioText(events).toLowerCase()
      const mentionsAmbiguity =
        /(ambigu|which|map|route|where should|clarif|can you)/.test(text)

      if (!committed) {
        results.push({
          ok: true,
          msg: "AI refused / asked user (no flow_ready emitted)",
        })
        results.push({
          ok: mentionsAmbiguity,
          msg: `AI response mentions ambiguity / asks clarification (text: "${text.slice(0, 120).trim()}...")`,
        })
        return results
      }

      const qr1 = final.nodes.find((n) => n.id === "qr1")
      if (!qr1) {
        results.push({ ok: false, msg: "qr1 was deleted — data loss!" })
        return results
      }

      const base = BASE_TYPE(qr1.type)
      // If base changed to apiFetch, that's a fail (the whole point is to refuse)
      if (base === "apiFetch") {
        const outgoing = final.edges.filter((e) => e.source === "qr1")
        results.push({
          ok: false,
          msg: `qr1 was converted to apiFetch — should have refused. Outgoing edges: ${outgoing.length}`,
        })
        return results
      }

      // qr1 unchanged is acceptable (AI chose not to commit type change)
      results.push({
        ok: true,
        msg: `qr1 remained as ${qr1.type} (AI did not perform the ambiguous change)`,
      })
      results.push({
        ok: mentionsAmbiguity,
        msg: `AI response mentions clarification / ambiguity`,
      })
      return results
    },
  },
]

// ---------- Runner ----------

async function run() {
  log.info(`Logging in as ${EMAIL}...`)
  TOKEN = await login()
  log.info(`Got token (${TOKEN.slice(0, 12)}...)`)

  let passCount = 0
  let failCount = 0
  const failed = []

  for (const scenario of scenarios) {
    log.title(scenario.name)
    log.info(`→ "${scenario.message}"`)

    let events
    try {
      events = await postFlowAssistant(scenario.message, scenario.existingFlow)
    } catch (err) {
      log.fail(`request failed: ${err.message}`)
      failCount++
      failed.push(scenario.name)
      continue
    }

    const { final, committed } = collectFinalState(scenario.existingFlow, events)
    const results = scenario.assert({ final, committed, events })

    let allOk = true
    for (const r of results) {
      if (r.ok) log.ok(r.msg)
      else {
        log.fail(r.msg)
        allOk = false
      }
    }

    if (allOk) passCount++
    else {
      failCount++
      failed.push(scenario.name)
      // Dump flow_ready updates + final state + tool steps
      const flowReady = events.filter((e) => e.type === "flow_ready").pop()
      if (flowReady?.updates?.nodes) {
        console.log("\n  \x1b[90m--- flow_ready.updates.nodes ---\x1b[0m")
        for (const n of flowReady.updates.nodes) {
          console.log(`  \x1b[90m  ${n.id}: type=${n.type} data.keys=${Object.keys(n.data || {}).join(",")}\x1b[0m`)
        }
      }
      console.log("\n  \x1b[90m--- computed final state ---\x1b[0m")
      for (const n of final.nodes) {
        console.log(`  \x1b[90m  ${n.id}: type=${n.type}\x1b[0m`)
      }
      console.log("\n  \x1b[90m--- debug trace ---\x1b[0m")
      for (const ev of events) {
        if (ev.type === "tool_step") {
          console.log(
            `  \x1b[90mtool_step\x1b[0m ${ev.tool} [${ev.status}] ${ev.summary || ""}`
          )
          if (ev.details) {
            console.log(`    \x1b[90mdetails: ${JSON.stringify(ev.details).slice(0, 200)}\x1b[0m`)
          }
        } else if (ev.type === "error") {
          console.log(`  \x1b[31merror\x1b[0m ${ev.message}`)
        } else if (ev.type === "flow_ready") {
          console.log(`  \x1b[32mflow_ready\x1b[0m warnings=${JSON.stringify(ev.warnings || [])}`)
        }
      }
      const txt = scenarioText(events).trim()
      if (txt) console.log(`  \x1b[90mtext: "${txt.slice(0, 300)}..."\x1b[0m`)
      console.log("")
    }
  }

  console.log(`\n\x1b[1mResults: ${passCount} passed, ${failCount} failed\x1b[0m`)
  if (failed.length > 0) {
    console.log("\nFailed scenarios:")
    failed.forEach((n) => console.log(`  - ${n}`))
    process.exit(1)
  }
}

run().catch((err) => {
  console.error("Smoke runner crashed:", err)
  process.exit(2)
})
