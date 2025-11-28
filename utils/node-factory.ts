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
      fieldLabel: "Full Name",
      validationRules: {
        minLength: 2,
        maxLength: 50,
        allowNumbers: false,
        required: true
      }
    },
    email: {
      label: "Email",
      fieldLabel: "Email Address",
      validationRules: {
        format: "RFC 5322",
        checkDomain: true,
        blockDisposable: true,
        required: true
      }
    },
    dob: {
      label: "DOB",
      fieldLabel: "Date of Birth",
      validationRules: {
        minAge: 13,
        maxAge: 120,
        format: "DD/MM/YYYY",
        required: true
      }
    },
    address: {
      label: "Address",
      fieldLabel: "Address",
      validationRules: {
        required: true,
        validatePostalCode: true,
        autocomplete: true
      },
      addressComponents: ["Street", "City", "State", "ZIP", "Country"]
    }
  }

  const config = superNodeConfig[nodeType]
  
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
 * Create a fulfillment node
 */
export const createFulfillmentNode = (
  nodeType: "homeDelivery" | "event" | "retailStore",
  platform: Platform,
  position: NodePosition,
  customId?: string
): Node => {
  const nodeId = customId || generateNodeId(nodeType)
  
  const fulfillmentConfig: Record<string, { label: string; description: string }> = {
    homeDelivery: {
      label: "At-home Delivery",
      description: "Schedule a home delivery"
    },
    event: {
      label: "Event",
      description: "Book an event or appointment"
    },
    retailStore: {
      label: "Retail Store",
      description: "Find nearby stores"
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

  // Super nodes
  if (["name", "email", "dob", "address"].includes(nodeType)) {
    node = createSuperNode(nodeType as any, platform, position, customId)
  }
  // Fulfillment nodes
  else if (["homeDelivery", "event", "retailStore"].includes(nodeType)) {
    node = createFulfillmentNode(nodeType as any, platform, position, customId)
  }
  // Integration nodes
  else if (["shopify", "metaAudience", "stripe", "zapier", "google", "salesforce", "mailchimp", "twilio", "slack", "airtable"].includes(nodeType)) {
    node = createIntegrationNode(nodeType as any, platform, position, customId)
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
