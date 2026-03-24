/**
 * System variables — auto-injected into every flow session by fs-chat.
 * These are read-only and always available via the {{system.*}} prefix.
 *
 * IMPORTANT: Keep in sync with fs-chat's startFlow() in chatbot_processor.go
 * which injects sessionData["system"] = { contact_name, phone_number }
 */
export const SYSTEM_VARIABLES = [
  {
    key: "system.contact_name",
    label: "contact_name",
    description: "WhatsApp/Instagram profile name",
  },
  {
    key: "system.phone_number",
    label: "phone_number",
    description: "Contact's phone number",
  },
] as const

export const SYSTEM_VARIABLE_PREFIX = "system."

export const SYSTEM_VARIABLE_KEYS = new Set(SYSTEM_VARIABLES.map((v) => v.key))
