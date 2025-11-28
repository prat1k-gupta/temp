import type { Platform } from "@/types"
import type { NodeLimits } from "./types"
import { BUTTON_LIMITS, CHARACTER_LIMITS } from "../platform-limits"

/**
 * Node limits configuration
 * Centralized configuration for all node types and their constraints
 */

/**
 * Get node limits for a specific node type and platform
 */
export function getNodeLimits(nodeType: string, platform: Platform): NodeLimits {
  // Map various node type aliases to base types
  const baseType = getBaseNodeType(nodeType)
  
  switch (baseType) {
    case "question":
      return {
        question: {
          min: 1,
          max: CHARACTER_LIMITS[platform].question,
          placeholder: "Type your question here...",
        },
        maxConnections: 1,
        allowMultipleOutputs: false,
        allowMultipleInputs: true,
      }
      
    case "quickReply":
      return {
        question: {
          min: 1,
          max: CHARACTER_LIMITS[platform].question,
          placeholder: "Type your question here...",
        },
        buttons: {
          min: 1,
          max: BUTTON_LIMITS[platform],
          textMaxLength: CHARACTER_LIMITS[platform].button,
        },
        maxConnections: BUTTON_LIMITS[platform],
        allowMultipleOutputs: true,
        allowMultipleInputs: true,
      }
      
    case "list":
      return {
        question: {
          min: 1,
          max: CHARACTER_LIMITS[platform].question,
          placeholder: "Type your question here...",
        },
        listTitle: {
          max: 60,
        },
        options: {
          min: 1,
          max: 10,
          textMaxLength: CHARACTER_LIMITS[platform].button,
          descriptionMaxLength: 72,
        },
        maxConnections: 10,
        allowMultipleOutputs: true,
        allowMultipleInputs: true,
      }
      
    case "comment":
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
      
    case "start":
      return {
        maxConnections: 1,
        allowMultipleOutputs: false,
        allowMultipleInputs: false,
      }
      
    // Platform-specific message nodes
    case "whatsappMessage":
      return {
        text: {
          min: 1,
          max: 4096, // WhatsApp message limit
          placeholder: "Type your WhatsApp message...",
        },
        maxConnections: 1,
        allowMultipleOutputs: false,
        allowMultipleInputs: true,
      }
      
    case "instagramDM":
      return {
        text: {
          min: 1,
          max: 1000, // Instagram DM limit
          placeholder: "Type your Instagram message...",
        },
        maxConnections: 1,
        allowMultipleOutputs: false,
        allowMultipleInputs: true,
      }
      
    case "instagramStory":
      return {
        text: {
          min: 0,
          max: 500,
          placeholder: "Add story reply prompt...",
        },
        maxConnections: 1,
        allowMultipleOutputs: false,
        allowMultipleInputs: true,
      }
      
    case "webForm":
      return {
        title: {
          min: 1,
          max: 200,
          placeholder: "Form title...",
        },
        maxConnections: 1,
        allowMultipleOutputs: false,
        allowMultipleInputs: true,
      }
      
    default:
      // Default fallback limits
      return {
        text: {
          max: CHARACTER_LIMITS[platform].question,
        },
        maxConnections: 1,
        allowMultipleOutputs: false,
        allowMultipleInputs: true,
      }
  }
}

/**
 * Map various node type names to their base type
 */
function getBaseNodeType(nodeType: string): string {
  // Question nodes
  if (nodeType.includes("Question") || nodeType === "question") {
    return "question"
  }
  
  // Quick reply nodes
  if (nodeType.includes("QuickReply") || nodeType === "quickReply") {
    return "quickReply"
  }
  
  // List nodes
  if (nodeType.includes("List") || nodeType === "whatsappList") {
    return "list"
  }
  
  // Comment nodes
  if (nodeType === "comment") {
    return "comment"
  }
  
  // Start nodes
  if (nodeType === "start") {
    return "start"
  }
  
  // Platform-specific nodes
  if (nodeType === "whatsappMessage") {
    return "whatsappMessage"
  }
  
  if (nodeType === "instagramDM") {
    return "instagramDM"
  }
   
  if (nodeType === "instagramStory") {
    return "instagramStory"
  }
  
  if (nodeType === "webForm") {
    return "webForm"
  }
  
  return nodeType
}

