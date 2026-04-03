import { MessageCircle, MessageSquare, List, User, Package, Store, Calendar as CalendarIcon, Zap, GitBranch, PackageSearch, Globe, PhoneForwarded, FileText, Layers, CircleCheck, FormInput } from "lucide-react"
import { ShopifyIcon, MetaIcon, GoogleIcon, StripeIcon, ZapierIcon, SalesforceIcon, MailchimpIcon, TwilioIcon, SlackIcon, AirtableIcon } from "@/components/service-icons"
import type { Platform } from "@/types"

// ═══════════════════════════════════════════════════════════════════
// ALL NODE & PLATFORM LIMITS — Single source of truth
// Everything resolves through getNodeLimits() in node-limits/config.ts.
//
// HOW LIMITS RESOLVE:
//
// 1. Platform defaults (below) are the FALLBACK for all nodes.
//    BUTTON_LIMITS      → max button count per platform (wa: 3, web: 10)
//    CHARACTER_LIMITS   → default text limits (question, button text, comment)
//    OPTION_LIMITS      → list row count and title length
//
// 2. NODE_TEMPLATES[].limits (further below) are PER-NODE OVERRIDES:
//    - Flags tell config.ts to pull from platform defaults:
//        textField: "question"  → question.max = CHARACTER_LIMITS[platform].question
//        hasButtons: true       → buttons.max = BUTTON_LIMITS[platform]
//                                 buttons.textMaxLength = CHARACTER_LIMITS[platform].button
//        hasOptions: true       → options.max = OPTION_LIMITS.all
//                                 options.textMaxLength = OPTION_LIMITS.titleMaxLength
//    - Overrides BYPASS platform defaults entirely:
//        textMax: 4096          → text.max = 4096 (ignores CHARACTER_LIMITS)
//        listTitleMax: 20       → listTitle.max = 20
//
// EXAMPLES:
//   question:        { textField: "question" }         → max = 250 (wa) / 500 (web)
//   quickReply:      { textField: "question", hasButtons: true } → max = 250, buttons = 3 (wa)
//   whatsappMessage: { textMax: 4096 }                 → max = 4096 (override)
//   interactiveList: { hasOptions: true, listTitleMax: 20 }     → options.title = 24, CTA = 20
//
// TO CHANGE A LIMIT:
//   - Platform-wide default (e.g. all WA button text) → edit CHARACTER_LIMITS/BUTTON_LIMITS
//   - Single node type (e.g. whatsappMessage text)    → edit that NODE_TEMPLATE's limits
// ═══════════════════════════════════════════════════════════════════

/** Max number of buttons per platform (Meta API) */
export const BUTTON_LIMITS: Record<Platform, number> = {
  web: 10,
  whatsapp: 3,
  instagram: 3,
} as const

/** List/option limits (Meta API) */
export const OPTION_LIMITS = {
  all: 10,
  titleMaxLength: 24, // WhatsApp list row title
} as const

/** Default character limits per platform (Meta API). Per-node overrides below take precedence. */
export const CHARACTER_LIMITS: Record<Platform, { question: number; button: number; comment: number }> = {
  web: { question: 500, button: 20, comment: 200 },
  whatsapp: { question: 250, button: 20, comment: 200 },
  instagram: { question: 250, button: 20, comment: 100 },
} as const

export interface NodeTemplateLimits {
  /** "question" → result.question with platform limits. Default: result.text with platform limits. */
  textField?: "question"
  /** Override text max (produces result.text). Mutually exclusive with textField. */
  textMax?: number
  /** Override text min (default: 1 for textMax, omitted for default text). */
  textMin?: number
  /** Node has buttons — resolved to BUTTON_LIMITS[platform] */
  hasButtons?: boolean
  /** Node has list options — resolved to max 10 options */
  hasOptions?: boolean
  /** List title max length (interactiveList only) */
  listTitleMax?: number
  /** Max outgoing connections. Default: 1. Buttons: auto = BUTTON_LIMITS[platform]. */
  maxConnections?: number
  /** Supports multiple output edges. Default: false. */
  multiOutput?: boolean
  /** Accepts multiple input edges. Default: true. */
  allowMultipleInputs?: boolean
  /**
   * How source handles are derived for this node type.
   * Used by the flattener to enumerate all possible exits from a node.
   * - "none": terminal node, no source handles (e.g. transfer, flowComplete)
   * - "default": single unnamed handle (e.g. question, message nodes)
   * - "buttons": per-button handle from data.buttons[].id + "sync-next" fallthrough
   * - "options": per-option handle from data.options[].id + "sync-next" fallthrough
   * - "conditions": per-group handle from data.conditionGroups[].id + "else" fallback
   *
   * If omitted, inferred: maxConnections=0 → "none", otherwise "default".
   */
  sourceHandles?: "none" | "default" | "buttons" | "options" | "conditions" | "api_result"
}

export interface NodeTemplateAI {
  /** Richer description for AI (overrides the short sidebar description) */
  description?: string
  /** When the AI should pick this node type */
  whenToUse: string
  /** Tips for generating content */
  bestPractices?: string[]
  /** Example content strings */
  examples?: string[]
  /** Short content-field hint for compact docs (replaces getContentHints switch) */
  contentFields?: string
  /** Required properties the AI must generate */
  requiredProperties: string[]
  /** Optional properties */
  optionalProperties?: string[]
  /** Short imperative rule for AI node selection (injected into all prompts) */
  selectionRule?: string
  /** Node IDs that must exist in the flow before this node can be used */
  dependencies?: string[]
}

export interface NodeTemplate {
  type: string
  icon: any
  label: string
  description: string
  category: "template" | "interaction" | "information" | "fulfillment" | "integration" | "logic" | "action"
  platforms: Platform[] // Which platforms support this node
  badge?: string // Optional badge text
  limits?: NodeTemplateLimits
  ai?: NodeTemplateAI
}

/** Helper to build AI metadata for generic integration nodes. */
function makeIntegrationAI(name: string, desc: string): NodeTemplateAI {
  return {
    whenToUse: `When you need to integrate with ${name} for ${desc.toLowerCase()}.`,
    bestPractices: ["Configure API credentials", "Set up proper error handling", "Handle data synchronization"],
    examples: [`Connect to ${name}`, `Sync data with ${name}`],
    requiredProperties: ["label", "platform", "description", "configuration"],
  }
}

export const NODE_CATEGORIES = {
  template: {
    label: "Templates",
    description: "Reusable flow templates",
    icon: Layers,
  },
  information: {
    label: "Information",
    description: "Collect & validate data",
    icon: User,
  },
  interaction: {
    label: "Interaction",
    description: "Conversational elements",
    icon: MessageCircle,
  },
  logic: {
    label: "Logic",
    description: "Flow control & branching",
    icon: GitBranch,
  },
  fulfillment: {
    label: "Fulfillment",
    description: "Delivery & services",
    icon: Package,
  },
  integration: {
    label: "Integration",
    description: "External platforms",
    icon: Zap,
  },
  action: {
    label: "Action",
    description: "API calls & agent handoff",
    icon: Zap,
  },
}

export const NODE_TEMPLATES: NodeTemplate[] = [
  // INTERACTION NODES
  {
    type: "question",
    icon: MessageCircle,
    label: "Question",
    description: "Ask users a question and wait for their text reply",
    category: "interaction",
    platforms: ["web", "whatsapp", "instagram"],
    limits: { textField: "question" },
    ai: {
      description: "Ask users a question and wait for their text response. ONLY for truly open-ended text input. Do NOT use whatsappMessage/instagramDM for questions — use this node type instead.",
      whenToUse: "ONLY for truly open-ended text input (comments, descriptions, freeform feedback). Do NOT use for questions with finite/known answer options — use quickReply instead. NOT for collecting email, name, DOB, or address (use super nodes instead).",
      bestPractices: [
        "Write clear, specific questions",
        "Encourage a response",
        "Keep questions concise",
        "Use natural, conversational language",
      ],
      examples: [
        "What hair problems are you experiencing?",
        "How can we help you today?",
        "What would you like to know about our products?",
      ],
      contentFields: "question, media (ONLY for open-ended text — prefer quickReply when answers are finite)",
      requiredProperties: ["label", "question", "platform"],
      selectionRule: "Only for open-ended text input. Use quickReply when answers are finite.",
    },
  },
  {
    type: "quickReply",
    icon: MessageSquare,
    label: "Quick Reply",
    description: "Question with button options",
    category: "interaction",
    platforms: ["web", "whatsapp", "instagram"],
    limits: { textField: "question", hasButtons: true, multiOutput: true, sourceHandles: "buttons" },
    ai: {
      description: "Question with button options. Supports branching - each button can connect to different nodes using sourceHandle (button-0, button-1, button-2).",
      whenToUse: "When the answer has finite/known options (1-3 choices). ALWAYS use this instead of interactiveList when there are 3 or fewer options — buttons are more tap-friendly. Max 3 buttons on WhatsApp/Instagram. Perfect for branching flows where different buttons lead to different paths.",
      bestPractices: [
        "Use action-oriented button text (Yes, No, Continue, etc.)",
        "Keep button text short and scannable (max 20 chars for WhatsApp)",
        "Order buttons by importance/frequency",
        "Use sentence case, not ALL CAPS",
        "Create branching edges: each button connects to different nodes using sourceHandle",
      ],
      examples: [
        "Question: 'Would you like a free sample?' Buttons: ['Yes, send it!', 'No, thanks']",
        "Question: 'Which product interests you?' Buttons: ['Shampoo', 'Conditioner', 'Hair Mask']",
      ],
      contentFields: "question, buttons[], media (prefer over question when answer options are finite)",
      requiredProperties: ["label", "question", "buttons", "platform"],
      selectionRule: "Use for 1-3 choices. Always prefer over interactiveList for ≤3 options.",
    },
  },
  {
    type: "interactiveList",
    icon: List,
    label: "List",
    description: "Interactive list menu",
    category: "interaction",
    platforms: ["whatsapp"],
    limits: { textField: "question", hasOptions: true, listTitleMax: 20, multiOutput: true, maxConnections: 10, sourceHandles: "options" },
    ai: {
      description: "Interactive list menu with options. Each option can have a title and description.",
      whenToUse: "ONLY when there are 4 or more choices. Never use for 3 or fewer options — use quickReply instead. Renders as a scrollable list menu on WhatsApp (up to 10 options).",
      bestPractices: [
        "Keep option titles concise (max 24 chars)",
        "Use descriptions to provide context (max 72 chars)",
        "Limit to 10 options maximum",
        "Order by relevance or popularity",
      ],
      examples: [
        "List Title: 'Hair Care Products' Options: ['Shampoo', 'Conditioner', 'Hair Mask']",
      ],
      contentFields: "question, options[], listTitle",
      requiredProperties: ["label", "question", "listTitle", "options", "platform"],
      selectionRule: "Only for 4+ choices. Never use for ≤3 options — use quickReply.",
    },
  },
  {
    type: "whatsappMessage",
    icon: MessageCircle,
    label: "WhatsApp Message",
    description: "Send a one-way message (NOT for questions — use question type instead)",
    category: "interaction",
    platforms: ["whatsapp"],
    limits: { textMax: 4096 },
    ai: {
      description: "Send a one-way WhatsApp message (no user response expected). Do NOT use this for asking questions — use question type instead.",
      whenToUse: "ONLY for one-way informational messages or notifications (e.g., 'Thank you!', confirmations). Do NOT use this to ask questions — use the question node type when you expect a user response.",
      bestPractices: [
        "Keep messages conversational",
        "Break long text into smaller messages",
        "Use emojis sparingly and contextually",
      ],
      examples: [
        "Thank you for your interest! We'll send you updates soon.",
      ],
      contentFields: "text, media (one-way message only, NOT for questions)",
      requiredProperties: ["label", "text", "platform"],
      selectionRule: "One-way message only. No user reply expected. Not for questions.",
    },
  },
  {
    type: "instagramDM",
    icon: MessageCircle,
    label: "Instagram DM",
    description: "Send a one-way DM (NOT for questions — use question type instead)",
    category: "interaction",
    platforms: ["instagram"],
    limits: { textMax: 1000 },
    ai: {
      description: "Send a one-way Instagram DM (no user response expected). Do NOT use this for asking questions — use question type instead.",
      whenToUse: "ONLY for one-way informational messages or notifications via Instagram DMs (e.g., 'Thanks for reaching out!'). Do NOT use this to ask questions — use the question node type when you expect a user response.",
      bestPractices: [
        "Keep messages engaging and visual",
        "Use modern, casual tone",
        "Emojis can be more liberal",
      ],
      examples: [
        "Hey! 👋 Thanks for reaching out. Let's get you started!",
      ],
      contentFields: "text (one-way message only, NOT for questions)",
      requiredProperties: ["label", "text", "platform"],
      selectionRule: "One-way message only. No user reply expected.",
    },
  },
  {
    type: "instagramStory",
    icon: MessageCircle,
    label: "Instagram Story",
    description: "Add story reply prompt",
    category: "interaction",
    platforms: ["instagram"],
    limits: { textMax: 500, textMin: 0 },
    ai: {
      description: "Create an Instagram story reply prompt.",
      whenToUse: "When you want to engage users through Instagram stories.",
      bestPractices: [
        "Keep prompts short and engaging",
        "Use visual language",
        "Encourage interaction",
      ],
      examples: [
        "Swipe up to get your free sample! 🎁",
      ],
      contentFields: "text (one-way message only, NOT for questions)",
      requiredProperties: ["label", "text", "platform"],
    },
  },

  // LOGIC NODES
  {
    type: "condition",
    icon: GitBranch,
    label: "Condition",
    description: "Branch flow based on conditions",
    category: "logic",
    platforms: ["web", "whatsapp", "instagram"],
    badge: "Logic",
    limits: { maxConnections: 10, multiOutput: true, sourceHandles: "conditions" },
    ai: {
      description: "Branch flow based on conditions. Supports AND/OR logic. Context-aware - automatically detects connected nodes and offers relevant field options.",
      whenToUse: "When you need to branch the flow based on user data, responses, or conditions. Perfect for creating dynamic, personalized experiences.",
      bestPractices: [
        "Keep conditions clear and unambiguous",
        "Use AND logic for all conditions must be true",
        "Use OR logic for any condition can be true",
        "Connect to information nodes (name, email, dob, address) for context-aware fields",
        "Each condition group can have multiple rules",
        "Use has_tag/not_has_tag operators on _tags field to branch based on contact tags set by action nodes",
      ],
      examples: [
        "If age >= 18, go to adult content; else go to age verification",
        "If email domain is corporate, go to B2B flow; else go to B2C flow",
        "If _tags has_tag 'vip', go to VIP flow; else go to standard flow",
      ],
      contentFields: "(auto-configured)",
      requiredProperties: ["label", "platform", "conditionLogic", "conditionGroups"],
      optionalProperties: ["connectedNode"],
    },
  },

  {
    type: "flowComplete",
    icon: CircleCheck,
    label: "Complete",
    description: "Explicitly end the flow at this point",
    category: "logic",
    platforms: ["web", "whatsapp", "instagram"],
    badge: "Complete",
    limits: { maxConnections: 0 },
    ai: {
      whenToUse: "When you need to explicitly terminate a flow path, especially inside templates where open nodes would otherwise continue to the parent flow.",
      bestPractices: [
        "Use inside templates to mark paths that should NOT continue in the parent flow",
        "Not needed at the end of regular flows — leaving the last node unconnected works the same way",
      ],
      requiredProperties: ["label", "platform"],
    },
  },

  // ACTION NODES
  {
    type: "apiFetch",
    icon: Globe,
    label: "API Call",
    description: "Make HTTP request and map response to variables",
    category: "action",
    platforms: ["whatsapp"],
    limits: { maxConnections: 2, multiOutput: true, sourceHandles: "api_result" },
    ai: {
      whenToUse: "When you need to make an HTTP request to an external API and map the response data to session variables.",
      selectionRule: "Use for external API calls (CRM lookup, inventory check, coupon validation). Has dual output handles: 'success' and 'error' — always connect both.",
      contentFields: "url, method (GET/POST/PUT/DELETE), headers, body (JSON string — can use {{variables}}), responseMapping ({varName: jsonPath}), fallbackMessage",
      bestPractices: [
        "Configure the URL with proper template variables",
        "Set up response mapping to capture relevant data",
        "Always provide a fallback message for errors",
        "Connect both success and error handles to appropriate next steps",
      ],
      examples: [
        "Fetch user profile from CRM",
        "Check inventory availability",
        "Validate a coupon code",
      ],
      requiredProperties: ["label", "platform", "url", "method"],
      optionalProperties: ["headers", "body", "responseMapping", "fallbackMessage"],
    },
  },
  {
    type: "transfer",
    icon: PhoneForwarded,
    label: "Transfer",
    description: "Transfer conversation to an agent or team",
    category: "action",
    platforms: ["whatsapp"],
    limits: { maxConnections: 0 },
    ai: {
      whenToUse: "When the conversation needs to be handed off to a human agent or a specific team.",
      bestPractices: [
        "Send a pre-transfer message to set expectations",
        "Include relevant notes for the receiving agent",
        "Use template variables in notes for context",
      ],
      examples: [
        "Transfer to support team",
        "Hand off to sales agent",
      ],
      requiredProperties: ["label", "platform"],
      optionalProperties: ["teamId", "teamName", "notes", "message"],
    },
  },
  {
    type: "templateMessage",
    icon: FileText,
    label: "Template Message",
    description: "Send a pre-approved WhatsApp template message",
    category: "action",
    platforms: ["whatsapp"],
    limits: { maxConnections: 1, sourceHandles: "buttons" },
    ai: {
      whenToUse: "When you need to send a pre-approved WhatsApp template message (e.g. outside the 24-hour window).",
      bestPractices: [
        "Select an approved template from the template library",
        "Map flow variables to template parameters",
        "Templates must be pre-approved by Meta before use",
      ],
      examples: [
        "Send order confirmation template",
        "Send appointment reminder template",
      ],
      requiredProperties: ["label", "platform", "templateName", "language"],
      optionalProperties: ["parameterMappings"],
    },
  },

  {
    type: "action",
    icon: Zap,
    label: "Action",
    description: "Set variables and/or manage contact tags",
    category: "action",
    platforms: ["whatsapp"],
    limits: { maxConnections: 1 },
    ai: {
      description: "Set variables and/or manage contact tags in one step. No message sent — auto-advances to the next node. Max 10 variables and 10 tags per node. Values and tags support {{variable}} interpolation.",
      whenToUse: "When you need to set variables to computed/static values or add/remove tags on a contact without sending a message. Use before a condition node to prepare routing data, or after collecting info to derive computed values.",
      bestPractices: [
        "Use {{variable}} interpolation in values (e.g. {{first_name}} {{last_name}})",
        "Use descriptive variable names and tag names",
        "Tags can be used with has_tag/not_has_tag operators on the _tags field in condition nodes",
        "Max 10 variables and 10 tags per action node",
      ],
      contentFields: "variables[{name,value}] (max 10), tagAction (add|remove), tags[] (max 10) — supports {{variable}} interpolation",
      requiredProperties: ["label", "platform"],
      optionalProperties: ["variables", "tags", "tagAction"],
      selectionRule: "Use to set variables or manage tags silently (no message). Condition node supports has_tag/not_has_tag on _tags field.",
    },
  },

  {
    type: "whatsappFlow",
    icon: FormInput,
    label: "WhatsApp Flow",
    description: "Send a WhatsApp interactive form (Meta Flows)",
    category: "action",
    platforms: ["whatsapp"],
    limits: { maxConnections: 1 },
    ai: {
      description: "Send a WhatsApp interactive form (Meta Flows). Opens full-screen native form in WhatsApp. Response fields auto-stored in session variables and contact_variables.",
      whenToUse: "When you need to collect structured multi-field data via a native WhatsApp form (registration, surveys, feedback). The form must be pre-created and published in Meta's WhatsApp Flows builder.",
      requiredProperties: ["label", "platform", "whatsappFlowId", "bodyText", "ctaText"],
      optionalProperties: ["headerText"],
      contentFields: "bodyText (required message), headerText (optional), ctaText (button text, max 20 chars)",
      selectionRule: "Use to send a WhatsApp Flow form. Response fields become available as {{field_name}} variables in subsequent nodes.",
      bestPractices: [
        "bodyText is required — it's the message users see before opening the form",
        "ctaText max 20 chars (e.g. 'Open Form', 'Fill Survey', 'Register')",
        "Response fields are auto-extracted from the selected flow and available as variables downstream",
        "The flow must be published on Meta before it can be sent to users",
      ],
    },
  },

  // INFORMATION / TEMPLATE NODES
  // These entries exist so the AI knows to generate name/email/dob/address nodes.
  // They are created as legacy super nodes by the factory, then auto-migrated to
  // flowTemplate nodes on load (see use-flow-persistence.ts migrateSuperNodesToTemplates).
  // They do NOT appear in the sidebar (category "template" is filtered out there).
  {
    type: "name",
    icon: User,
    label: "Name",
    description: "Collect and validate user's name (flow template with built-in validation)",
    category: "template",
    platforms: ["web", "whatsapp", "instagram"],
    ai: {
      description: "Collect and validate user's name. Flow template with built-in validation. Use this for name collection, NOT question nodes.",
      whenToUse: "ALWAYS use this node when you need to collect the user's name. Do NOT use question nodes for name collection.",
      bestPractices: [
        "Ask for name in a friendly, natural way",
        "The node handles validation automatically",
      ],
      examples: [
        "What's your name?",
        "Hi! What should we call you?",
      ],
      contentFields: "question (optional override)",
      requiredProperties: ["label", "question", "platform"],
      selectionRule: "Always use for name collection. Never use question nodes for names.",
    },
  },
  {
    type: "email",
    icon: User,
    label: "Email",
    description: "Collect and validate user's email (flow template with built-in validation)",
    category: "template",
    platforms: ["web", "whatsapp", "instagram"],
    ai: {
      description: "Collect and validate user's email address. Flow template with built-in validation including format check, domain validation, and disposable email detection.",
      whenToUse: "ALWAYS use this node when you need to collect the user's email. Do NOT use question nodes for email collection.",
      bestPractices: [
        "Explain why you need their email",
        "The node handles all validation automatically",
      ],
      examples: [
        "What's your email address?",
        "Enter your email to receive updates",
      ],
      contentFields: "question (optional override)",
      requiredProperties: ["label", "question", "platform"],
      selectionRule: "Always use for email collection. Never use question nodes for emails.",
    },
  },
  {
    type: "dob",
    icon: User,
    label: "DOB",
    description: "Collect and validate date of birth (flow template with built-in validation)",
    category: "template",
    platforms: ["web", "whatsapp", "instagram"],
    ai: {
      description: "Collect user's date of birth. Flow template with built-in age checks and format validation.",
      whenToUse: "ALWAYS use this node when you need to collect the user's date of birth. Do NOT use question nodes for DOB collection.",
      bestPractices: [
        "Be clear about format and purpose",
        "The node handles age validation automatically (min 13 for COPPA)",
      ],
      examples: [
        "What's your date of birth?",
        "Please enter your date of birth (DD/MM/YYYY)",
      ],
      contentFields: "question (optional override)",
      requiredProperties: ["label", "question", "platform"],
      selectionRule: "Always use for DOB collection. Never use question nodes for dates of birth.",
    },
  },
  {
    type: "address",
    icon: User,
    label: "Address",
    description: "Collect and validate user's address (flow template with built-in validation)",
    category: "template",
    platforms: ["web", "whatsapp", "instagram"],
    ai: {
      description: "Collect and validate user's address. Flow template with built-in validation for all address components.",
      whenToUse: "ALWAYS use this node when you need to collect the user's address (especially for delivery flows). Do NOT use question nodes for address collection.",
      bestPractices: [
        "The node handles all component validation automatically",
        "Required for homeDelivery flows",
      ],
      examples: [
        "Please enter your address",
        "Where should we deliver your sample?",
      ],
      contentFields: "question (optional override)",
      requiredProperties: ["label", "question", "platform"],
      selectionRule: "Always use for address collection. Never use question nodes for addresses.",
      dependencies: ["homeDelivery"],
    },
  },

  // FULFILLMENT NODES
  {
    type: "homeDelivery",
    icon: Package,
    label: "At-home Delivery",
    description: "Schedule home delivery",
    category: "fulfillment",
    platforms: ["web", "whatsapp", "instagram"],
    ai: {
      description: "Schedule at-home delivery. Requires address node in the flow. Configured with optimized delivery vendor.",
      whenToUse: "When you need to schedule home delivery of products or samples. MUST be preceded by an address node.",
      bestPractices: [
        "Always include address node before this node",
        "Configure delivery vendor settings",
        "Provide clear delivery expectations",
      ],
      examples: [
        "Schedule your free sample delivery",
        "We'll deliver to your address within 3-5 business days",
      ],
      requiredProperties: ["label", "platform", "description", "vendor", "configuration"],
    },
  },
  {
    type: "trackingNotification",
    icon: PackageSearch,
    label: "Tracking Notification",
    description: "Send delivery tracking updates",
    category: "fulfillment",
    platforms: ["web", "whatsapp", "instagram"],
    ai: {
      description: "Send tracking notification for delivery orders. Provides real-time tracking information and delivery updates. ONLY suggest this node when homeDelivery node exists in the flow.",
      whenToUse: "ONLY use this node when a homeDelivery node exists in the flow. Use this to notify users about their delivery status, provide tracking numbers, and estimated delivery times.",
      bestPractices: [
        "Always include tracking number if available",
        "Provide estimated delivery time",
        "Use clear, reassuring language",
        "Include next steps or contact information if needed",
        "This node should come AFTER homeDelivery node in the flow",
      ],
      examples: [
        "Your order is on the way! Track your delivery in real-time. Tracking: #123456789",
        "Great news! Your package has been shipped. Expected delivery: 3-5 business days",
        "Your delivery is out for delivery today! Track it here: [link]",
      ],
      requiredProperties: ["label", "platform", "message"],
      optionalProperties: ["trackingNumber", "estimatedDelivery"],
      selectionRule: "Only after homeDelivery node exists in the flow.",
      dependencies: ["homeDelivery"],
    },
  },
  {
    type: "event",
    icon: CalendarIcon,
    label: "Event",
    description: "Book event or appointment",
    category: "fulfillment",
    platforms: ["web", "whatsapp", "instagram"],
    ai: {
      description: "Book event or appointment. Configured with event management settings.",
      whenToUse: "When you need to book appointments, events, or schedule meetings.",
      bestPractices: [
        "Collect necessary information before booking",
        "Provide clear event details",
        "Set up reminders and notifications",
      ],
      examples: [
        "Book your consultation appointment",
        "Schedule your product demo",
      ],
      requiredProperties: ["label", "platform", "description", "configuration"],
    },
  },
  {
    type: "retailStore",
    icon: Store,
    label: "Retail Store",
    description: "Find nearby stores",
    category: "fulfillment",
    platforms: ["web", "whatsapp", "instagram"],
    ai: {
      description: "Find nearby retail stores. Configured with location-based search.",
      whenToUse: "When you need to help users find physical store locations.",
      bestPractices: [
        "Use location data if available",
        "Provide store hours and contact info",
        "Show distance and directions",
      ],
      examples: [
        "Find a store near you",
        "Locate our nearest retail location",
      ],
      requiredProperties: ["label", "platform", "description", "configuration"],
    },
  },

  // INTEGRATION NODES
  {
    type: "shopify",
    icon: ShopifyIcon,
    label: "Shopify",
    description: "Connect to Shopify store",
    category: "integration",
    platforms: ["web", "whatsapp", "instagram"],
    ai: {
      ...makeIntegrationAI("Shopify", "e-commerce functionality"),
      bestPractices: ["Configure API credentials", "Set up product sync", "Handle order processing"],
      examples: ["Sync products from Shopify", "Create order in Shopify"],
    },
  },
  {
    type: "metaAudience",
    icon: MetaIcon,
    label: "Meta Audience",
    description: "Sync with Meta audiences",
    category: "integration",
    platforms: ["whatsapp", "instagram"],
    ai: {
      ...makeIntegrationAI("Meta", "advertising and audience building"),
      bestPractices: ["Configure Meta API credentials", "Set up audience segmentation", "Handle privacy compliance"],
      examples: ["Add user to custom audience", "Sync with Meta for retargeting"],
    },
  },
  {
    type: "stripe",
    icon: StripeIcon,
    label: "Stripe",
    description: "Process payments",
    category: "integration",
    platforms: ["web", "whatsapp", "instagram"],
    ai: makeIntegrationAI("Stripe", "payment processing"),
  },
  {
    type: "zapier",
    icon: ZapierIcon,
    label: "Zapier",
    description: "Connect 5000+ apps",
    category: "integration",
    platforms: ["web", "whatsapp", "instagram"],
    ai: makeIntegrationAI("Zapier", "connecting 5000+ apps"),
  },
  {
    type: "google",
    icon: GoogleIcon,
    label: "Google Sheets",
    description: "Sync with Google Sheets",
    category: "integration",
    platforms: ["web", "whatsapp", "instagram"],
    ai: makeIntegrationAI("Google Sheets", "spreadsheet data sync"),
  },
  {
    type: "salesforce",
    icon: SalesforceIcon,
    label: "Salesforce",
    description: "CRM integration",
    category: "integration",
    platforms: ["web", "whatsapp", "instagram"],
    ai: makeIntegrationAI("Salesforce", "CRM integration"),
  },
  {
    type: "mailchimp",
    icon: MailchimpIcon,
    label: "Mailchimp",
    description: "Email marketing",
    category: "integration",
    platforms: ["web", "whatsapp", "instagram"],
    ai: makeIntegrationAI("Mailchimp", "email marketing"),
  },
  {
    type: "twilio",
    icon: TwilioIcon,
    label: "Twilio",
    description: "SMS & Voice",
    category: "integration",
    platforms: ["web", "whatsapp", "instagram"],
    ai: makeIntegrationAI("Twilio", "SMS & voice communication"),
  },
  {
    type: "slack",
    icon: SlackIcon,
    label: "Slack",
    description: "Team notifications",
    category: "integration",
    platforms: ["web", "whatsapp", "instagram"],
    ai: makeIntegrationAI("Slack", "team notifications"),
  },
  {
    type: "airtable",
    icon: AirtableIcon,
    label: "Airtable",
    description: "Database sync",
    category: "integration",
    platforms: ["web", "whatsapp", "instagram"],
    ai: makeIntegrationAI("Airtable", "database sync"),
  },
]

export function getNodesByCategory(category: string, platform: Platform) {
  return NODE_TEMPLATES.filter(
    node => node.category === category && node.platforms.includes(platform)
  )
}

export function getAllCategories() {
  return Object.entries(NODE_CATEGORIES).map(([key, value]) => ({
    key,
    ...value,
  }))
}

/**
 * Resolve the source handle descriptor for a node type.
 * Looks up NODE_TEMPLATES by base type (strips platform prefixes).
 * Returns the sourceHandles descriptor or infers from limits.
 */
function resolveHandleDescriptor(nodeType: string): "none" | "default" | "buttons" | "options" | "conditions" | "api_result" {
  // Strip platform prefixes to find the base template
  const baseType = nodeType
    .replace(/^whatsapp/, "").replace(/^web/, "").replace(/^instagram/, "")
    // lowercase first char to match template types (e.g. "QuickReply" → "quickReply")
    .replace(/^./, c => c.toLowerCase())

  const template = NODE_TEMPLATES.find(t => t.type === nodeType)
    || NODE_TEMPLATES.find(t => t.type === baseType)

  if (template?.limits?.sourceHandles) return template.limits.sourceHandles
  if (template?.limits?.maxConnections === 0) return "none"
  return "default"
}

/**
 * Enumerate all source handle IDs for a node instance based on its type and data.
 * Returns undefined for the single default (unnamed) handle.
 *
 * This is the single source of truth for "what exits does a node have?"
 * Used by the flattener to detect unconnected exits inside templates.
 */
export function getNodeSourceHandles(nodeType: string, data: any): (string | undefined)[] {
  const descriptor = resolveHandleDescriptor(nodeType)

  switch (descriptor) {
    case "none":
      return []

    case "buttons": {
      const buttons: any[] = data?.buttons || []
      const handles: (string | undefined)[] = buttons
        .map((b: any, i: number) => b.id || `button-${i}`)
      // "sync-next" is the fallthrough handle on quickReply/list/templateMessage
      handles.push("sync-next")
      return handles
    }

    case "options": {
      const options: any[] = data?.options || []
      const handles: (string | undefined)[] = options
        .map((o: any, i: number) => o.id || `option-${i}`)
      handles.push("sync-next")
      return handles
    }

    case "conditions": {
      const groups: any[] = data?.conditionGroups || []
      const handles: string[] = groups
        .filter((g: any) => g.id)
        .map((g: any) => g.id)
      handles.push("else")
      return handles
    }

    case "api_result":
      return ["success", "error"]

    case "default":
    default:
      return [undefined]
  }
}
