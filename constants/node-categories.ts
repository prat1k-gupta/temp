import { MessageCircle, MessageSquare, List, User, Mail, Calendar, MapPin, Package, Store, Calendar as CalendarIcon, Zap, GitBranch, PackageSearch } from "lucide-react"
import { ShopifyIcon, MetaIcon, GoogleIcon, StripeIcon, ZapierIcon, SalesforceIcon, MailchimpIcon, TwilioIcon, SlackIcon, AirtableIcon } from "@/components/service-icons"
import type { Platform } from "@/types"

export interface NodeTemplate {
  type: string
  icon: any
  label: string
  description: string
  category: "interaction" | "information" | "fulfillment" | "integration" | "logic"
  isSuperNode?: boolean // Can be double-clicked to see sub-nodes
  platforms: Platform[] // Which platforms support this node
  badge?: string // Optional badge text
}

export const NODE_CATEGORIES = {
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
  },
  {
    type: "quickReply",
    icon: MessageSquare,
    label: "Quick Reply",
    description: "Question with button options",
    category: "interaction",
    platforms: ["web", "whatsapp", "instagram"],
  },
  {
    type: "interactiveList",
    icon: List,
    label: "List",
    description: "Interactive list menu",
    category: "interaction",
    platforms: ["whatsapp"],
  },
  {
    type: "whatsappMessage",
    icon: MessageCircle,
    label: "WhatsApp Message",
    description: "Send a one-way message (NOT for questions — use question type instead)",
    category: "interaction",
    platforms: ["whatsapp"],
  },
  {
    type: "instagramDM",
    icon: MessageCircle,
    label: "Instagram DM",
    description: "Send a one-way DM (NOT for questions — use question type instead)",
    category: "interaction",
    platforms: ["instagram"],
  },
  {
    type: "instagramStory",
    icon: MessageCircle,
    label: "Instagram Story",
    description: "Add story reply prompt",
    category: "interaction",
    platforms: ["instagram"],
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
  },
  
  // INFORMATION NODES (Super Nodes)
  {
    type: "name",
    icon: User,
    label: "Name",
    description: "Collect and validate name",
    category: "information",
    isSuperNode: true,
    platforms: ["web", "whatsapp", "instagram"],
    badge: "Validation",
  },
  {
    type: "email",
    icon: Mail,
    label: "Email",
    description: "Collect and validate email",
    category: "information",
    isSuperNode: true,
    platforms: ["web", "whatsapp", "instagram"],
    badge: "Validation",
  },
  {
    type: "dob",
    icon: Calendar,
    label: "DOB",
    description: "Collect and validate date of birth",
    category: "information",
    isSuperNode: true,
    platforms: ["web", "whatsapp", "instagram"],
    badge: "Validation",
  },
  {
    type: "address",
    icon: MapPin,
    label: "Address",
    description: "Collect and validate address",
    category: "information",
    isSuperNode: true,
    platforms: ["web", "whatsapp", "instagram"],
    badge: "Validation",
  },
  
  // FULFILLMENT NODES
  {
    type: "homeDelivery",
    icon: Package,
    label: "At-home Delivery",
    description: "Schedule home delivery",
    category: "fulfillment",
    platforms: ["web", "whatsapp", "instagram"],
  },
  {
    type: "trackingNotification",
    icon: PackageSearch,
    label: "Tracking Notification",
    description: "Send delivery tracking updates",
    category: "fulfillment",
    platforms: ["web", "whatsapp", "instagram"],
  },
  {
    type: "event",
    icon: CalendarIcon,
    label: "Event",
    description: "Book event or appointment",
    category: "fulfillment",
    platforms: ["web", "whatsapp", "instagram"],
  },
  {
    type: "retailStore",
    icon: Store,
    label: "Retail Store",
    description: "Find nearby stores",
    category: "fulfillment",
    platforms: ["web", "whatsapp", "instagram"],
  },
  
  // INTEGRATION NODES
  {
    type: "shopify",
    icon: ShopifyIcon,
    label: "Shopify",
    description: "Connect to Shopify store",
    category: "integration",
    platforms: ["web", "whatsapp", "instagram"],
  },
  {
    type: "metaAudience",
    icon: MetaIcon,
    label: "Meta Audience",
    description: "Sync with Meta audiences",
    category: "integration",
    platforms: ["whatsapp", "instagram"],
  },
  {
    type: "stripe",
    icon: StripeIcon,
    label: "Stripe",
    description: "Process payments",
    category: "integration",
    platforms: ["web", "whatsapp", "instagram"],
  },
  {
    type: "zapier",
    icon: ZapierIcon,
    label: "Zapier",
    description: "Connect 5000+ apps",
    category: "integration",
    platforms: ["web", "whatsapp", "instagram"],
  },
  {
    type: "google",
    icon: GoogleIcon,
    label: "Google Sheets",
    description: "Sync with Google Sheets",
    category: "integration",
    platforms: ["web", "whatsapp", "instagram"],
  },
  {
    type: "salesforce",
    icon: SalesforceIcon,
    label: "Salesforce",
    description: "CRM integration",
    category: "integration",
    platforms: ["web", "whatsapp", "instagram"],
  },
  {
    type: "mailchimp",
    icon: MailchimpIcon,
    label: "Mailchimp",
    description: "Email marketing",
    category: "integration",
    platforms: ["web", "whatsapp", "instagram"],
  },
  {
    type: "twilio",
    icon: TwilioIcon,
    label: "Twilio",
    description: "SMS & Voice",
    category: "integration",
    platforms: ["web", "whatsapp", "instagram"],
  },
  {
    type: "slack",
    icon: SlackIcon,
    label: "Slack",
    description: "Team notifications",
    category: "integration",
    platforms: ["web", "whatsapp", "instagram"],
  },
  {
    type: "airtable",
    icon: AirtableIcon,
    label: "Airtable",
    description: "Database sync",
    category: "integration",
    platforms: ["web", "whatsapp", "instagram"],
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

