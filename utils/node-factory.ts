import type { Node } from "@xyflow/react"
import type { Platform, NodeData, ButtonData, OptionData } from "@/types"
import { 
  getPlatformSpecificNodeType, 
  getPlatformSpecificLabel, 
  getPlatformSpecificContent 
} from "./platform-helpers"
import { generateNodeId, createButtonData, createOptionData } from "./node-operations"

interface NodePosition {
  x: number
  y: number
}

/**
 * Create a question node with platform-specific configuration
 */
export const createQuestionNode = (
  platform: Platform, 
  position: NodePosition,
  customId?: string
): Node => {
  const nodeId = customId || generateNodeId("question")
  return {
    id: nodeId,
    type: getPlatformSpecificNodeType("question", platform),
    position,
    data: {
      platform,
      label: getPlatformSpecificLabel("question", platform),
      question: getPlatformSpecificContent("question", platform),
    } as NodeData,
  }
}

/**
 * Create a quick reply node with platform-specific configuration
 */
export const createQuickReplyNode = (
  platform: Platform,
  position: NodePosition,
  customId?: string
): Node => {
  const nodeId = customId || generateNodeId("quickReply")
  return {
    id: nodeId,
    type: getPlatformSpecificNodeType("quickReply", platform),
    position,
    data: {
      platform,
      label: getPlatformSpecificLabel("quickReply", platform),
      question: getPlatformSpecificContent("quickReply", platform),
      buttons: [createButtonData("Action 1")],
    } as NodeData,
  }
}

/**
 * Create a list node with platform-specific configuration
 */
export const createListNode = (
  platform: Platform,
  position: NodePosition,
  customId?: string
): Node => {
  const nodeId = customId || generateNodeId("list")
  return {
    id: nodeId,
    type: getPlatformSpecificNodeType("whatsappList", platform),
    position,
    data: {
      platform,
      label: getPlatformSpecificLabel("whatsappList", platform),
      question: getPlatformSpecificContent("whatsappList", platform),
      options: [createOptionData("Option 1")],
    } as NodeData,
  }
}

/**
 * Create a comment node
 */
export const createCommentNode = (
  platform: Platform,
  position: NodePosition,
  customId?: string,
  onUpdate?: (updates: any) => void,
  onDelete?: () => void
): Node => {
  const nodeId = customId || generateNodeId("comment")
  return {
    id: nodeId,
    type: "comment",
    position,
    data: {
      platform,
      comment: "Add your comment here...",
      createdBy: "You",
      createdAt: new Date().toISOString(),
      onUpdate,
      onDelete,
    } as NodeData,
  }
}

/**
 * Create a super node (Name, Email, DOB, Address)
 */
export const createSuperNode = (
  nodeType: "name" | "email" | "dob" | "address",
  platform: Platform,
  position: NodePosition,
  customId?: string
): Node => {
  const nodeId = customId || generateNodeId(nodeType)
  
  const superNodeConfig: Record<string, any> = {
    name: {
      label: "Name",
      question: "What's your name?",
      validationRules: {
        minLength: 2,
        maxLength: 50,
        allowNumbers: false,
        required: true
      }
    },
    email: {
      label: "Email",
      question: "What's your email address?",
      validationRules: {
        format: "RFC 5322",
        checkDomain: true,
        blockDisposable: true,
        required: true
      }
    },
    dob: {
      label: "DOB",
      question: "What's your date of birth?",
      validationRules: {
        minAge: 13,
        maxAge: 120,
        format: "DD/MM/YYYY",
        required: true
      }
    },
    address: {
      label: "Address",
      question: "Please enter your address",
      validationRules: {
        geography: "pan-india",
        required: true,
        validatePostalCode: true,
        autocomplete: false // Will be set based on platform below
      },
      addressComponents: ["House Number", "Society/Block", "Area", "City"]
    }
  }

  const config = superNodeConfig[nodeType]
  
  // For address nodes, set autocomplete based on platform
  if (nodeType === "address" && config.validationRules) {
    config.validationRules.autocomplete = platform === "web"
  }
  
  return {
    id: nodeId,
    type: nodeType,
    position,
    data: {
      platform,
      ...config,
    } as NodeData,
  }
}

/**
 * Create a fulfillment node with configuration
 */
export const createFulfillmentNode = (
  nodeType: "homeDelivery" | "trackingNotification" | "event" | "retailStore",
  platform: Platform,
  position: NodePosition,
  customId?: string
): Node => {
  const nodeId = customId || generateNodeId(nodeType)
  
  const fulfillmentConfig: Record<string, any> = {
    homeDelivery: {
      label: "At-home Delivery",
      description: "Schedule a home delivery",
      vendor: {
        name: "Optimized Delivery Vendor",
        type: "delivery",
        description: "Highly optimized delivery vendor based on scale",
        features: ["Real-time tracking", "Scale-based optimization", "Fast delivery"]
      },
      configuration: {
        deliveryWindow: "flexible",
        trackingEnabled: true,
        notificationsEnabled: true
      }
    },
    trackingNotification: {
      label: "Tracking Notification",
      message: "Notification of shipment status! 🚚\n\nHi {{name}}, your free {product} is on its way 🎉\n\nExpected delivery: 7-10 days\n\nTracking ID: {tracking}",
      variableMappings: {},
      showFreeSampleNote: true
    },
    event: {
      label: "Event",
      description: "Book event or appointment",
      vendor: {
        name: "Promoter App",
        type: "promoter",
        description: "Promoter app for brand promoters",
        features: ["Event management", "Promoter scheduling", "Real-time updates"]
      },
      configuration: {
        promoterNetwork: "our-network",
        eventTypes: ["in-store", "event"],
        bookingEnabled: true,
        remindersEnabled: true
      }
    },
    retailStore: {
      label: "Retail Store",
      description: "Find nearby stores",
      vendor: {
        name: "Retailer System",
        type: "retailer",
        description: "Retailer system for brand retail stores",
        features: ["Store locator", "Inventory check", "Store hours"]
      },
      configuration: {
        retailerNetwork: "our-network",
        storeLocatorEnabled: true,
        inventoryCheckEnabled: true,
        bookingEnabled: false
      }
    }
  }

  const config = fulfillmentConfig[nodeType]
  
  return {
    id: nodeId,
    type: nodeType,
    position,
    data: {
      platform,
      ...config,
    } as NodeData,
  }
}

/**
 * Create a condition/logic node
 */
export const createConditionNode = (
  platform: Platform,
  position: NodePosition,
  customId?: string
): Node => {
  const nodeId = customId || generateNodeId("condition")
  
  return {
    id: nodeId,
    type: "condition",
    position,
    data: {
      platform,
      label: "Condition",
      conditionLogic: "AND",
      conditionGroups: [
        { id: "group-1", label: "Group 1", logic: "AND", rules: [] }
      ],
    } as NodeData,
  }
}

/**
 * Create an integration node
 */
export const createIntegrationNode = (
  nodeType: "shopify" | "metaAudience" | "stripe" | "zapier" | "google" | "salesforce" | "mailchimp" | "twilio" | "slack" | "airtable",
  platform: Platform,
  position: NodePosition,
  customId?: string
): Node => {
  const nodeId = customId || generateNodeId(nodeType)
  
  const integrationConfig: Record<string, { label: string; description: string }> = {
    shopify: {
      label: "Shopify",
      description: "Connect to Shopify store"
    },
    metaAudience: {
      label: "Meta Audience",
      description: "Sync with Meta audiences"
    },
    stripe: {
      label: "Stripe",
      description: "Process payments"
    },
    zapier: {
      label: "Zapier",
      description: "Connect 5000+ apps"
    },
    google: {
      label: "Google Sheets",
      description: "Sync with Google Sheets"
    },
    salesforce: {
      label: "Salesforce",
      description: "CRM integration"
    },
    mailchimp: {
      label: "Mailchimp",
      description: "Email marketing"
    },
    twilio: {
      label: "Twilio",
      description: "SMS & Voice"
    },
    slack: {
      label: "Slack",
      description: "Team notifications"
    },
    airtable: {
      label: "Airtable",
      description: "Database sync"
    }
  }

  const config = integrationConfig[nodeType]
  
  return {
    id: nodeId,
    type: nodeType,
    position,
    data: {
      platform,
      ...config,
    } as NodeData,
  }
}

/**
 * Create a platform-specific message node (WhatsApp Message, Instagram DM, Instagram Story)
 */
export const createMessageNode = (
  nodeType: "whatsappMessage" | "instagramDM" | "instagramStory",
  platform: Platform,
  position: NodePosition,
  customId?: string
): Node => {
  const nodeId = customId || generateNodeId(nodeType)
  
  const messageConfig: Record<string, { label: string; text: string }> = {
    whatsappMessage: {
      label: "WhatsApp Message",
      text: "Type your WhatsApp message..."
    },
    instagramDM: {
      label: "Instagram DM",
      text: "Type your Instagram message..."
    },
    instagramStory: {
      label: "Instagram Story",
      text: "Add story reply prompt..."
    }
  }

  const config = messageConfig[nodeType]
  
  return {
    id: nodeId,
    type: nodeType,
    position,
    data: {
      platform,
      ...config,
    } as NodeData,
  }
}

/**
 * Factory function to create any node type
 */
export const createNode = (
  nodeType: string,
  platform: Platform,
  position: NodePosition,
  customId?: string,
  additionalData?: Partial<NodeData>
): Node => {
  let node: Node

  // Logic nodes
  if (nodeType === "condition") {
    node = createConditionNode(platform, position, customId)
  }
  // Super nodes
  else if (["name", "email", "dob", "address"].includes(nodeType)) {
    node = createSuperNode(nodeType as any, platform, position, customId)
  }
  // Fulfillment nodes
  else if (["homeDelivery", "trackingNotification", "event", "retailStore"].includes(nodeType)) {
    node = createFulfillmentNode(nodeType as any, platform, position, customId)
  }
  // Integration nodes
  else if (["shopify", "metaAudience", "stripe", "zapier", "google", "salesforce", "mailchimp", "twilio", "slack", "airtable"].includes(nodeType)) {
    node = createIntegrationNode(nodeType as any, platform, position, customId)
  }
  // Platform-specific message nodes
  else if (["whatsappMessage", "instagramDM", "instagramStory"].includes(nodeType)) {
    node = createMessageNode(nodeType as any, platform, position, customId)
  }
  // Regular interaction nodes
  else {
  switch (nodeType) {
    case "question":
      node = createQuestionNode(platform, position, customId)
      break
    case "quickReply":
      node = createQuickReplyNode(platform, position, customId)
      break
    case "whatsappList":
      node = createListNode(platform, position, customId)
      break
    case "comment":
      node = createCommentNode(platform, position, customId)
      break
    default:
      throw new Error(`Unknown node type: ${nodeType}`)
    }
  }

  // Merge additional data if provided
  if (additionalData) {
    node.data = { ...node.data, ...additionalData }
  }

  return node
}
