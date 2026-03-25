import type { WhatsAppInputType, ValidationConfig } from "@/types"

/**
 * Validation presets for each WhatsApp input type.
 * Used by the converter (Step 7) and Phase 2 super node expansion.
 * Not exposed in UI.
 */
export const VALIDATION_PRESETS: Record<WhatsAppInputType, ValidationConfig> = {
  text: {
    regex: "^.{1,500}$",
    errorMessage: "Please enter a valid response",
    retryOnInvalid: true,
    maxRetries: 3,
  },
  number: {
    regex: "^\\d+$",
    errorMessage: "Please enter a valid number",
    retryOnInvalid: true,
    maxRetries: 3,
  },
  email: {
    regex: "^[a-zA-Z0-9._%+\\-]+@[a-zA-Z0-9.\\-]+\\.[a-zA-Z]{2,}$",
    errorMessage: "Please enter a valid email address",
    retryOnInvalid: true,
    maxRetries: 3,
  },
  phone: {
    regex: "^\\+?[1-9]\\d{6,14}$",
    errorMessage: "Please enter a valid phone number",
    retryOnInvalid: true,
    maxRetries: 3,
  },
  date: {
    regex: "^(0[1-9]|[12]\\d|3[01])/(0[1-9]|1[0-2])/\\d{4}$",
    errorMessage: "Please enter a valid date (DD/MM/YYYY)",
    retryOnInvalid: true,
    maxRetries: 3,
  },
  select: {
    errorMessage: "Please select a valid option",
    retryOnInvalid: true,
    maxRetries: 3,
  },
  button: {
    errorMessage: "Please tap one of the buttons",
    retryOnInvalid: true,
    maxRetries: 3,
  },
  none: {},
  whatsapp_flow: {},
}

/**
 * Derives the WhatsApp input type from a magicflow node type.
 * Input type is IMPLICIT from node type — no dropdown needed.
 */
export function getImplicitInputType(nodeType: string): WhatsAppInputType {
  switch (nodeType) {
    case "whatsappQuestion":
    case "question":
      return "text"
    case "whatsappQuickReply":
    case "quickReply":
      return "button"
    case "whatsappInteractiveList":
    case "interactiveList":
      return "select"
    case "whatsappMessage":
    case "message":
      return "none"
    case "condition":
      return "none"
    case "apiFetch":
      return "none"
    case "transfer":
      return "none"
    case "instagramQuestion":
      return "text"
    case "instagramQuickReply":
      return "button"
    case "instagramDM":
      return "none"
    case "instagramStory":
      return "none"
    case "templateMessage":
      return "button"
    default:
      return "none"
  }
}
