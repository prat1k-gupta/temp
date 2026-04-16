import { getSimplifiedNodeDocumentation, getNodeSelectionRules, getNodeDependencies, getUserTemplateDocumentation } from "../core/node-documentation"

/**
 * Strip broken Unicode surrogates that cause Anthropic API "no low surrogate" errors.
 * High surrogates (0xD800-0xDBFF) without a following low surrogate (0xDC00-0xDFFF) are removed.
 */
function sanitizeUnicode(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
}
import { buildFlowGraphString } from "./flow-graph-string"
import { collectFlowVariables } from "@/utils/flow-variables"
import type { GenerateFlowRequest } from "./generate-flow"

export function buildSystemPrompt(
  request: GenerateFlowRequest,
  platformGuidelines: string,
  isEdit: boolean
): string {
  const action = isEdit ? "edit" : "create"

  // Both modes are plan-based now — use compact docs
  const nodeDocs = getSimplifiedNodeDocumentation(request.platform)
  const userTemplateDocs = getUserTemplateDocumentation(request.platform, request.userTemplates || [])

  const selectionRules = getNodeSelectionRules(request.platform, request.userTemplates)
  const dependencyRules = getNodeDependencies(request.platform)

  let prompt = `You are an expert conversational flow designer for ${request.platform} platforms.

Your task is to ${action} a conversational flow based on user requirements.

**Platform Guidelines:**
${platformGuidelines}

**${isEdit ? "COMPREHENSIVE NODE DOCUMENTATION" : "AVAILABLE NODE TYPES"}:**
${nodeDocs}${userTemplateDocs}

${selectionRules}
${dependencyRules ? `\n${dependencyRules}` : ""}
${isEdit && request.toolContext?.publishedFlowId ? `\n**Testing:** This flow is published. You can use \`trigger_flow\` to send a test message after making changes. Only offer this if the user asks to test or you have just finished a significant edit.` : ""}
${isEdit && request.toolContext?.authHeader ? `
**Broadcasting:** You can help the user broadcast flows to contacts using campaign tools.${request.toolContext?.publishedFlowId ? ` The current flow's published ID is \`${request.toolContext.publishedFlowId}\`.` : ' **The current flow is NOT published.** If the user wants to broadcast THIS flow, tell them they need to publish it first (via the Publish button). Only published flows can be broadcast. You can still broadcast OTHER published flows — use \`list_flows\` to find them.'}${request.toolContext?.waAccountName ? ` The WhatsApp account is \`${request.toolContext.waAccountName}\`.` : ''} Use these values automatically when creating campaigns for the current flow — do NOT ask the user for flow_id or account_name if you already have them. If you don't have the account name, use \`list_accounts\` to look it up — NEVER ask the user for a flow ID or account name.
- \`list_flows\` — list published flows to find flow IDs. Use when you don't have the current flow's published ID.
- \`list_accounts\` — list WhatsApp accounts to find account names. Use when you don't have the account name.
- \`get_flow_variables\` — get variables used by a flow. Use to understand what data a flow collects before broadcasting.
- \`preview_audience\` — preview how many contacts match a filter. ALWAYS call this before create_campaign. Show the user BOTH the exact filter you applied (in readable form, e.g. "Tag is delhi") AND the matching count so they can verify the right contacts were selected. Note: preview_audience takes filter/search/channel as top-level params; create_campaign wraps them inside audience_config.
- \`create_campaign\` — creates a draft campaign (does NOT send). Always call preview_audience first, then confirm details with the user (name, audience count). Use the current flow ID and account name by default.
- \`start_campaign\` — starts sending. NEVER call this without explicit user confirmation.
- \`get_campaign_status\` — check progress of a campaign (sent/delivered/read/failed counts).
- \`list_campaigns\` — show recent campaigns, optionally filtered by status.
- \`pause_campaign\` — pause a running campaign. Confirm with user first.
- \`cancel_campaign\` — cancel a campaign permanently. Confirm with user first.
The audience_source for create_campaign is "contacts" with a filter/search config. Ask the user who they want to target.` : ""}

**Instructions:**
${isEdit ? getEditInstructions() : getCreateInstructions()}

**${isEdit ? "apply_edit Tool Input Format (examples)" : "Response Format (JSON)"}:**
${isEdit ? getEditResponseFormat() : getCreateResponseFormat()}`

  return sanitizeUnicode(prompt)
}

export function buildUserPrompt(request: GenerateFlowRequest, isEdit: boolean): string {
  let prompt = `User Request: ${request.prompt}
Platform: ${request.platform}`

  // Add flow context if provided
  if (request.flowContext) {
    prompt += `\n\nFlow Context: ${request.flowContext}`
  }

  // Add existing flow information if editing
  if (isEdit && request.existingFlow) {
    const startNode = request.existingFlow.nodes.find(n => n.type === "start")
    if (startNode) {
      prompt += `\n\nStart Node: id="${startNode.id}" (DO NOT create a new start node, connect to this one)`
    }

    // Tree-based flow representation
    const graphTree = buildFlowGraphString(request.existingFlow.nodes, request.existingFlow.edges)
    console.log("[generate-flow] Flow graph sent to AI:\n" + graphTree)
    prompt += `\n\n${graphTree}`

    // Focus area: if user has a node selected, scope edits around it
    if (request.selectedNode) {
      const sn = request.selectedNode
      const snLabel = (sn.data as any)?.label || ""
      prompt += `\n\n**Focus Area:** The user has node [${sn.id}] "${snLabel}" (${sn.type}) selected.`
      prompt += `\nApply your changes relative to this node. Do NOT modify nodes or edges far from this area unless explicitly asked.`
    }

    // Include available variables from existing nodes
    const existingVars = collectFlowVariables(request.existingFlow.nodes)
    if (existingVars.length > 0) {
      prompt += `\n\nAvailable variables (from storeAs fields — use {{variable_name}} to reference in messages):\n${existingVars.map(v => `  - {{${v}}}`).join("\n")}`
    }

    prompt += `\n\nIMPORTANT: Each source node can only have ONE edge per sourceHandle. If you need to change a connection, replace the existing edge.`
  }

  if (!isEdit) {
    prompt += `\n\nOnly include nodes that are directly relevant to the user's request. Do NOT add name, email, address, or other data-collection nodes unless the user asks for them or the flow logically requires them. Use quickReply for choices with branches.`
  }

  // Always include start node info for new flows
  if (!isEdit || !request.existingFlow) {
    prompt += `\n\nThe flow already has a start node — your first step connects to it automatically.`
  }

  // Add conversation history if available
  if (request.conversationHistory && request.conversationHistory.length > 0) {
    prompt += `\n\nConversation History:`
    request.conversationHistory.slice(-5).forEach((msg) => {
      prompt += `\n${msg.role}: ${msg.content}`
    })
  }

  return sanitizeUnicode(prompt)
}

function getCreateInstructions(): string {
  // NOTE: Using array join to avoid esbuild template literal parse issues with { } chars
  return [
    'Output a semantic flow PLAN (not raw nodes/edges). The system will build the actual flow.',
    '',
    '**CRITICAL: Only use nodeType values from the "AVAILABLE NODE TYPES" list. Use BASE type names (e.g. "question", "quickReply"), NOT platform-prefixed names.**',
    '',
    '**Plan Structure:**',
    '- "steps" is an ordered array of NodeStep and BranchStep objects',
    '- NodeStep: \\{ "step": "node", "nodeType": "<base-type>", "content": \\{ ... \\} \\}',
    '- BranchStep: \\{ "step": "branch", "buttonIndex": <n>, "steps": [...] \\}',
    '  - Branches MUST follow a quickReply or interactiveList node',
    '  - buttonIndex 0 = first button, 1 = second, etc.',
    '',
    '**Content fields (all optional — factory provides defaults):**',
    '- question: string — for question, quickReply, interactiveList, super nodes',
    '- choices: string[] — plain labels for quickReply AND interactiveList (e.g. ["Yes", "No"]). ONE field for both node types.',
    '- listTitle: string — for interactiveList',
    '- text: string — for whatsappMessage, instagramDM, instagramStory',
    '- label: string — custom display label (otherwise auto-generated)',
    '- message: string — for trackingNotification',
    '- storeAs: string — variable name to store the user\'s response (e.g. "selected_flavor"). ALWAYS provide this for question, quickReply, and interactiveList nodes so later nodes can reference the answer via {{storeAs_value}}.',
    '',
    '**CRITICAL — quickReply vs interactiveList:**',
    '- **≤3 choices → ALWAYS use quickReply** (with content.choices). NEVER use interactiveList for 3 or fewer options.',
    '- **4+ choices → use interactiveList** (with content.choices and listTitle).',
    '- Both node types use the SAME `content.choices` field — only the rendering style differs. The system auto-converts a quickReply to interactiveList if you push it past 3 choices.',
    '- This rule is absolute and has no exceptions.',
    '',
    '**VARIABLE INTERPOLATION (referencing previous answers):**',
    '- Nodes that collect input (question, quickReply, interactiveList, super nodes) store the user\'s response in a variable.',
    '- ALWAYS set `storeAs` in the content field for question, quickReply, and interactiveList nodes. Use short, descriptive snake_case names (e.g. "selected_flavor", "delivery_slot", "feedback_rating").',
    '- To reference a stored value in later messages/questions, use double curly braces: {{variable_name}}',
    '- **Button/list responses store TWO variables:** {{storeAs}} holds the internal ID, {{storeAs_title}} holds the display text the user chose. ALWAYS use {{storeAs_title}} when showing the user\'s choice in messages.',
    '- Example: A quickReply with storeAs "selected_flavor" → use {{selected_flavor_title}} in messages: "Great choice! We\'ll send you {{selected_flavor_title}} right away."',
    '- For text input nodes (question, super nodes), just use {{storeAs}} directly — there is no _title variant.',
    '- Super nodes have fixed variables: name→user_name, email→user_email, dob→user_dob, address→user_address.',
    '- **System variables** (available in all flows, no node needed): {{system.contact_name}}, {{system.phone_number}}. Use these in API bodies, messages, etc.',
    '- **Global variables** (organization-wide): {{global.variable_name}} — e.g. {{global.api_base_url}}, {{global.support_email}}.',
    '- NEVER use square brackets like [flavor] or [selected_flavor]. ALWAYS use {{variable_name}} with double curly braces.',
    '- Only reference variables from nodes that appear EARLIER in the flow (system/global variables are always available).',
    '',
    '**Key Rules:**',
    '- Only include nodes directly relevant to the user\'s request — do NOT add name, email, dob, or address unless the flow logically needs that data',
    '- **After a quickReply/interactiveList:**',
    '  - If ALL buttons lead to the SAME follow-up: place node steps directly after the quickReply (no branches needed) — every button will connect to the same node.',
    '  - If buttons lead to DIFFERENT paths: create a branch step for EVERY button (one per buttonIndex). **Every button MUST have a branch — buttons without branches become dead ends with no outgoing edge.**',
    '  - If branches converge to shared follow-up steps: place the shared steps AFTER all branch steps — they\'ll be created once and all branches will connect to them.',
    '  - Do NOT duplicate identical nodes inside every branch.',
    '  - **Do NOT nest quickReply/interactiveList inside a branch.** Keep flows flat — a branch should end with a message or simple node, not another quickReply that needs its own branches.',
    '- **apiFetch node** has TWO output handles: "success" and "error". After an apiFetch step, use branch steps with buttonIndex 0 for success path and buttonIndex 1 for error path.',
    '  - Content fields: url, method (GET/POST/PUT/DELETE), headers (object), body (JSON string — can include {{variables}}), responseMapping ({varName: "jsonPath"} e.g. {"user_id": "data.user_id"}), fallbackMessage (shown on error).',
    '  - responseMapping maps API response JSON paths to session variables usable as {{varName}} in later nodes.',
    '- **action node** sets variables and/or manages contact tags silently (no message sent, auto-advances).',
    '  - Content fields: variables (array of {name, value}, max 10), tagAction ("add" or "remove"), tags (string[], max 10).',
    '  - Values and tags support {{variable}} interpolation (e.g. value: "{{first_name}} {{last_name}}").',
    '  - Tags can be checked in condition nodes using has_tag/not_has_tag operators on the _tags field.',
    '- **NEVER use nodeType "flowTemplate" directly.** For data collection, use the specific type: "name", "email", "dob", "address". For user-created templates, use "flowTemplate" with a templateId in content. A bare flowTemplate with no templateId will fail validation.',
    '- Include integrations (metaAudience, shopify, etc.) only when relevant',
    '- Write full sentences for questions, not "Choose:" or "Select:"',
    '- Each branch must have a unique buttonIndex',
    '- Max branches per platform: web=10, whatsapp=3, instagram=3',
    '- Each branch should contain ONLY the steps that are UNIQUE to that button choice.',
  ].join("\n")
}

function getEditInstructions(): string {
  // NOTE: Using array join to avoid esbuild template literal parse issues with { } chars
  return [
    '**You have tools to inspect, edit, and manage the flow.** Follow this workflow:',
    '1. Call `get_node_details` / `get_node_connections` to inspect relevant nodes',
    '2. Call `apply_edit` ONCE with your COMPLETE edit plan — include ALL chains, edges, removals, and updates in a single call',
    '   - If the user asks to save/convert/make the flow into a template, call `save_as_template` instead of apply_edit',
    '3. After apply_edit succeeds, call `validate_result` to check for issues (orphaned nodes, undefined variables, unconnected handles)',
    '4. If validate_result finds issues, call `apply_edit` again with a COMPLETE replacement plan (all original edits + fixes), then `validate_result` again',
    '5. Once validate_result reports no issues (or apply_edit warnings are addressed), respond with your message',
    '6. If issues are too complex to fix, call `undo_last` to revert ALL your edits and start over or explain the problem to the user.',
    '',
    '**CRITICAL RULES:**',
    '- **ONE apply_edit call for your initial edit** — put everything in a single call. Do NOT split across multiple calls.',
    '- **Correction apply_edit must be a COMPLETE REPLACEMENT** — if validate_result finds issues, your next apply_edit must include ALL operations (original edits + corrections). It replaces the previous edit entirely, so include everything.',
    '- **NEVER call apply_edit with an empty plan** — it will return an error.',
    '- **NEVER create disconnected nodes** — every new node MUST connect to the existing flow via chains (with connectTo) or addEdges.',
    '- **`undo_last` reverts ALL edits this turn** — not just the last apply_edit. Use it as a full reset.',
    '- Use BASE type names (e.g. "question", "quickReply"), NOT platform-prefixed names.',
    '',
    '**Flow of a typical edit:** call `apply_edit` with your plan → call `validate_result` to check the edit → if validation passes, the canvas commits automatically; if issues are found, call `apply_edit` again with a corrected plan and re-validate. ALWAYS call `validate_result` after `apply_edit` — the canvas does NOT commit until validation succeeds.',
    '',
    '**apply_edit Plan Structure:**',
    '- **chains**: add new nodes. Each: \\{ "attachTo": "<node-id>", "attachHandle": "<handle-id-or-button-N>", "steps": [...], "connectTo": "<node-id>" \\}. Each step can have an optional `localId` — see "Add a new node that multiple existing nodes should point to" below.',
    '  - attachHandle: for quickReply/list nodes, prefer the positional form `button-N` (0-based). The builder resolves it against the node\'s FINAL button/option array (after your nodeUpdates), so you can chain from a button you just added. Raw handle IDs from get_node_details also work ONLY for unchanged existing buttons — never for newly-added ones.',
    '  - connectTo: link last new node to an existing node. **Pair with removeEdges** to cut the old direct edge.',
    '- **nodeUpdates**: modify existing nodes. Two modes:',
    '  - **Content-only update** (no newType): \\{ "nodeId": "<id>", "content": \\{...\\} \\} — updates the content fields on the existing node, preserves the node type. Use for text/button/choices changes.',
    '  - **Type change** (with newType): \\{ "nodeId": "<id>", "newType": "<type>", "content": \\{...\\} \\} — changes the node\'s type in place. **Node ID, position, and ALL incoming edges are preserved automatically.** The builder replaces the node\'s data with factory defaults for the new type, then overlays your content. Stale fields from the old type are dropped. This is the ONLY correct way to change a node\'s type. **NEVER use removeNodeIds + chain to change a node\'s type** — that generates a new node ID, loses incoming edges, and usually fails because you\'ll try to reference the replacement by a guessed ID.',
    '- **addEdges**: new edges. \\{ "source": "<id>", "target": "<id>", "sourceButtonIndex": <n> \\}',
    '- **removeNodeIds**: delete nodes (also removes all their edges). Only use this for nodes you genuinely want gone — not for type changes.',
    '- **removeEdges**: disconnect specific edges by source+target+sourceHandle',
    '',
    '**When to use what:**',
    '- Update text/choices → nodeUpdates without newType. **NEVER removeNodeIds + chain just to change content — that deletes all existing connections.**',
    '- Add more choices to an existing quickReply → nodeUpdates with FULL choices list (system auto-converts to interactiveList if count > 3)',
    '- **Change node type (e.g. question → quickReply, quickReply ↔ interactiveList, quickReply → message, quickReply → apiFetch) → nodeUpdates with `newType`**. Do NOT use removeNodeIds + chain for type changes.',
    '  - **Before calling apply_edit for a type change on a node with outgoing edges, call `get_node_connections` first.** The builder handles most outgoing-edge cases automatically (same-family changes preserve edges; all-same-target contractions collapse cleanly), but some cases are ambiguous — see next bullet.',
    '  - **Ambiguous type changes (ASK THE USER FIRST):** if the old node has multiple outgoing edges that point to DIFFERENT targets AND you\'re changing to a type with fewer or different handles (e.g. quickReply with 3 different button targets → apiFetch with success/error), the builder will REFUSE the nodeUpdate with an `ambiguous_type_change` error. Do NOT guess the mapping. Instead, respond in chat and ask the user which old targets should map to which new handles (or which should be dropped), then retry apply_edit with the correct addEdges/removeEdges in the same plan.',
    '- **Add a new node that multiple existing nodes should point to (fan-in to a NEW node):** assign a `localId` on the chain\'s step, then reference it in `addEdges` as `localId:<name>` for the `source` or `target`. Example: create a confirmation message from one chain, then wire two other existing quickReplies\' buttons to that confirmation via addEdges with `target: "localId:confirm"`. The builder resolves localIds to the real generated node ID at apply time. localId is only valid within a SINGLE apply_edit plan — you cannot reference it across tool calls.',
    '- Insert node between A→C → removeEdges A→C + chain with connectTo',
    '- Rewire buttons to existing node → removeEdges + addEdges (no chains needed)',
    '',
    '**Content fields:** question, choices[], listTitle, text, label, message, storeAs, variables[{name,value}], tags[], tagAction',
    '- storeAs: ALWAYS set for question/quickReply/interactiveList. Use snake_case (e.g. "delivery_slot").',
    '',
    '**Variables:** Use {{var_name}} for text inputs, {{var_name_title}} for button/list selections. Super nodes: {{user_name}}, {{user_email}}, {{user_dob}}, {{user_address}}. System: {{system.contact_name}}, {{system.phone_number}}. Global: {{global.variable_name}}.',
    '',
    '**list_variables tool:** Variables from the current flow are already listed in the prompt above. Only call `list_variables` after `apply_edit` if you need to check what new variables are available from nodes you just created.',
    '',
    '**apiFetch node:** Has dual output handles "success" and "error". Use attachHandle "success" or "error" when chaining from an apiFetch node. Content: url, method, headers, body (JSON string with {{variables}}), responseMapping ({varName: "jsonPath"}), fallbackMessage.',
    '',
    '**action node:** Sets variables and/or manages contact tags silently (no message, auto-advances). Content: variables ([{name, value}], max 10), tagAction ("add"|"remove"), tags (string[], max 10). Values/tags support {{variable}} interpolation. Tags can be checked via has_tag/not_has_tag on _tags in condition nodes.',
    '',
    '**Rules:**',
    '- ≤3 choices → quickReply. 4+ choices → interactiveList.',
    '- Minimum changes only. Do NOT touch unrelated nodes/edges.',
    '- Write full sentences for questions.',
    '- Max branches: web=10, whatsapp=3, instagram=3.',
    '- Use addEdges with sourceButtonIndex to connect new quickReply/list buttons to existing nodes (no chain needed).',
    '- **CRITICAL — button/option edge handles:** For edges whose source is a quickReply/interactiveList node, ALWAYS use `sourceButtonIndex` (0-based). NEVER put a raw handle ID like `choice-1776...` into `sourceHandle`. Handle IDs returned by `get_node_details` are for YOUR INSPECTION ONLY — do not copy them into addEdges/removeEdges/chain attachHandle. The builder resolves `sourceButtonIndex` against the node\'s FINAL choices array (after your nodeUpdates apply), so newly-added choices work too.',
    '- Use `content.choices` (string[]) for both whatsappQuickReply and whatsappInteractiveList nodes. The system unifies the field — you do NOT need to choose between `buttons` and `options`. If a quickReply has more than 3 choices, it auto-converts to interactiveList.',
    '- **NEVER use nodeType "flowTemplate" directly in chains.** For data collection, use "name", "email", "dob", "address". These resolve to templates automatically.',
  ].join("\n")
}

function getCreateResponseFormat(): string {
  // NOTE: Using JSON.stringify + join to avoid esbuild template literal parse issues
  const example = JSON.stringify({
    message: "Created a sample delivery flow with feedback collection",
    steps: [
      { step: "node", nodeType: "quickReply", content: { question: "Choose a delivery slot for your sample.", choices: ["Morning", "Afternoon", "Evening"], storeAs: "delivery_slot" } },
      { step: "branch", buttonIndex: 0, steps: [{ step: "node", nodeType: "whatsappMessage", content: { text: "Morning slot confirmed!" } }] },
      { step: "branch", buttonIndex: 1, steps: [{ step: "node", nodeType: "whatsappMessage", content: { text: "Afternoon slot confirmed!" } }] },
      { step: "branch", buttonIndex: 2, steps: [{ step: "node", nodeType: "whatsappMessage", content: { text: "Evening slot confirmed!" } }] },
      { step: "node", nodeType: "address" },
      { step: "node", nodeType: "homeDelivery" },
      { step: "node", nodeType: "question", content: { question: "How was your experience with the sample?", storeAs: "experience_rating" } },
      { step: "node", nodeType: "whatsappMessage", content: { text: "Thanks for sharing! Your {{delivery_slot_title}} delivery is on its way." } },
      { step: "node", nodeType: "metaAudience" },
    ],
  }, null, 2)

  return example + "\n\n" + [
    "**IMPORTANT:**",
    '- Use BASE node type names (question, quickReply, name, etc.) — NOT platform-prefixed',
    '- Only include information nodes (name, email, dob, address) when the flow needs that data — do NOT add them by default',
    "- Steps AFTER all branch steps become shared convergence nodes — all branches connect to them. Do NOT duplicate identical follow-up nodes inside every branch.",
    "- If ALL buttons lead to the same path, skip branches entirely and place steps directly after the quickReply.",
    "- **If using branches: create one branch for EVERY button.** A quickReply with 3 buttons needs exactly 3 branch steps (buttonIndex 0, 1, 2). Missing branches = disconnected buttons.",
    "- **Never nest a quickReply/interactiveList inside a branch.** Branches should end with simple nodes (message, question, etc.), not multi-button nodes that need their own sub-branches.",
    "- Add integrations only when relevant (metaAudience for WhatsApp/Instagram)",
    "- Write full, natural questions",
    "- Branches follow the last quickReply/interactiveList in the current scope",
  ].join("\n")
}

function getEditResponseFormat(): string {
  // NOTE: Using JSON.stringify to avoid esbuild template literal parse issues
  // 3 key examples covering the most common edit patterns
  const ex1 = JSON.stringify({
    message: "Inserted email collection before the feedback question",
    removeEdges: [{ source: "1", target: "plan-quickReply-1" }],
    chains: [{ attachTo: "1", steps: [{ step: "node", nodeType: "email" }], connectTo: "plan-quickReply-1" }],
  }, null, 2)

  const ex2 = JSON.stringify({
    message: "Added an 'Other' option to the feedback quickReply and a follow-up question for it",
    nodeUpdates: [{
      nodeId: "plan-quickReply-2",
      content: {
        // Full choices array — existing 3 + new 4th. No handle IDs; the builder
        // preserves IDs for existing text matches and assigns fresh IDs for new
        // entries. System auto-converts to interactiveList when count > 3.
        choices: ["Great", "Good", "Okay", "Other"],
      },
    }],
    chains: [{
      attachTo: "plan-quickReply-2",
      // positional — resolves against the FINAL choices array (post-update),
      // so "button-3" points at the NEW 4th entry "Other".
      attachHandle: "button-3",
      steps: [{
        step: "node",
        nodeType: "question",
        content: { question: "What would you like to share?", storeAs: "other_feedback" },
      }],
    }],
  }, null, 2)

  const ex3 = JSON.stringify({
    message: "Replaced the message node with a question and merged branches",
    removeNodeIds: ["plan-whatsappMessage-3"],
    removeEdges: [{ source: "plan-quickReply-1", target: "plan-question-4" }],
    chains: [{
      attachTo: "plan-quickReply-2", attachHandle: "button-1",
      steps: [{ step: "node", nodeType: "question", content: { question: "What could be better?", storeAs: "feedback" } }],
      connectTo: "plan-metaAudience-4",
    }],
    addEdges: [{ source: "plan-quickReply-1", target: "plan-question-2", sourceButtonIndex: 2 }],
  }, null, 2)

  return [
    "Example 1 — Insert node between two existing nodes:",
    ex1,
    "",
    "Example 2 — Add a NEW button to an existing quickReply and chain a follow-up from it (use attachHandle: \"button-N\" where N is the new button's index in the UPDATED array):",
    ex2,
    "",
    "Example 3 — Replace node + rewire edges + merge branches:",
    ex3,
    "",
    "**Key rules:**",
    '- Use get_node_details and get_node_connections FIRST to get exact handle IDs and edges',
    '- "connectTo" + "removeEdges" go together — cut old edge, then insert via chain',
    '- "removeNodeIds" also removes all edges connected to those nodes',
    '- "addEdges" uses sourceButtonIndex (0-based) for button connections',
  ].join("\n")
}
