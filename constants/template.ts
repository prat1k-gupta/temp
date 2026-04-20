export const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "en_US", label: "English (US)" },
  { value: "en_GB", label: "English (UK)" },
  { value: "es", label: "Spanish" },
  { value: "pt_BR", label: "Portuguese (BR)" },
  { value: "hi", label: "Hindi" },
  { value: "ar", label: "Arabic" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "it", label: "Italian" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "zh_CN", label: "Chinese (Simplified)" },
] as const

export const LANGUAGE_CODES = LANGUAGES.map((l) => l.value) as readonly LanguageCode[]
export type LanguageCode = (typeof LANGUAGES)[number]["value"]

export const CATEGORIES = [
  { value: "MARKETING", label: "Marketing" },
  { value: "UTILITY", label: "Utility" },
  { value: "AUTHENTICATION", label: "Authentication" },
] as const

export const CATEGORY_VALUES = CATEGORIES.map((c) => c.value) as readonly CategoryValue[]
export type CategoryValue = (typeof CATEGORIES)[number]["value"]

export const HEADER_TYPES = [
  { value: "none", label: "None" },
  { value: "text", label: "Text" },
  { value: "image", label: "Image" },
  { value: "video", label: "Video" },
  { value: "document", label: "Document" },
] as const

export const HEADER_TYPE_VALUES = HEADER_TYPES.map((h) => h.value) as readonly HeaderTypeValue[]
export type HeaderTypeValue = (typeof HEADER_TYPES)[number]["value"]

export const BUTTON_TYPES = [
  { value: "quick_reply", label: "Quick Reply" },
  { value: "url", label: "URL" },
  { value: "phone_number", label: "Phone Number" },
  { value: "copy_code", label: "Copy Code" },
] as const

export const BUTTON_TYPE_VALUES = BUTTON_TYPES.map((b) => b.value) as readonly ButtonTypeValue[]
export type ButtonTypeValue = (typeof BUTTON_TYPES)[number]["value"]

// Meta-documented limits. Used by schema + builder char counters.
export const TEMPLATE_LIMITS = {
  nameMax: 512,
  displayNameMax: 512,
  headerTextMax: 60,
  bodyMax: 1024,
  footerMax: 60,
  buttonTextMax: 25,
  totalButtonsMax: 10,
  quickReplyMax: 3,
  urlButtonMax: 2,
  phoneButtonMax: 1,
  copyCodeButtonMax: 1,
  headerVariablesMax: 1,
} as const

// Media upload size caps (MB) per header type. Bounded by fasthttp's
// MaxRequestBodySize on the backend (100 MB).
export const MEDIA_SIZE_LIMITS_MB: Record<"image" | "video" | "document", number> = {
  image: 5,
  video: 16,
  document: 100,
}

export const MEDIA_ACCEPT: Record<"image" | "video" | "document", string> = {
  image: "image/jpeg,image/png",
  video: "video/mp4,video/3gpp",
  document: "application/pdf",
}
