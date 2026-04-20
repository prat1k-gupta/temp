import { describe, it, expect } from "vitest"
import { buildSystemPrompt } from "../flow-prompts"
import type { GenerateFlowRequest } from "../generate-flow"

function makeEditBroadcastRequest(): GenerateFlowRequest {
  return {
    prompt: "Broadcast this flow to contacts in Delhi",
    platform: "whatsapp",
    existingFlow: { nodes: [], edges: [] },
    toolContext: {
      authHeader: "Bearer whm_test",
      publishedFlowId: "f_test",
      waAccountName: "Test Account",
      userTimezone: "Asia/Kolkata",
      currentTime: "2026-04-20T10:00:00Z",
    },
  }
}

describe("buildSystemPrompt — broadcast template-first rule", () => {
  it("lists every server-side node type to skip when walking", () => {
    const prompt = buildSystemPrompt(makeEditBroadcastRequest(), "", true)

    const skipTypes = [
      "apiFetch",
      "action",
      "transfer",
      "condition",
      "flowComplete",
      "shopify",
      "stripe",
      "zapier",
      "google",
      "salesforce",
      "mailchimp",
      "twilio",
      "slack",
      "airtable",
      "metaAudience",
    ]

    for (const type of skipTypes) {
      expect(prompt, `skip list missing "${type}"`).toContain(type)
    }
  })

  it("describes all three branches: template-first, other-user-facing, no-user-facing", () => {
    const prompt = buildSystemPrompt(makeEditBroadcastRequest(), "", true)

    expect(prompt).toMatch(/templateMessage.*proceed/i)
    expect(prompt).toMatch(/warm.*24-hour/i)
    expect(prompt).toMatch(/no user-facing messages/i)
  })

  it("lists every user-facing node type so the AI knows what to count as a message", () => {
    const prompt = buildSystemPrompt(makeEditBroadcastRequest(), "", true)

    const userFacingTypes = [
      "templateMessage",
      "whatsappMessage",
      "instagramDM",
      "instagramStory",
      "question",
      "quickReply",
      "interactiveList",
      "whatsappFlow",
      "name",
      "email",
      "dob",
      "address",
      "homeDelivery",
      "trackingNotification",
      "event",
      "retailStore",
    ]

    for (const type of userFacingTypes) {
      expect(prompt, `user-facing list missing "${type}"`).toContain(type)
    }
  })

  it("no longer demands templateMessage be immediately after Start", () => {
    const prompt = buildSystemPrompt(makeEditBroadcastRequest(), "", true)

    expect(prompt).not.toMatch(/immediately after Start/i)
    expect(prompt).not.toMatch(
      /Do NOT create a campaign for a flow that starts with a plain .?whatsappMessage/i
    )
  })
})
