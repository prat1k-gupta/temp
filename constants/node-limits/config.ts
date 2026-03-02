import type { Platform } from "@/types"
import type { NodeLimits } from "./types"
import { BUTTON_LIMITS, CHARACTER_LIMITS } from "../platform-limits"
import { getBaseNodeType } from "@/utils/platform-helpers"

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
      
    case "trackingNotification":
      return {
        text: {
          min: 1,
          max: CHARACTER_LIMITS[platform].question || 500,
          placeholder: "Enter tracking notification message...",
        },
        maxConnections: 1,
        allowMultipleOutputs: false,
        allowMultipleInputs: true,
      }
      
    default:
      // Intentional fallback: super nodes, fulfillment nodes, and integration nodes
      // all use these generic limits since they don't have special constraints.
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


