import type { Node, Edge } from "@xyflow/react"
import type { Platform, TemplateAIMetadata } from "@/types"

export interface DefaultTemplateDefinition {
  id: string
  name: string
  description: string
  platform: Platform
  aiMetadata?: TemplateAIMetadata
  nodes: Node[]
  edges: Edge[]
}

/**
 * Pre-built default templates that ship with Magic Flow.
 * These replace the old super nodes (name, email, dob, address).
 * Each contains a small internal flow with a question node and validation.
 */
export const DEFAULT_TEMPLATES: DefaultTemplateDefinition[] = [
  {
    id: "default-template-name",
    name: "Name",
    description: "Collect and validate user's name",
    platform: "whatsapp",
    aiMetadata: {
      description: "Collects the user's full name with validation",
      whenToUse: "When you need to collect the user's name",
      selectionRule: "Always use for name collection — includes built-in validation",
    },
    nodes: [
      {
        id: "int-name-q",
        type: "whatsappQuestion",
        position: { x: 100, y: 50 },
        data: {
          platform: "whatsapp",
          label: "Ask Name",
          question: "What's your name?",
          storeAs: "user_name",
          validationRules: {
            minLength: 2,
            maxLength: 50,
            allowNumbers: false,
            required: true,
          },
        },
      },
    ],
    edges: [],
  },
  {
    id: "default-template-email",
    name: "Email",
    description: "Collect and validate user's email address",
    platform: "whatsapp",
    aiMetadata: {
      description: "Collects and validates the user's email address",
      whenToUse: "When you need to collect the user's email",
      selectionRule: "Always use for email collection — includes format and domain validation",
    },
    nodes: [
      {
        id: "int-email-q",
        type: "whatsappQuestion",
        position: { x: 100, y: 50 },
        data: {
          platform: "whatsapp",
          label: "Ask Email",
          question: "What's your email address?",
          storeAs: "user_email",
          validationRules: {
            format: "RFC 5322",
            checkDomain: true,
            blockDisposable: true,
            required: true,
          },
        },
      },
    ],
    edges: [],
  },
  {
    id: "default-template-dob",
    name: "DOB",
    description: "Collect and validate date of birth",
    platform: "whatsapp",
    aiMetadata: {
      description: "Collects and validates the user's date of birth",
      whenToUse: "When you need to collect date of birth with age validation",
      selectionRule: "Always use for DOB collection — includes format and age validation",
    },
    nodes: [
      {
        id: "int-dob-q",
        type: "whatsappQuestion",
        position: { x: 100, y: 50 },
        data: {
          platform: "whatsapp",
          label: "Ask DOB",
          question: "What's your date of birth? (DD/MM/YYYY)",
          storeAs: "user_dob",
          validationRules: {
            minAge: 13,
            maxAge: 120,
            format: "DD/MM/YYYY",
            required: true,
          },
        },
      },
    ],
    edges: [],
  },
  {
    id: "default-template-address",
    name: "Address",
    description: "Collect and validate user's address",
    platform: "whatsapp",
    aiMetadata: {
      description: "Collects and validates the user's full address with components",
      whenToUse: "When you need to collect the user's address for shipping or delivery",
      selectionRule: "Always use for address collection — includes postal code and geography validation",
    },
    nodes: [
      {
        id: "int-addr-q",
        type: "whatsappQuestion",
        position: { x: 100, y: 50 },
        data: {
          platform: "whatsapp",
          label: "Ask Address",
          question: "Please enter your address",
          storeAs: "user_address",
          addressComponents: ["House Number", "Society/Block", "Area", "City"],
          validationRules: {
            geography: "pan-india",
            required: true,
            validatePostalCode: true,
          },
        },
      },
    ],
    edges: [],
  },
]

/** localStorage key for pinned template IDs */
export const PINNED_TEMPLATES_KEY = "magic-flow-pinned-templates"

/** Get pinned template IDs from localStorage */
export function getPinnedTemplates(): string[] {
  if (typeof window === "undefined") return []
  try {
    const stored = localStorage.getItem(PINNED_TEMPLATES_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

/** Set pinned template IDs in localStorage */
export function setPinnedTemplates(ids: string[]): void {
  if (typeof window === "undefined") return
  localStorage.setItem(PINNED_TEMPLATES_KEY, JSON.stringify(ids))
}
