import type { Node, Edge } from "@xyflow/react"
import type { Platform, NodeData } from "@/types"
import { 
  getPlatformSpecificNodeType, 
  getPlatformSpecificLabel, 
  getPlatformSpecificContent 
} from "./platform-helpers"
import { generateNodeId, createButtonData, createOptionData } from "./node-operations"
import { DEFAULT_TEMPLATES } from "@/constants/default-templates"

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
      storeAs: "",
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
      storeAs: "",
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
    type: getPlatformSpecificNodeType("interactiveList", platform),
    position,
    data: {
      platform,
      label: getPlatformSpecificLabel("interactiveList", platform),
      question: getPlatformSpecificContent("interactiveList", platform),
      options: [createOptionData("Option 1")],
      storeAs: "",
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
 * Create a flow template node from template data.
 * Deep-clones internalNodes and internalEdges from the source template.
 */
export const createFlowTemplateNode = (
  platform: Platform,
  position: NodePosition,
  templateData: {
    sourceTemplateId?: string
    templateName: string
    internalNodes: Node[]
    internalEdges: Edge[]
    description?: string
    aiMetadata?: any
  },
  customId?: string
): Node => {
  const nodeId = customId || generateNodeId("flowTemplate")

  // Deep-clone internal nodes and edges to ensure call-by-value
  const internalNodes = JSON.parse(JSON.stringify(templateData.internalNodes))
  const internalEdges = JSON.parse(JSON.stringify(templateData.internalEdges))

  return {
    id: nodeId,
    type: "flowTemplate",
    position,
    data: {
      platform,
      label: templateData.templateName,
      templateName: templateData.templateName,
      sourceTemplateId: templateData.sourceTemplateId,
      internalNodes,
      internalEdges,
      nodeCount: internalNodes.length,
      ...(templateData.description ? { description: templateData.description } : {}),
      ...(templateData.aiMetadata ? { aiMetadata: templateData.aiMetadata } : {}),
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
 * Create an API Fetch node
 */
export const createApiFetchNode = (
  platform: Platform,
  position: NodePosition,
  customId?: string
): Node => {
  const nodeId = customId || generateNodeId("apiFetch")
  return {
    id: nodeId,
    type: "apiFetch",
    position,
    data: {
      platform,
      label: "API Call",
      url: "",
      method: "GET",
      headers: {},
      body: "",
      responseMapping: {},
      fallbackMessage: "Sorry, there was an error processing your request.",
      message: "",
    } as NodeData,
  }
}

/**
 * Create a Flow Complete node (explicit flow terminator)
 */
export const createFlowCompleteNode = (
  platform: Platform,
  position: NodePosition,
  customId?: string
): Node => {
  const nodeId = customId || generateNodeId("flowComplete")
  return {
    id: nodeId,
    type: "flowComplete",
    position,
    data: {
      platform,
      label: "Complete Flow",
    } as NodeData,
  }
}

/**
 * Create a Transfer node
 */
export const createTransferNode = (
  platform: Platform,
  position: NodePosition,
  customId?: string
): Node => {
  const nodeId = customId || generateNodeId("transfer")
  return {
    id: nodeId,
    type: "transfer",
    position,
    data: {
      platform,
      label: "Transfer to Agent",
      teamId: "_general",
      teamName: "General Queue",
      notes: "",
      message: "",
    } as NodeData,
  }
}

/**
 * Create a Template Message node
 */
export const createTemplateMessageNode = (
  platform: Platform,
  position: NodePosition,
  customId?: string
): Node => {
  const nodeId = customId || generateNodeId("templateMessage")
  return {
    id: nodeId,
    type: "templateMessage",
    position,
    data: {
      platform,
      label: "Template Message",
      templateId: "",
      templateName: "",
      language: "en",
      category: "",
      headerType: "",
      bodyPreview: "",
      parameterMappings: [],
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

  // Action nodes
  if (nodeType === "apiFetch") {
    node = createApiFetchNode(platform, position, customId)
  }
  else if (nodeType === "transfer") {
    node = createTransferNode(platform, position, customId)
  }
  else if (nodeType === "templateMessage") {
    node = createTemplateMessageNode(platform, position, customId)
  }
  // Flow control nodes
  else if (nodeType === "flowComplete") {
    node = createFlowCompleteNode(platform, position, customId)
  }
  // Logic nodes
  else if (nodeType === "condition") {
    node = createConditionNode(platform, position, customId)
  }
  // Flow template node (requires additionalData with template info)
  else if (nodeType === "flowTemplate") {
    node = createFlowTemplateNode(
      platform,
      position,
      {
        sourceTemplateId: (additionalData as any)?.sourceTemplateId,
        templateName: (additionalData as any)?.templateName || "Template",
        internalNodes: (additionalData as any)?.internalNodes || [],
        internalEdges: (additionalData as any)?.internalEdges || [],
        description: (additionalData as any)?.description,
        aiMetadata: (additionalData as any)?.aiMetadata,
      },
      customId
    )
    return node // Return early; additionalData already consumed
  }
  // Template-backed data collection nodes (name, email, dob, address)
  // These are created as flowTemplate nodes using DEFAULT_TEMPLATES
  else if (["name", "email", "dob", "address"].includes(nodeType)) {
    const template = DEFAULT_TEMPLATES.find(t => t.name.toLowerCase() === nodeType)
    if (!template) throw new Error(`No default template found for: ${nodeType}`)
    node = createFlowTemplateNode(
      platform,
      position,
      {
        sourceTemplateId: template.id,
        templateName: template.name,
        internalNodes: template.nodes,
        internalEdges: template.edges,
        description: template.description,
        aiMetadata: template.aiMetadata,
      },
      customId
    )
    return node // Return early; template data already set
  }
  // Fulfillment nodes
  else if (["homeDelivery", "trackingNotification", "event", "retailStore"].includes(nodeType)) {
    node = createFulfillmentNode(nodeType as "homeDelivery" | "trackingNotification" | "event" | "retailStore", platform, position, customId)
  }
  // Integration nodes
  else if (["shopify", "metaAudience", "stripe", "zapier", "google", "salesforce", "mailchimp", "twilio", "slack", "airtable"].includes(nodeType)) {
    node = createIntegrationNode(nodeType as "shopify" | "metaAudience" | "stripe" | "zapier" | "google" | "salesforce" | "mailchimp" | "twilio" | "slack" | "airtable", platform, position, customId)
  }
  // Platform-specific message nodes
  else if (["whatsappMessage", "instagramDM", "instagramStory"].includes(nodeType)) {
    node = createMessageNode(nodeType as "whatsappMessage" | "instagramDM" | "instagramStory", platform, position, customId)
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
    case "interactiveList":
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
