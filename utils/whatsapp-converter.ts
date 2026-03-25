import type { Node, Edge } from "@xyflow/react"
import type { WhatsAppInputType } from "@/types"
import { getImplicitInputType, VALIDATION_PRESETS } from "@/utils/validation-presets"

// --- Types matching fs-whatsapp Go models ---

export interface FsWhatsAppFlowStep {
  step_name: string
  step_order: number
  message: string
  message_type: "text" | "buttons" | "conditional_routing" | "api_fetch" | "transfer" | "template" | "action" | "whatsapp_flow"
  input_type: WhatsAppInputType
  buttons?: Array<{ id: string; title: string; type?: string; url?: string }>
  store_as?: string
  validation_regex?: string
  validation_error?: string
  retry_on_invalid?: boolean
  max_retries?: number
  next_step?: string
  synchronous_next?: string
  conditional_next?: Record<string, string>
  conditional_routes?: Array<{
    operator?: string
    value?: string
    target: string
    variable?: string
    default?: boolean
  }>
  api_config?: {
    url: string
    method?: string
    headers?: Record<string, string>
    body?: string
    response_mapping?: Record<string, string>
    fallback_message?: string
  }
  transfer_config?: {
    team_id?: string
    notes?: string
  }
  input_config?: Record<string, unknown>
  skip_condition?: string
}

export interface FsWhatsAppFlow {
  name: string
  description?: string
  whatsapp_account?: string
  trigger_keywords?: string[]
  initial_message?: string
  completion_message?: string
  enabled?: boolean
  panel_config?: Record<string, any>
  flow_slug?: string
  steps: FsWhatsAppFlowStep[]
}

// --- Helpers ---

function sanitizeStepName(label: string, idSuffix: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
  return `${slug || "step"}_${idSuffix}`
}

function getIdSuffix(nodeId: string): string {
  return nodeId.slice(-6)
}

type EdgeMap = Map<string, string> // "sourceId_handleId" → targetId

function buildEdgeMap(edges: Edge[]): EdgeMap {
  const map = new Map<string, string>()
  for (const edge of edges) {
    const handle = edge.sourceHandle || ""
    const key = `${edge.source}_${handle}`
    map.set(key, edge.target)
  }
  return map
}

function resolveNextStep(
  nodeId: string,
  handleId: string,
  edgeMap: EdgeMap,
  nodeStepNames: Map<string, string>
): string {
  const targetId = edgeMap.get(`${nodeId}_${handleId}`)
  if (!targetId) return "__complete__"
  return nodeStepNames.get(targetId) ?? "__complete__"
}

const SKIP_NODE_TYPES = new Set(["start", "comment", "flowTemplate", "flowComplete"])

const WEB_ONLY_TYPES = new Set(["webQuestion", "webQuickReply"])

const OPERATOR_MAP: Record<string, string> = {
  equals: "==",
  notEquals: "!=",
  greaterThan: ">",
  lessThan: "<",
  greaterThanOrEqual: ">=",
  lessThanOrEqual: "<=",
  contains: "contains",
  notContains: "not_contains",
  startsWith: "starts_with",
  endsWith: "ends_with",
  isEmpty: "empty",
  isNotEmpty: "not_empty",
  isTrue: "==",
  isFalse: "==",
  hasTag: "has_tag",
  notHasTag: "not_has_tag",
}

type ConditionalRoute = { operator?: string; value?: string; target: string; variable?: string; default?: boolean }
type ConditionRule = { id?: string; field?: string; operator?: string; value?: string }
type ConditionGroup = {
  id: string
  label: string
  logic: string
  rules: ConditionRule[]
}

function makeRoute(rule: ConditionRule, target: string): ConditionalRoute {
  const goOperator = OPERATOR_MAP[rule.operator || "equals"] || "=="
  let value = rule.value || ""
  if (rule.operator === "isTrue") value = "true"
  if (rule.operator === "isFalse") value = "false"
  return { default: false, operator: goOperator, value, target, variable: rule.field || "" }
}

// --- Forward Conversion: magicflow → fs-whatsapp ---

/**
 * Maps magicflow trigger IDs to fs-whatsapp trigger keywords.
 */
function mapTriggerKeywords(triggerIds?: string[]): string[] | undefined {
  if (!triggerIds || triggerIds.length === 0) return undefined
  const TRIGGER_KEYWORD_MAP: Record<string, string> = {
    "whatsapp-message": "message",
    "whatsapp-ctwa": "ctwa",
    "whatsapp-url": "url",
  }
  const keywords = triggerIds
    .map((id) => TRIGGER_KEYWORD_MAP[id])
    .filter(Boolean)
  return keywords.length > 0 ? keywords : undefined
}

export function convertToFsWhatsApp(
  nodes: Node[],
  edges: Edge[],
  flowName: string,
  flowDescription?: string,
  triggerIds?: string[],
  triggerKeywords?: string[],
  flowSlug?: string,
  whatsappAccount?: string,
): FsWhatsAppFlow {
  const edgeMap = buildEdgeMap(edges)

  // Find start node
  const startNode = nodes.find((n) => n.type === "start")
  if (!startNode) {
    return {
      name: flowName,
      description: flowDescription,
      steps: [],
    }
  }

  // Build node lookup
  const nodeMap = new Map<string, Node>()
  for (const node of nodes) {
    nodeMap.set(node.id, node)
  }

  // DFS from start to determine traversal order
  const visited = new Set<string>()
  const ordered: Node[] = []

  function dfs(nodeId: string) {
    if (visited.has(nodeId)) return
    visited.add(nodeId)

    const node = nodeMap.get(nodeId)
    if (!node) return

    if (!SKIP_NODE_TYPES.has(node.type || "")) {
      ordered.push(node)
    }

    // Find all outgoing edges from this node
    for (const [key, targetId] of edgeMap.entries()) {
      if (key.startsWith(`${nodeId}_`)) {
        dfs(targetId)
      }
    }
  }

  // Start DFS from start node's first target
  const startTarget = edgeMap.get(`${startNode.id}_`)
  if (startTarget) {
    dfs(startTarget)
  }

  // Pre-compute step names for all ordered nodes
  // Use question text first for better identification, then label, then type
  const nodeStepNames = new Map<string, string>()
  for (const node of ordered) {
    const data = node.data as Record<string, any>
    const text = data.question || data.text || data.label || node.type || "step"
    const stepName = sanitizeStepName(text, getIdSuffix(node.id))
    nodeStepNames.set(node.id, stepName)
  }

  // Convert each node to a step
  const steps: FsWhatsAppFlowStep[] = []
  const panelConfig: Record<string, any> = {}

  for (let i = 0; i < ordered.length; i++) {
    const node = ordered[i]
    const data = node.data as Record<string, any>
    const nodeType = node.type || ""

    // Skip web-only nodes in WhatsApp conversion
    if (WEB_ONLY_TYPES.has(nodeType)) {
      console.warn(`Skipping web-only node "${node.id}" (type: ${nodeType}) in WhatsApp conversion`)
      continue
    }

    const stepName = nodeStepNames.get(node.id)!
    const inputType = getImplicitInputType(nodeType)
    const validation = VALIDATION_PRESETS[inputType]

    const step: FsWhatsAppFlowStep = {
      step_name: stepName,
      step_order: i + 1,
      message: data.question || data.text || data.message || "",
      message_type: "text",
      input_type: inputType,
      next_step: "__complete__",
    }

    // Apply storeAs
    if (data.storeAs) {
      step.store_as = data.storeAs
      panelConfig[data.storeAs] = { step: stepName, input_type: inputType }
    }

    // Apply validation: node-level overrides preset defaults
    const nodeValidation = (data.validation || {}) as Record<string, any>
    const mergedRegex = nodeValidation.regex !== undefined ? nodeValidation.regex : validation.regex
    const mergedError = nodeValidation.errorMessage !== undefined ? nodeValidation.errorMessage : validation.errorMessage
    const mergedRetry = nodeValidation.retryOnInvalid ?? validation.retryOnInvalid
    const mergedMaxRetries = nodeValidation.maxRetries ?? validation.maxRetries
    if (mergedRegex) step.validation_regex = mergedRegex
    if (mergedError) step.validation_error = mergedError
    if (mergedRetry !== undefined) step.retry_on_invalid = mergedRetry
    if (mergedMaxRetries !== undefined) step.max_retries = mergedMaxRetries

    // Type-specific conversion
    switch (nodeType) {
      case "whatsappQuestion":
      case "question": {
        step.message_type = "text"
        // Default edge → next_step
        step.next_step = resolveNextStep(node.id, "", edgeMap, nodeStepNames)
        break
      }

      case "whatsappQuickReply":
      case "quickReply": {
        step.message_type = "buttons"
        const buttons = (data.buttons || []) as Array<{ id?: string; text?: string; label?: string }>
        step.buttons = buttons.map((btn, idx) => ({
          id: btn.id || `btn-${idx}`,
          title: btn.text || btn.label || `Button ${idx + 1}`,
        }))

        // Button handle edges → conditional_next (keyed by button ID, as fs-whatsapp expects)
        const conditionalNext: Record<string, string> = {}
        for (const btn of buttons) {
          const btnId = btn.id || `btn-${buttons.indexOf(btn)}`
          const target = resolveNextStep(node.id, btnId, edgeMap, nodeStepNames)
          if (target) {
            conditionalNext[btnId] = target
          }
        }
        if (Object.keys(conditionalNext).length > 0) {
          step.conditional_next = conditionalNext
        }

        // next-step handle → synchronous follow-up (sent before waiting for button input)
        const qrSyncTarget = resolveNextStep(node.id, "next-step", edgeMap, nodeStepNames)
        if (qrSyncTarget !== "__complete__") {
          step.synchronous_next = qrSyncTarget
        }
        break
      }

      case "whatsappInteractiveList":
      case "interactiveList": {
        step.message_type = "buttons"
        const options = (data.options || []) as Array<{ id?: string; text?: string }>
        step.buttons = options.map((opt, idx) => ({
          id: opt.id || `opt-${idx}`,
          title: opt.text || `Option ${idx + 1}`,
        }))

        // Option handle edges → conditional_next (keyed by option ID, as fs-whatsapp expects)
        const conditionalNext: Record<string, string> = {}
        for (const opt of options) {
          const optId = opt.id || `opt-${options.indexOf(opt)}`
          const target = resolveNextStep(node.id, optId, edgeMap, nodeStepNames)
          if (target) {
            conditionalNext[optId] = target
          }
        }
        if (Object.keys(conditionalNext).length > 0) {
          step.conditional_next = conditionalNext
        }

        // next-step handle → synchronous follow-up (sent before waiting for button input)
        const listSyncTarget = resolveNextStep(node.id, "next-step", edgeMap, nodeStepNames)
        if (listSyncTarget !== "__complete__") {
          step.synchronous_next = listSyncTarget
        }
        break
      }

      case "whatsappMessage":
      case "message": {
        step.message_type = "text"
        step.message = data.text || ""
        step.next_step = resolveNextStep(node.id, "", edgeMap, nodeStepNames)
        break
      }

      case "condition": {
        step.message_type = "conditional_routing"
        step.input_type = "none"
        step.message = data.label || "Condition"

        const groups = (data.conditionGroups || []) as ConditionGroup[]
        const conditionalRoutes: ConditionalRoute[] = []
        const elseTarget = resolveNextStep(node.id, "else", edgeMap, nodeStepNames)

        // Synthetic AND-chain steps to append after the main step
        const andChainSteps: FsWhatsAppFlowStep[] = []

        for (const group of groups) {
          const groupTarget = resolveNextStep(node.id, group.id, edgeMap, nodeStepNames)
          if (!groupTarget) continue

          if (!group.rules || group.rules.length === 0) {
            conditionalRoutes.push({ default: false, operator: "not_empty", value: "", target: groupTarget, variable: "_flow_id" })
            continue
          }

          const isAndGroup = (group.logic || "AND") === "AND" && group.rules.length > 1

          if (!isAndGroup) {
            // OR group or single rule → flat routes, all pointing to same target
            for (const rule of group.rules) {
              conditionalRoutes.push(makeRoute(rule, groupTarget))
            }
          } else {
            // AND group with multiple rules → chain of conditional_routing steps
            // Main step checks rule[0] → routes to chain_1
            // chain_1 checks rule[1] → routes to chain_2
            // ...
            // chain_N checks rule[N] → routes to groupTarget
            // All else paths → elseTarget

            const chainBaseName = `${stepName}__and_${group.id}`

            for (let r = 0; r < group.rules.length; r++) {
              const rule = group.rules[r]
              const isLast = r === group.rules.length - 1
              const chainStepName = `${chainBaseName}_${r + 1}`
              const routeTarget = isLast ? groupTarget : `${chainBaseName}_${r + 2}`

              if (r === 0) {
                // First rule lives on the main condition step
                conditionalRoutes.push(makeRoute(rule, routeTarget))
              } else {
                // Subsequent rules become synthetic chained steps
                andChainSteps.push({
                  step_name: chainStepName,
                  step_order: 0, // will be renumbered
                  message: `${data.label || "Condition"} (${group.id} rule ${r + 1})`,
                  message_type: "conditional_routing",
                  input_type: "none",
                  conditional_routes: [
                    makeRoute(rule, routeTarget),
                    { default: true, operator: "", value: "", target: elseTarget, variable: "" }, // catch-all → else
                  ],
                  next_step: elseTarget,
                })
              }
            }
          }
        }

        // Add default route as catch-all → else path (Go checks "default": true)
        conditionalRoutes.push({ default: true, operator: "", value: "", target: elseTarget, variable: "" })

        step.conditional_routes = conditionalRoutes
        step.next_step = elseTarget
        steps.push(step)

        // Append AND-chain steps immediately after
        for (const chainStep of andChainSteps) {
          steps.push(chainStep)
        }
        continue // skip the steps.push(step) at the bottom of the loop
      }

      case "instagramQuestion": {
        step.message_type = "text"
        step.input_type = "text"
        step.next_step = resolveNextStep(node.id, "", edgeMap, nodeStepNames)
        break
      }

      case "instagramQuickReply": {
        step.message_type = "buttons"
        step.input_type = "button"
        const igButtons = (data.buttons || []) as Array<{ id?: string; text?: string; label?: string }>
        step.buttons = igButtons.map((btn, idx) => ({
          id: btn.id || `btn-${idx}`,
          title: btn.text || btn.label || `Button ${idx + 1}`,
        }))

        const igConditionalNext: Record<string, string> = {}
        for (const btn of igButtons) {
          const btnId = btn.id || `btn-${igButtons.indexOf(btn)}`
          const target = resolveNextStep(node.id, btnId, edgeMap, nodeStepNames)
          if (target) {
            igConditionalNext[btnId] = target
          }
        }
        if (Object.keys(igConditionalNext).length > 0) {
          step.conditional_next = igConditionalNext
        }

        // next-step handle → synchronous follow-up (sent before waiting for button input)
        const igSyncTarget = resolveNextStep(node.id, "next-step", edgeMap, nodeStepNames)
        if (igSyncTarget !== "__complete__") {
          step.synchronous_next = igSyncTarget
        }
        break
      }

      case "instagramDM": {
        step.message_type = "text"
        step.input_type = "none"
        step.message = data.text || ""
        step.next_step = resolveNextStep(node.id, "", edgeMap, nodeStepNames)
        break
      }

      case "instagramStory": {
        step.message_type = "text"
        step.input_type = "none"
        step.message = data.text || ""
        step.next_step = resolveNextStep(node.id, "", edgeMap, nodeStepNames)
        break
      }

      case "apiFetch": {
        step.message_type = "api_fetch"
        step.input_type = "none"
        step.api_config = {
          url: data.url || "",
          method: data.method || "GET",
          headers: data.headers || {},
          body: data.body || "",
          response_mapping: data.responseMapping || {},
          fallback_message: data.fallbackMessage || "",
        }

        // Resolve success and error handles for dual routing
        const apiSuccessTarget = resolveNextStep(node.id, "success", edgeMap, nodeStepNames)
        const apiErrorTarget = resolveNextStep(node.id, "error", edgeMap, nodeStepNames)
        // Legacy fallback: old flows with single unnamed handle
        const apiLegacyTarget = resolveNextStep(node.id, "", edgeMap, nodeStepNames)

        const apiConditionalNext: Record<string, string> = {}
        if (apiSuccessTarget && apiSuccessTarget !== "__complete__") {
          apiConditionalNext["success"] = apiSuccessTarget
        }
        if (apiErrorTarget && apiErrorTarget !== "__complete__") {
          apiConditionalNext["error"] = apiErrorTarget
        }
        if (Object.keys(apiConditionalNext).length > 0) {
          step.conditional_next = apiConditionalNext
        }

        // next_step = success target, or legacy fallback for backward compat
        step.next_step = apiSuccessTarget !== "__complete__" ? apiSuccessTarget : apiLegacyTarget
        break
      }

      case "transfer": {
        step.message_type = "transfer"
        step.input_type = "none"
        step.transfer_config = {
          team_id: data.teamId || "_general",
          notes: data.notes || "",
        }
        step.next_step = "__complete__"
        break
      }

      case "action": {
        step.message_type = "action"
        step.input_type = "none"
        step.message = data.label || "Action"
        // Filter out empty and deduplicate variables and tags before publishing
        const seenVarNames = new Set<string>()
        const actionVars = (data.variables || []).filter((v: any) => {
          if (!v?.name?.trim() || !v?.value?.trim()) return false
          if (seenVarNames.has(v.name.trim())) return false
          seenVarNames.add(v.name.trim())
          return true
        })
        const seenTags = new Set<string>()
        const actionTags = (data.tags || []).filter((t: string) => {
          if (!t?.trim()) return false
          if (seenTags.has(t.trim())) return false
          seenTags.add(t.trim())
          return true
        })
        step.input_config = {
          variables: actionVars,
          tag_action: data.tagAction || "add",
          tags: actionTags,
        }
        step.next_step = resolveNextStep(node.id, "", edgeMap, nodeStepNames)
        break
      }

      case "whatsappFlow": {
        step.message_type = "whatsapp_flow"
        step.input_type = "whatsapp_flow"
        step.message = data.bodyText || ""
        step.input_config = {
          whatsapp_flow_id: data.whatsappFlowId || "",
          flow_header: data.headerText || "",
          flow_cta: data.ctaText || "Open Form",
        }
        step.next_step = resolveNextStep(node.id, "", edgeMap, nodeStepNames)
        break
      }

      case "templateMessage": {
        step.message_type = "template"
        // input_type defaults to "button" from getImplicitInputType — flow always
        // waits for user reply (needed to re-open 24h messaging window)
        step.message = data.templateName || ""
        const bodyParams: string[] = (data.parameterMappings || []).map(
          (m: { templateVar: string; flowValue: string }) =>
            // If no explicit mapping, default to {{templateVar}} — resolves from session data
            m.flowValue || `{{${m.templateVar}}}`
        )
        // Store all template buttons (with types) so the processor knows
        // the full button layout for correct Meta API indexing
        const allButtons = (data.buttons || []) as Array<{ id?: string; type: string; text: string; url?: string }>
        step.input_config = {
          template_name: data.templateName || "",
          language: data.language || "en",
          body_parameters: bodyParams,
          template_buttons: allButtons.map((b) => ({
            type: b.type,
            text: b.text,
            ...(b.url ? { url: b.url } : {}),
          })),
        }

        // Include ALL buttons with proper types for preview rendering
        // quick_reply → type: 'reply', url → type: 'url'
        step.buttons = allButtons.map((btn) => ({
          id: btn.text, // Use text as ID so it matches WhatsApp payload
          title: btn.text,
          type: btn.type === "url" ? "url" as const : "reply" as const,
          ...(btn.type === "url" && { url: btn.url || "" }),
        }))

        // Quick reply buttons → conditional_next (flow branches by user response)
        // Template quick reply responses come as type:"button" with payload = button text,
        // so conditional_next must be keyed by button TEXT (not internal ID).
        const qrButtons = allButtons.filter((b) => b.type === "quick_reply")
        if (qrButtons.length > 0) {
          const conditionalNext: Record<string, string> = {}
          for (let qi = 0; qi < qrButtons.length; qi++) {
            const btn = qrButtons[qi]
            const handleId = btn.id || `btn-${qi}`
            const target = resolveNextStep(node.id, handleId, edgeMap, nodeStepNames)
            if (target) {
              // Key by button text — WhatsApp template replies send text as payload
              conditionalNext[btn.text] = target
            }
          }
          if (Object.keys(conditionalNext).length > 0) {
            step.conditional_next = conditionalNext
          }
        }

        // next-step handle → synchronous follow-up (sent before waiting for button input)
        const tplSyncTarget = resolveNextStep(node.id, "next-step", edgeMap, nodeStepNames)
        if (tplSyncTarget !== "__complete__") {
          step.synchronous_next = tplSyncTarget
        }
        break
      }

      default: {
        // Generic fallback
        step.message_type = "text"
        step.next_step = resolveNextStep(node.id, "", edgeMap, nodeStepNames)
        break
      }
    }

    steps.push(step)
  }

  // Renumber step_order (AND-chain steps may have been inserted with order 0)
  for (let s = 0; s < steps.length; s++) {
    steps[s].step_order = s + 1
  }

  // Only use user-defined custom trigger keywords
  // Trigger type (whatsapp-message, whatsapp-ctwa, etc.) determines HOW the flow
  // is activated, not WHAT keywords to match — so we don't map trigger IDs to keywords
  const customKeywords = triggerKeywords && triggerKeywords.length > 0 ? triggerKeywords : undefined

  const flow: FsWhatsAppFlow = {
    name: flowName,
    description: flowDescription,
    whatsapp_account: whatsappAccount || undefined,
    trigger_keywords: customKeywords,
    enabled: true,
    flow_slug: flowSlug || undefined,
    steps,
  }

  if (Object.keys(panelConfig).length > 0) {
    flow.panel_config = panelConfig
  }

  return flow
}

// --- Reverse Conversion: fs-whatsapp → magicflow ---

export function convertFromFsWhatsApp(flow: FsWhatsAppFlow): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = []
  const edges: Edge[] = []

  const VERTICAL_SPACING = 200
  const START_X = 200
  const START_Y = 100

  // Create start node
  const startNodeId = "start-1"
  nodes.push({
    id: startNodeId,
    type: "start",
    position: { x: START_X, y: START_Y },
    data: { platform: "whatsapp" as const, label: "Start" },
  })

  // Build step name → generated node ID map
  const stepNodeMap = new Map<string, string>()

  // Create nodes from steps
  for (let i = 0; i < flow.steps.length; i++) {
    const step = flow.steps[i]
    const nodeId = `node-${i + 1}-${Date.now()}-${i}`
    stepNodeMap.set(step.step_name, nodeId)

    const y = START_Y + (i + 1) * VERTICAL_SPACING
    const position = { x: START_X, y }

    const nodeType = inferNodeType(step)

    const data: Record<string, any> = {
      platform: "whatsapp" as const,
      label: step.step_name.replace(/_[a-z0-9]{6}$/, "").replace(/_/g, " "),
    }

    if (step.store_as) {
      data.storeAs = step.store_as
    }

    // Restore custom validation that differs from presets
    const stepInputType = step.input_type || "none"
    const preset = VALIDATION_PRESETS[stepInputType]
    if (preset) {
      const customValidation: Record<string, any> = {}
      if (step.validation_regex && step.validation_regex !== preset.regex) {
        customValidation.regex = step.validation_regex
      }
      if (step.validation_error && step.validation_error !== preset.errorMessage) {
        customValidation.errorMessage = step.validation_error
      }
      if (step.retry_on_invalid !== undefined && step.retry_on_invalid !== preset.retryOnInvalid) {
        customValidation.retryOnInvalid = step.retry_on_invalid
      }
      if (step.max_retries !== undefined && step.max_retries !== preset.maxRetries) {
        customValidation.maxRetries = step.max_retries
      }
      if (Object.keys(customValidation).length > 0) {
        data.validation = customValidation
      }
    }

    switch (nodeType) {
      case "whatsappQuestion":
        data.question = step.message
        break
      case "whatsappQuickReply":
        data.question = step.message
        data.buttons = (step.buttons || []).map((btn) => ({
          id: btn.id,
          text: btn.title,
          label: btn.title,
          value: btn.title.toLowerCase().replace(/\s+/g, "_"),
        }))
        break
      case "whatsappInteractiveList":
        data.question = step.message
        data.options = (step.buttons || []).map((btn) => ({
          id: btn.id,
          text: btn.title,
        }))
        break
      case "whatsappMessage":
        data.text = step.message
        break
      case "condition":
        data.conditionLogic = "AND"
        data.conditionGroups = (step.conditional_routes || []).map((route, idx) => ({
          id: `group-${idx + 1}`,
          label: `${route.variable || ""} ${route.operator} ${route.value}`,
          logic: "AND",
          rules: [{
            id: `rule-${idx + 1}`,
            field: route.variable || "",
            operator: route.operator,
            value: route.value,
          }],
        }))
        break
      case "apiFetch":
        data.url = step.api_config?.url || ""
        data.method = step.api_config?.method || "GET"
        data.headers = step.api_config?.headers || {}
        data.body = step.api_config?.body || ""
        data.responseMapping = step.api_config?.response_mapping || {}
        data.fallbackMessage = step.api_config?.fallback_message || ""
        break
      case "transfer":
        data.teamId = step.transfer_config?.team_id || "_general"
        data.notes = step.transfer_config?.notes || ""
        data.teamName = step.transfer_config?.team_id === "_general" ? "General Queue" : step.transfer_config?.team_id || ""
        break
      case "action":
        data.variables = step.input_config?.variables || []
        data.tagAction = step.input_config?.tag_action || "add"
        data.tags = step.input_config?.tags || []
        break
      case "whatsappFlow":
        data.whatsappFlowId = step.input_config?.whatsapp_flow_id || ""
        data.headerText = step.input_config?.flow_header || ""
        data.bodyText = step.message || ""
        data.ctaText = step.input_config?.flow_cta || "Open Form"
        break
      case "templateMessage": {
        data.templateName = step.input_config?.template_name || step.message || ""
        data.language = step.input_config?.language || "en"
        data.bodyPreview = step.message || ""

        // Extract named variable names from body content if available
        const tplBody = data.bodyPreview || ""
        const tplNamedVars = (tplBody.match(/\{\{([a-zA-Z_]\w*)\}\}/g) || [])
          .map((m: string) => m.slice(2, -2))
        const tplBodyParams = (step.input_config?.body_parameters as string[]) || []

        if (tplNamedVars.length > 0 && tplNamedVars.length === tplBodyParams.length) {
          // Named template — use variable names from body content
          data.parameterMappings = tplNamedVars.map((name: string, idx: number) => ({
            templateVar: name,
            flowValue: tplBodyParams[idx] || "",
          }))
        } else {
          // Positional template — fallback to index-based (backward compat)
          data.parameterMappings = tplBodyParams.map(
            (val: string, idx: number) => ({ templateVar: String(idx + 1), flowValue: val })
          )
        }
        // Restore buttons from step (assign stable handle IDs for React Flow)
        if (step.buttons && step.buttons.length > 0) {
          data.buttons = step.buttons.map((btn: any, idx: number) => ({
            id: `btn-${idx}`,
            type: btn.type === "url" ? "url" : "quick_reply",
            text: btn.title || btn.text || "",
            ...(btn.type === "url" && { url: btn.url || "" }),
          }))
        }
        break
      }
    }

    nodes.push({ id: nodeId, type: nodeType, position, data })
  }

  // Connect start to first step
  if (flow.steps.length > 0) {
    const firstStepId = stepNodeMap.get(flow.steps[0].step_name)
    if (firstStepId) {
      edges.push({
        id: `edge-start-${firstStepId}`,
        source: startNodeId,
        target: firstStepId,
        style: { stroke: "#6366f1", strokeWidth: 2 },
      })
    }
  }

  // Create edges from step routing
  for (const step of flow.steps) {
    const sourceId = stepNodeMap.get(step.step_name)
    if (!sourceId) continue

    // next_step → default edge (skip __complete__ — it means "end flow")
    // Skip for api_fetch with conditional_next — those use success/error handles instead
    const hasConditionalNext = step.conditional_next && Object.keys(step.conditional_next).length > 0
    if (step.next_step && step.next_step !== "__complete__" && !(step.message_type === "api_fetch" && hasConditionalNext)) {
      const targetId = stepNodeMap.get(step.next_step)
      if (targetId) {
        edges.push({
          id: `edge-${sourceId}-${targetId}`,
          source: sourceId,
          target: targetId,
          style: { stroke: "#6366f1", strokeWidth: 2 },
        })
      }
    }

    // conditional_next → button/option edges (keys are button IDs or button text for templates)
    if (step.conditional_next) {
      const buttons = step.buttons || []
      const nodeData = nodes.find((n) => n.id === sourceId)?.data
      const nodeButtons: Array<{ id: string; text: string }> = (nodeData?.buttons as Array<{ id: string; text: string }>) || []
      for (const [btnKey, targetStepName] of Object.entries(step.conditional_next)) {
        const targetId = stepNodeMap.get(targetStepName)
        if (!targetId) continue
        // For template nodes, conditional_next is keyed by button text;
        // map back to the React Flow handle ID (btn-0, btn-1, etc.)
        const nodeBtn = nodeButtons.find((b) => b.text === btnKey)
        const btn = buttons.find((b) => b.id === btnKey)
        const handleId = nodeBtn?.id || btn?.id || btnKey
        edges.push({
          id: `edge-${sourceId}-${handleId}-${targetId}`,
          source: sourceId,
          sourceHandle: handleId,
          target: targetId,
          style: { stroke: "#6366f1", strokeWidth: 2 },
        })
      }
    }

    // synchronous_next → "next-step" handle edge
    if (step.synchronous_next && step.synchronous_next !== "__complete__") {
      const syncTargetId = stepNodeMap.get(step.synchronous_next)
      if (syncTargetId) {
        edges.push({
          id: `edge-${sourceId}-next-step-${syncTargetId}`,
          source: sourceId,
          sourceHandle: "next-step",
          target: syncTargetId,
          style: { stroke: "#6366f1", strokeWidth: 2 },
        })
      }
    }

    // conditional_routes → condition group edges
    if (step.conditional_routes) {
      step.conditional_routes.forEach((route, idx) => {
        const targetId = stepNodeMap.get(route.target)
        if (!targetId) return
        edges.push({
          id: `edge-${sourceId}-group-${idx + 1}-${targetId}`,
          source: sourceId,
          sourceHandle: `group-${idx + 1}`,
          target: targetId,
          style: { stroke: "#6366f1", strokeWidth: 2 },
        })
      })
    }
  }

  return { nodes, edges }
}

function inferNodeType(step: FsWhatsAppFlowStep): string {
  if (step.message_type === "conditional_routing") return "condition"
  if (step.message_type === "api_fetch") return "apiFetch"
  if (step.message_type === "transfer") return "transfer"
  if (step.message_type === "action") return "action"
  if (step.message_type === "whatsapp_flow") return "whatsappFlow"
  if (step.message_type === "template") return "templateMessage"
  if (step.message_type === "buttons") {
    if (step.input_type === "select") return "whatsappInteractiveList"
    return "whatsappQuickReply"
  }
  if (step.input_type === "none") return "whatsappMessage"
  return "whatsappQuestion"
}
