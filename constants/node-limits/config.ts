import type { Platform } from "@/types"
import type { NodeLimits } from "./types"
import { BUTTON_LIMITS, CHARACTER_LIMITS } from "../platform-limits"
import { getBaseNodeType } from "@/utils/platform-helpers"
import { NODE_TEMPLATES } from "../node-categories"
import type { NodeTemplateLimits } from "../node-categories"

/**
 * Get node limits for a specific node type and platform.
 * Resolves from NODE_TEMPLATES.limits when available, with hardcoded
 * fallbacks for start/comment (which are not in NODE_TEMPLATES).
 */
export function getNodeLimits(nodeType: string, platform: Platform): NodeLimits {
  const baseType = getBaseNodeType(nodeType)

  // Special cases not in NODE_TEMPLATES
  if (baseType === "start") {
    return {
      maxConnections: 1,
      allowMultipleOutputs: false,
      allowMultipleInputs: false,
    }
  }
  if (baseType === "comment") {
    return {
      comment: {
        min: 0,
        max: CHARACTER_LIMITS[platform].comment,
        placeholder: "Add your notes here...",
      },
      maxConnections: 0,
      allowMultipleOutputs: false,
      allowMultipleInputs: false,
    }
  }

  // Resolve from template
  const template =
    NODE_TEMPLATES.find(t => t.type === baseType) ||
    // getBaseNodeType maps "interactiveList" → "list"; handle reverse lookup
    (baseType === "list" ? NODE_TEMPLATES.find(t => t.type === "interactiveList") : undefined)

  return resolveTemplateLimits(template?.limits, platform)
}

function resolveTemplateLimits(cfg: NodeTemplateLimits | undefined, platform: Platform): NodeLimits {
  const result: NodeLimits = {
    maxConnections: cfg?.maxConnections ?? 1,
    allowMultipleOutputs: cfg?.multiOutput ?? false,
    allowMultipleInputs: cfg?.allowMultipleInputs ?? true,
  }

  // Text field
  if (cfg?.textMax != null) {
    result.text = { min: cfg.textMin ?? 1, max: cfg.textMax }
  } else if (cfg?.textField === "question") {
    result.question = { min: 1, max: CHARACTER_LIMITS[platform].question, placeholder: "Type your question here..." }
  } else {
    // Default: text field with platform question limit
    result.text = { max: CHARACTER_LIMITS[platform].question }
  }

  // Buttons
  if (cfg?.hasButtons) {
    result.buttons = {
      min: 1,
      max: BUTTON_LIMITS[platform],
      textMaxLength: CHARACTER_LIMITS[platform].button,
    }
    // Auto-set maxConnections to button count unless explicitly overridden
    if (cfg.maxConnections == null) {
      result.maxConnections = BUTTON_LIMITS[platform]
    }
  }

  // Options
  if (cfg?.hasOptions) {
    result.options = {
      min: 1,
      max: 10,
      textMaxLength: CHARACTER_LIMITS[platform].button,
      descriptionMaxLength: 72,
    }
  }

  // List title
  if (cfg?.listTitleMax) {
    result.listTitle = { max: cfg.listTitleMax }
  }

  return result
}
