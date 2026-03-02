/**
 * Node Documentation Repository
 * Comprehensive documentation of all node types, their configurations, properties, and usage
 * This is used as context for all AI tools to generate accurate and appropriate content
 */

import type { Platform } from "@/types"
import { getNodeLimits } from "@/constants"
import { CHARACTER_LIMITS, BUTTON_LIMITS } from "@/constants/platform-limits"

export interface NodeDocumentation {
  type: string
  category: "interaction" | "information" | "fulfillment" | "integration" | "logic"
  platforms: Platform[]
  description: string
  isSuperNode?: boolean
  properties: {
    required: string[]
    optional: string[]
    validation?: Record<string, any>
  }
  limits: {
    text?: { min?: number; max: number }
    buttons?: { min: number; max: number; textMaxLength: number }
    options?: { min: number; max: number; textMaxLength: number; descriptionMaxLength?: number }
    maxConnections?: number
    allowMultipleOutputs?: boolean
  }
  usage: {
    whenToUse: string
    bestPractices: string[]
    examples: string[]
  }
  dataStructure: Record<string, any>
}

/**
 * Get comprehensive documentation for all nodes
 */
export function getAllNodeDocumentation(platform?: Platform): NodeDocumentation[] {
  const allDocs: NodeDocumentation[] = []

  // INTERACTION NODES
  allDocs.push(...getInteractionNodeDocs(platform))
  
  // INFORMATION NODES (Super Nodes)
  allDocs.push(...getInformationNodeDocs(platform))
  
  // LOGIC NODES
  allDocs.push(...getLogicNodeDocs(platform))
  
  // FULFILLMENT NODES
  allDocs.push(...getFulfillmentNodeDocs(platform))
  
  // INTEGRATION NODES
  allDocs.push(...getIntegrationNodeDocs(platform))

  return platform 
    ? allDocs.filter(doc => doc.platforms.includes(platform))
    : allDocs
}

/**
 * Get documentation for a specific node type
 */
export function getNodeDocumentation(nodeType: string, platform: Platform): NodeDocumentation | null {
  const allDocs = getAllNodeDocumentation(platform)
  return allDocs.find(doc => doc.type === nodeType) || null
}

/**
 * Get formatted documentation string for AI prompts
 */
export function getNodeDocumentationString(platform?: Platform, nodeTypes?: string[]): string {
  const docs = nodeTypes
    ? nodeTypes.map(type => {
        const platformDocs = getAllNodeDocumentation(platform)
        return platformDocs.find(d => d.type === type)
      }).filter(Boolean) as NodeDocumentation[]
    : getAllNodeDocumentation(platform)

  return docs.map(doc => formatNodeDoc(doc)).join("\n\n")
}

function formatNodeDoc(doc: NodeDocumentation): string {
  const platformList = doc.platforms.join(", ")
  const superNodeBadge = doc.isSuperNode ? " [SUPER NODE - Built-in Validation]" : ""
  
  let output = `**${doc.type.toUpperCase()}** (${doc.category})${superNodeBadge}
Platforms: ${platformList}
Description: ${doc.description}

Properties:
- Required: ${doc.properties.required.join(", ") || "None"}
- Optional: ${doc.properties.optional.join(", ") || "None"}

Limits:
${formatLimits(doc.limits)}

Usage:
- When to use: ${doc.usage.whenToUse}
- Best practices:
${doc.usage.bestPractices.map(p => `  • ${p}`).join("\n")}
- Examples:
${doc.usage.examples.map(e => `  • ${e}`).join("\n")}

Data Structure:
${formatDataStructure(doc.dataStructure)}`

  return output
}

function formatLimits(limits: NodeDocumentation["limits"]): string {
  const parts: string[] = []
  if (limits.text) {
    parts.push(`  - Text: ${limits.text.min || 0}-${limits.text.max} characters`)
  }
  if (limits.buttons) {
    parts.push(`  - Buttons: ${limits.buttons.min}-${limits.buttons.max} buttons (max ${limits.buttons.textMaxLength} chars each)`)
  }
  if (limits.options) {
    parts.push(`  - Options: ${limits.options.min}-${limits.options.max} options (max ${limits.options.textMaxLength} chars each)`)
  }
  if (limits.maxConnections) {
    parts.push(`  - Max connections: ${limits.maxConnections}`)
  }
  if (limits.allowMultipleOutputs !== undefined) {
    parts.push(`  - Multiple outputs: ${limits.allowMultipleOutputs ? "Yes" : "No"}`)
  }
  return parts.join("\n") || "  - No specific limits"
}

function formatDataStructure(structure: Record<string, any>): string {
  return JSON.stringify(structure, null, 2)
    .split("\n")
    .map(line => `  ${line}`)
    .join("\n")
}

// INTERACTION NODES
function getInteractionNodeDocs(platform?: Platform): NodeDocumentation[] {
  const docs: NodeDocumentation[] = []

  // Question Nodes
  const questionPlatforms: Platform[] = ["web", "whatsapp", "instagram"]
  questionPlatforms.forEach(p => {
    if (platform && platform !== p) return
    
    const nodeType = p === "web" ? "webQuestion" : p === "whatsapp" ? "whatsappQuestion" : "instagramQuestion"
    const limits = getNodeLimits("question", p)
    
    docs.push({
      type: nodeType,
      category: "interaction",
      platforms: [p],
      description: "Ask users a question. Use for general questions, not for collecting specific data fields (use super nodes for that).",
      properties: {
        required: ["label", "question", "platform"],
        optional: []
      },
      limits: {
        text: limits.question,
        maxConnections: limits.maxConnections,
        allowMultipleOutputs: limits.allowMultipleOutputs
      },
      usage: {
        whenToUse: "When you need to ask a general question or gather open-ended feedback. NOT for collecting email, name, DOB, or address (use super nodes instead).",
        bestPractices: [
          "Write clear, specific questions",
          "Encourage a response",
          "Keep questions concise",
          "Use natural, conversational language"
        ],
        examples: [
          "What hair problems are you experiencing?",
          "How can we help you today?",
          "What would you like to know about our products?"
        ]
      },
      dataStructure: {
        id: "string (unique)",
        type: nodeType,
        platform: p,
        label: "string (e.g., 'Product Inquiry')",
        question: "string (the question text)"
      }
    })
  })

  // Quick Reply Nodes
  questionPlatforms.forEach(p => {
    if (platform && platform !== p) return
    
    const nodeType = p === "web" ? "webQuickReply" : p === "whatsapp" ? "whatsappQuickReply" : "instagramQuickReply"
    const limits = getNodeLimits("quickReply", p)
    
    docs.push({
      type: nodeType,
      category: "interaction",
      platforms: [p],
      description: "Question with button options. Supports branching - each button can connect to different nodes using sourceHandle (button-0, button-1, button-2).",
      properties: {
        required: ["label", "question", "buttons", "platform"],
        optional: []
      },
      limits: {
        text: limits.question,
        buttons: limits.buttons,
        maxConnections: limits.maxConnections,
        allowMultipleOutputs: limits.allowMultipleOutputs
      },
      usage: {
        whenToUse: "When you need to offer choices or options to users. Perfect for branching flows where different buttons lead to different paths.",
        bestPractices: [
          "Use action-oriented button text (Yes, No, Continue, etc.)",
          "Keep button text short and scannable (max 20 chars for WhatsApp)",
          "Order buttons by importance/frequency",
          "Use sentence case, not ALL CAPS",
          "Create branching edges: each button connects to different nodes using sourceHandle"
        ],
        examples: [
          "Question: 'Would you like a free sample?' Buttons: ['Yes, send it!', 'No, thanks']",
          "Question: 'Which product interests you?' Buttons: ['Shampoo', 'Conditioner', 'Hair Mask']"
        ]
      },
      dataStructure: {
        id: "string (unique)",
        type: nodeType,
        platform: p,
        label: "string (e.g., 'Product Selection')",
        question: "string (the question text)",
        buttons: [
          { text: "string (button label)", id: "string (optional)" }
        ]
      }
    })
  })

  // List Nodes (WhatsApp only)
  ;(["whatsapp"] as Platform[]).forEach(p => {
    if (platform && platform !== p) return

    const nodeType = "whatsappInteractiveList"
    const limits = getNodeLimits("list", p)
    
    docs.push({
      type: nodeType,
      category: "interaction",
      platforms: [p],
      description: "Interactive list menu with options. Each option can have a title and description.",
      properties: {
        required: ["label", "question", "listTitle", "options", "platform"],
        optional: []
      },
      limits: {
        text: limits.question,
        options: limits.options,
        maxConnections: limits.maxConnections,
        allowMultipleOutputs: limits.allowMultipleOutputs
      },
      usage: {
        whenToUse: "When you need to present multiple options in a structured list format. Better for 3+ options than buttons.",
        bestPractices: [
          "Keep option titles concise (max 24 chars)",
          "Use descriptions to provide context (max 72 chars)",
          "Limit to 10 options maximum",
          "Order by relevance or popularity"
        ],
        examples: [
          "List Title: 'Hair Care Products' Options: ['Shampoo', 'Conditioner', 'Hair Mask']"
        ]
      },
      dataStructure: {
        id: "string (unique)",
        type: nodeType,
        platform: p,
        label: "string (e.g., 'Product List')",
        question: "string (introductory text)",
        listTitle: "string (max 60 chars)",
        options: [
          { 
            text: "string (option title, max 24 chars)",
            description: "string (optional, max 72 chars)",
            id: "string (optional)"
          }
        ]
      }
    })
  })

  // WhatsApp Message Node
  if (!platform || platform === "whatsapp") {
    docs.push({
      type: "whatsappMessage",
      category: "interaction",
      platforms: ["whatsapp"],
      description: "Send a WhatsApp message to users.",
      properties: {
        required: ["label", "text", "platform"],
        optional: []
      },
      limits: {
        text: { min: 1, max: 4096 },
        maxConnections: 1,
        allowMultipleOutputs: false
      },
      usage: {
        whenToUse: "When you need to send informational messages or notifications via WhatsApp.",
        bestPractices: [
          "Keep messages conversational",
          "Break long text into smaller messages",
          "Use emojis sparingly and contextually"
        ],
        examples: [
          "Thank you for your interest! We'll send you updates soon."
        ]
      },
      dataStructure: {
        id: "string (unique)",
        type: "whatsappMessage",
        platform: "whatsapp",
        label: "string (e.g., 'Welcome Message')",
        text: "string (the message content, max 4096 chars)"
      }
    })
  }

  // Instagram DM Node
  if (!platform || platform === "instagram") {
    docs.push({
      type: "instagramDM",
      category: "interaction",
      platforms: ["instagram"],
      description: "Send an Instagram direct message to users.",
      properties: {
        required: ["label", "text", "platform"],
        optional: []
      },
      limits: {
        text: { min: 1, max: 1000 },
        maxConnections: 1,
        allowMultipleOutputs: false
      },
      usage: {
        whenToUse: "When you need to send messages via Instagram DMs.",
        bestPractices: [
          "Keep messages engaging and visual",
          "Use modern, casual tone",
          "Emojis can be more liberal"
        ],
        examples: [
          "Hey! 👋 Thanks for reaching out. Let's get you started!"
        ]
      },
      dataStructure: {
        id: "string (unique)",
        type: "instagramDM",
        platform: "instagram",
        label: "string (e.g., 'Welcome DM')",
        text: "string (the message content, max 1000 chars)"
      }
    })
  }

  // Instagram Story Node
  if (!platform || platform === "instagram") {
    docs.push({
      type: "instagramStory",
      category: "interaction",
      platforms: ["instagram"],
      description: "Create an Instagram story reply prompt.",
      properties: {
        required: ["label", "text", "platform"],
        optional: []
      },
      limits: {
        text: { min: 0, max: 500 },
        maxConnections: 1,
        allowMultipleOutputs: false
      },
      usage: {
        whenToUse: "When you want to engage users through Instagram stories.",
        bestPractices: [
          "Keep prompts short and engaging",
          "Use visual language",
          "Encourage interaction"
        ],
        examples: [
          "Swipe up to get your free sample! 🎁"
        ]
      },
      dataStructure: {
        id: "string (unique)",
        type: "instagramStory",
        platform: "instagram",
        label: "string (e.g., 'Story Prompt')",
        text: "string (the story prompt, max 500 chars)"
      }
    })
  }

  return docs
}

// INFORMATION NODES (Super Nodes)
function getInformationNodeDocs(platform?: Platform): NodeDocumentation[] {
  const docs: NodeDocumentation[] = []
  const platforms: Platform[] = ["web", "whatsapp", "instagram"]

  // Name Node
  platforms.forEach(p => {
    if (platform && platform !== p) return
    
    docs.push({
      type: "name",
      category: "information",
      platforms: [p],
      description: "Collect and validate user's name. Super node with built-in validation. Use this for name collection, NOT question nodes.",
      isSuperNode: true,
      properties: {
        required: ["label", "question", "platform", "fieldLabel", "validationRules"],
        optional: []
      },
      limits: {
        text: { max: CHARACTER_LIMITS[p].question },
        maxConnections: 1,
        allowMultipleOutputs: false
      },
      usage: {
        whenToUse: "ALWAYS use this node when you need to collect the user's name. Do NOT use question nodes for name collection.",
        bestPractices: [
          "Ask for name in a friendly, natural way",
          "The node handles validation automatically",
          "Supports first name, last name, and full name collection"
        ],
        examples: [
          "What's your name?",
          "Please tell us your name",
          "Hi! What should we call you?"
        ]
      },
      dataStructure: {
        id: "string (unique)",
        type: "name",
        platform: p,
        label: "string (e.g., 'Collect Name')",
        question: "string (the prompt text)",
        fieldLabel: "string (e.g., 'Full Name')",
        validationRules: {
          minLength: 2,
          maxLength: 50,
          allowNumbers: false,
          required: true
        }
      }
    })
  })

  // Email Node
  platforms.forEach(p => {
    if (platform && platform !== p) return
    
    docs.push({
      type: "email",
      category: "information",
      platforms: [p],
      description: "Collect and validate user's email address. Super node with built-in validation including format check, domain validation, and disposable email detection. Use this for email collection, NOT question nodes.",
      isSuperNode: true,
      properties: {
        required: ["label", "question", "platform", "fieldLabel", "validationRules"],
        optional: []
      },
      limits: {
        text: { max: CHARACTER_LIMITS[p].question },
        maxConnections: 1,
        allowMultipleOutputs: false
      },
      usage: {
        whenToUse: "ALWAYS use this node when you need to collect the user's email. Do NOT use question nodes for email collection.",
        bestPractices: [
          "Explain why you need their email",
          "The node handles all validation automatically (format, domain, disposable emails)",
          "Use friendly, reassuring language"
        ],
        examples: [
          "What's your email address?",
          "We'll send your sample confirmation to your email. What's your email?",
          "Enter your email to receive updates"
        ]
      },
      dataStructure: {
        id: "string (unique)",
        type: "email",
        platform: p,
        label: "string (e.g., 'Collect Email')",
        question: "string (the prompt text)",
        fieldLabel: "string (e.g., 'Email Address')",
        validationRules: {
          format: "RFC 5322",
          checkDomain: true,
          blockDisposable: true,
          required: true
        }
      }
    })
  })

  // DOB Node
  platforms.forEach(p => {
    if (platform && platform !== p) return
    
    docs.push({
      type: "dob",
      category: "information",
      platforms: [p],
      description: "Collect user's date of birth. Super node with built-in validation including age checks and format validation. Use this for DOB collection, NOT question nodes.",
      isSuperNode: true,
      properties: {
        required: ["label", "question", "platform", "fieldLabel", "validationRules"],
        optional: []
      },
      limits: {
        text: { max: CHARACTER_LIMITS[p].question },
        maxConnections: 1,
        allowMultipleOutputs: false
      },
      usage: {
        whenToUse: "ALWAYS use this node when you need to collect the user's date of birth. Do NOT use question nodes for DOB collection.",
        bestPractices: [
          "Be clear about format and purpose",
          "The node handles age validation automatically (min 13 for COPPA)",
          "Use friendly, non-intrusive language"
        ],
        examples: [
          "What's your date of birth?",
          "Please enter your date of birth (DD/MM/YYYY)",
          "We need your date of birth to verify age requirements"
        ]
      },
      dataStructure: {
        id: "string (unique)",
        type: "dob",
        platform: p,
        label: "string (e.g., 'Collect DOB')",
        question: "string (the prompt text)",
        fieldLabel: "string (e.g., 'Date of Birth')",
        validationRules: {
          minAge: 13,
          maxAge: 120,
          format: "DD/MM/YYYY",
          required: true
        }
      }
    })
  })

  // Address Node
  platforms.forEach(p => {
    if (platform && platform !== p) return
    
    docs.push({
      type: "address",
      category: "information",
      platforms: [p],
      description: "Collect and validate user's address. Super node with built-in validation for all address components (street, city, state, ZIP, country). Use this for address collection, NOT question nodes.",
      isSuperNode: true,
      properties: {
        required: ["label", "question", "platform", "fieldLabel", "validationRules", "addressComponents"],
        optional: []
      },
      limits: {
        text: { max: CHARACTER_LIMITS[p].question },
        maxConnections: 1,
        allowMultipleOutputs: false
      },
      usage: {
        whenToUse: "ALWAYS use this node when you need to collect the user's address (especially for delivery flows). Do NOT use question nodes for address collection.",
        bestPractices: [
          "Break down address collection into clear steps",
          "The node handles all component validation automatically",
          "Required for homeDelivery flows",
          "Supports postal code validation"
        ],
        examples: [
          "Please enter your address",
          "We need your address for delivery. Please enter it below.",
          "Where should we deliver your sample?"
        ]
      },
      dataStructure: {
        id: "string (unique)",
        type: "address",
        platform: p,
        label: "string (e.g., 'Delivery Address')",
        question: "string (the prompt text)",
        fieldLabel: "string (e.g., 'Address')",
        validationRules: {
          geography: "pan-india",
          required: true,
          validatePostalCode: true,
          autocomplete: p === "web"
        },
        addressComponents: ["House Number", "Society/Block", "Area", "City"]
      }
    })
  })

  return docs
}

// LOGIC NODES
function getLogicNodeDocs(platform?: Platform): NodeDocumentation[] {
  const docs: NodeDocumentation[] = []
  const platforms: Platform[] = ["web", "whatsapp", "instagram"]

  platforms.forEach(p => {
    if (platform && platform !== p) return
    
    docs.push({
      type: "condition",
      category: "logic",
      platforms: [p],
      description: "Branch flow based on conditions. Supports AND/OR logic. Context-aware - automatically detects connected nodes and offers relevant field options.",
      properties: {
        required: ["label", "platform", "conditionLogic", "conditionGroups"],
        optional: ["connectedNode"]
      },
      limits: {
        maxConnections: 10,
        allowMultipleOutputs: true
      },
      usage: {
        whenToUse: "When you need to branch the flow based on user data, responses, or conditions. Perfect for creating dynamic, personalized experiences.",
        bestPractices: [
          "Keep conditions clear and unambiguous",
          "Use AND logic for all conditions must be true",
          "Use OR logic for any condition can be true",
          "Connect to information nodes (name, email, dob, address) for context-aware fields",
          "Each condition group can have multiple rules"
        ],
        examples: [
          "If age >= 18, go to adult content; else go to age verification",
          "If email domain is corporate, go to B2B flow; else go to B2C flow"
        ]
      },
      dataStructure: {
        id: "string (unique)",
        type: "condition",
        platform: p,
        label: "string (e.g., 'Age Check')",
        conditionLogic: "AND | OR",
        connectedNode: {
          type: "string (e.g., 'name', 'email', 'dob', 'address')",
          id: "string (optional)"
        },
        conditionGroups: [
          {
            id: "string (unique)",
            label: "string (e.g., 'True', 'False')",
            logic: "AND | OR",
            rules: [
              {
                field: "string (e.g., 'Age', 'Email Domain')",
                operator: "string (e.g., '>=', 'equals', 'contains')",
                value: "string (the comparison value)"
              }
            ]
          }
        ]
      }
    })
  })

  return docs
}

// FULFILLMENT NODES
function getFulfillmentNodeDocs(platform?: Platform): NodeDocumentation[] {
  const docs: NodeDocumentation[] = []
  const platforms: Platform[] = ["web", "whatsapp", "instagram"]

  // Home Delivery
  platforms.forEach(p => {
    if (platform && platform !== p) return
    
    docs.push({
      type: "homeDelivery",
      category: "fulfillment",
      platforms: [p],
      description: "Schedule at-home delivery. Requires address node in the flow. Configured with optimized delivery vendor.",
      properties: {
        required: ["label", "platform", "description", "vendor", "configuration"],
        optional: []
      },
      limits: {
        maxConnections: 1,
        allowMultipleOutputs: false
      },
      usage: {
        whenToUse: "When you need to schedule home delivery of products or samples. MUST be preceded by an address node.",
        bestPractices: [
          "Always include address node before this node",
          "Configure delivery vendor settings",
          "Provide clear delivery expectations"
        ],
        examples: [
          "Schedule your free sample delivery",
          "We'll deliver to your address within 3-5 business days"
        ]
      },
      dataStructure: {
        id: "string (unique)",
        type: "homeDelivery",
        platform: p,
        label: "string (e.g., 'Schedule Delivery')",
        description: "string (e.g., 'Schedule a home delivery')",
        vendor: {
          name: "string",
          type: "delivery",
          description: "string",
          features: ["string[]"]
        },
        configuration: {
          trackingEnabled: true,
          notificationsEnabled: true
        }
      }
    })
  })

  // Event
  platforms.forEach(p => {
    if (platform && platform !== p) return
    
    docs.push({
      type: "event",
      category: "fulfillment",
      platforms: [p],
      description: "Book event or appointment. Configured with event management settings.",
      properties: {
        required: ["label", "platform", "description", "configuration"],
        optional: []
      },
      limits: {
        maxConnections: 1,
        allowMultipleOutputs: false
      },
      usage: {
        whenToUse: "When you need to book appointments, events, or schedule meetings.",
        bestPractices: [
          "Collect necessary information before booking",
          "Provide clear event details",
          "Set up reminders and notifications"
        ],
        examples: [
          "Book your consultation appointment",
          "Schedule your product demo"
        ]
      },
      dataStructure: {
        id: "string (unique)",
        type: "event",
        platform: p,
        label: "string (e.g., 'Book Appointment')",
        description: "string (e.g., 'Book event or appointment')",
        configuration: {
          remindersEnabled: true,
          notificationsEnabled: true
        }
      }
    })
  })

  // Retail Store
  platforms.forEach(p => {
    if (platform && platform !== p) return
    
    docs.push({
      type: "retailStore",
      category: "fulfillment",
      platforms: [p],
      description: "Find nearby retail stores. Configured with location-based search.",
      properties: {
        required: ["label", "platform", "description", "configuration"],
        optional: []
      },
      limits: {
        maxConnections: 1,
        allowMultipleOutputs: false
      },
      usage: {
        whenToUse: "When you need to help users find physical store locations.",
        bestPractices: [
          "Use location data if available",
          "Provide store hours and contact info",
          "Show distance and directions"
        ],
        examples: [
          "Find a store near you",
          "Locate our nearest retail location"
        ]
      },
      dataStructure: {
        id: "string (unique)",
        type: "retailStore",
        platform: p,
        label: "string (e.g., 'Find Store')",
        description: "string (e.g., 'Find nearby retail stores')",
        configuration: {
          locationSearchEnabled: true,
          mapIntegrationEnabled: true
        }
      }
    })
  })

  // Tracking Notification
  platforms.forEach(p => {
    if (platform && platform !== p) return
    
    docs.push({
      type: "trackingNotification",
      category: "fulfillment",
      platforms: [p],
      description: "Send tracking notification for delivery orders. Provides real-time tracking information and delivery updates. ONLY suggest this node when homeDelivery node exists in the flow.",
      properties: {
        required: ["label", "platform", "message"],
        optional: ["trackingNumber", "estimatedDelivery"]
      },
      limits: {
        text: { max: CHARACTER_LIMITS[p].question || 500 },
        maxConnections: 1,
        allowMultipleOutputs: false
      },
      usage: {
        whenToUse: "ONLY use this node when a homeDelivery node exists in the flow. Use this to notify users about their delivery status, provide tracking numbers, and estimated delivery times.",
        bestPractices: [
          "Always include tracking number if available",
          "Provide estimated delivery time",
          "Use clear, reassuring language",
          "Include next steps or contact information if needed",
          "This node should come AFTER homeDelivery node in the flow"
        ],
        examples: [
          "Your order is on the way! Track your delivery in real-time. Tracking: #123456789",
          "Great news! Your package has been shipped. Expected delivery: 3-5 business days",
          "Your delivery is out for delivery today! Track it here: [link]"
        ]
      },
      dataStructure: {
        id: "string (unique)",
        type: "trackingNotification",
        platform: p,
        label: "string (e.g., 'Tracking Notification')",
        message: "string (the notification message, max 500 chars)",
        trackingNumber: "string (optional, e.g., 'TRACK123456')",
        estimatedDelivery: "string (optional, e.g., '3-5 business days')"
      }
    })
  })

  return docs
}

// INTEGRATION NODES
function getIntegrationNodeDocs(platform?: Platform): NodeDocumentation[] {
  const docs: NodeDocumentation[] = []

  // Shopify
  const shopifyPlatforms: Platform[] = ["web", "whatsapp", "instagram"]
  shopifyPlatforms.forEach(p => {
    if (platform && platform !== p) return
    
    docs.push({
      type: "shopify",
      category: "integration",
      platforms: [p],
      description: "Connect to Shopify store. Sync products, orders, and customer data.",
      properties: {
        required: ["label", "platform", "description", "configuration"],
        optional: []
      },
      limits: {
        maxConnections: 1,
        allowMultipleOutputs: false
      },
      usage: {
        whenToUse: "When you need to integrate with Shopify for e-commerce functionality.",
        bestPractices: [
          "Configure API credentials",
          "Set up product sync",
          "Handle order processing"
        ],
        examples: [
          "Sync products from Shopify",
          "Create order in Shopify"
        ]
      },
      dataStructure: {
        id: "string (unique)",
        type: "shopify",
        platform: p,
        label: "string (e.g., 'Shopify Integration')",
        description: "string (e.g., 'Connect to Shopify store')",
        configuration: {
          apiKey: "string (configured)",
          storeUrl: "string (configured)"
        }
      }
    })
  })

  // Meta Audience (WhatsApp/Instagram only)
  ;(["whatsapp", "instagram"] as Platform[]).forEach(p => {
    if (platform && platform !== p) return
    
    docs.push({
      type: "metaAudience",
      category: "integration",
      platforms: [p],
      description: "Sync with Meta audiences. Build custom audiences for Facebook/Instagram ads.",
      properties: {
        required: ["label", "platform", "description", "configuration"],
        optional: []
      },
      limits: {
        maxConnections: 1,
        allowMultipleOutputs: false
      },
      usage: {
        whenToUse: "When you need to sync user data with Meta for advertising and audience building.",
        bestPractices: [
          "Configure Meta API credentials",
          "Set up audience segmentation",
          "Handle privacy compliance"
        ],
        examples: [
          "Add user to custom audience",
          "Sync with Meta for retargeting"
        ]
      },
      dataStructure: {
        id: "string (unique)",
        type: "metaAudience",
        platform: p,
        label: "string (e.g., 'Meta Audience Sync')",
        description: "string (e.g., 'Sync with Meta audiences')",
        configuration: {
          apiKey: "string (configured)",
          audienceId: "string (configured)"
        }
      }
    })
  })

  // Other integrations (Stripe, Zapier, Google, Salesforce, Mailchimp, Twilio, Slack, Airtable)
  const otherIntegrations = [
    { type: "stripe", description: "Process payments via Stripe" },
    { type: "zapier", description: "Connect to 5000+ apps via Zapier" },
    { type: "google", description: "Sync with Google Sheets" },
    { type: "salesforce", description: "CRM integration" },
    { type: "mailchimp", description: "Email marketing integration" },
    { type: "twilio", description: "SMS & Voice integration" },
    { type: "slack", description: "Team notifications" },
    { type: "airtable", description: "Database sync" }
  ]

  otherIntegrations.forEach(integration => {
    shopifyPlatforms.forEach(p => {
      if (platform && platform !== p) return
      
      docs.push({
        type: integration.type,
        category: "integration",
        platforms: [p],
        description: integration.description,
        properties: {
          required: ["label", "platform", "description", "configuration"],
          optional: []
        },
        limits: {
          maxConnections: 1,
          allowMultipleOutputs: false
        },
        usage: {
          whenToUse: `When you need to integrate with ${integration.type} for ${integration.description.toLowerCase()}.`,
          bestPractices: [
            "Configure API credentials",
            "Set up proper error handling",
            "Handle data synchronization"
          ],
          examples: [
            `Connect to ${integration.type}`,
            `Sync data with ${integration.type}`
          ]
        },
        dataStructure: {
          id: "string (unique)",
          type: integration.type,
          platform: p,
          label: `string (e.g., '${integration.type.charAt(0).toUpperCase() + integration.type.slice(1)} Integration')`,
          description: `string (e.g., '${integration.description}')`,
          configuration: {
            apiKey: "string (configured)"
          }
        }
      })
    })
  })

  return docs
}

