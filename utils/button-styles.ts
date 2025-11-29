import type { Platform } from "@/types"

/**
 * Button Style Utilities
 * 
 * This module provides centralized button styling functions to ensure consistency
 * across all platform nodes (Web, WhatsApp, Instagram).
 * 
 * @example
 * ```tsx
 * import { getButtonItemClasses, getAddButtonClasses } from "@/utils/button-styles"
 * 
 * // In a Quick Reply node
 * <Button
 *   variant="outline"
 *   size="sm"
 *   className={getButtonItemClasses(platform)}
 * >
 *   {button.text}
 * </Button>
 * 
 * // For Add Button
 * <Button
 *   variant="outline"
 *   size="sm"
 *   className={getAddButtonClasses(platform)}
 * >
 *   <Plus /> Add Button
 * </Button>
 * ```
 * 
 * Available Functions:
 * - getButtonItemClasses(platform) - Full-width button items in Quick Reply nodes
 * - getCompactButtonItemClasses(platform) - Compact buttons in Question nodes (flex-1)
 * - getAddButtonClasses(platform) - Full-width "Add Button" with dashed border
 * - getAddButtonFlexClasses(platform) - Flex "Add Button" in Question nodes
 * - getDeleteButtonClasses() - Standard delete button (h-7 w-7)
 * - getDeleteButtonSmallClasses() - Small delete button (h-6 w-6) for list nodes
 * - getGhostButtonClasses(additionalClasses?) - Ghost button with cursor pointer
 * 
 * All functions automatically apply:
 * - Platform-specific colors (blue for web, green for WhatsApp, pink/purple for Instagram)
 * - Dark mode variants
 * - Hover states
 * - Cursor pointer
 * - Text visibility on hover
 */

/**
 * Platform-specific color mappings for buttons
 */
const PLATFORM_COLORS = {
  web: {
    bg: "bg-blue-50/40",
    border: "border-blue-100",
    borderDark: "dark:border-blue-800",
    hoverBg: "hover:bg-blue-50",
    hoverBgDark: "dark:hover:bg-blue-950/20",
    hoverBorder: "hover:border-blue-200",
    hoverBorderDark: "dark:hover:border-blue-700",
  },
  whatsapp: {
    bg: "bg-green-50/40",
    border: "border-green-100",
    borderDark: "dark:border-green-800",
    hoverBg: "hover:bg-green-50",
    hoverBgDark: "dark:hover:bg-green-950/20",
    hoverBorder: "hover:border-green-200",
    hoverBorderDark: "dark:hover:border-green-700",
  },
  instagram: {
    bg: "bg-purple-50/40",
    border: "border-purple-100",
    borderDark: "dark:border-purple-800",
    hoverBg: "hover:bg-purple-50",
    hoverBgDark: "dark:hover:bg-purple-950/20",
    hoverBorder: "hover:border-purple-200",
    hoverBorderDark: "dark:hover:border-purple-700",
  },
} as const

/**
 * Get button classes for a standard button item (used in Quick Reply and Question nodes)
 * @param platform - The platform (web, whatsapp, instagram)
 * @returns Combined className string for button styling
 */
export function getButtonItemClasses(platform: Platform): string {
  const colors = PLATFORM_COLORS[platform]
  return [
    "w-full justify-start text-xs h-7",
    colors.bg,
    colors.border,
    colors.borderDark,
    colors.hoverBg,
    colors.hoverBgDark,
    colors.hoverBorder,
    colors.hoverBorderDark,
    "text-card-foreground",
    "[&:hover]:text-foreground",
    "transition-colors",
    "cursor-pointer",
  ].join(" ")
}

/**
 * Get button classes for a compact button item (used in Question nodes with flex-1)
 * @param platform - The platform (web, whatsapp, instagram)
 * @returns Combined className string for button styling
 */
export function getCompactButtonItemClasses(platform: Platform): string {
  const colors = PLATFORM_COLORS[platform]
  return [
    "flex-1 h-7 justify-start text-xs font-normal",
    colors.bg,
    colors.border,
    colors.borderDark,
    colors.hoverBg,
    colors.hoverBgDark,
    colors.hoverBorder,
    colors.hoverBorderDark,
    "[&:hover]:text-foreground",
    "cursor-pointer",
  ].join(" ")
}

/**
 * Get button classes for an "Add Button" or "Add Option" button
 * @param platform - The platform (web, whatsapp, instagram)
 * @returns Combined className string for add button styling with dashed border
 */
export function getAddButtonClasses(platform: Platform): string {
  const colors = PLATFORM_COLORS[platform]
  return [
    "w-full justify-center text-xs h-7",
    "border border-dashed",
    colors.border,
    colors.borderDark,
    "hover:border-solid",
    colors.hoverBorder,
    colors.hoverBorderDark,
    colors.hoverBg,
    colors.hoverBgDark,
    "[&:hover]:text-foreground",
    "transition-colors",
    "text-muted-foreground",
    "cursor-pointer",
  ].join(" ")
}

/**
 * Get button classes for an "Add Button" in a flex container (used in Question nodes)
 * @param platform - The platform (web, whatsapp, instagram)
 * @returns Combined className string for add button styling with dashed border
 */
export function getAddButtonFlexClasses(platform: Platform): string {
  const colors = PLATFORM_COLORS[platform]
  return [
    "flex-1 h-7 px-2 text-xs gap-1",
    "border border-dashed",
    colors.border,
    colors.borderDark,
    "hover:border-solid",
    colors.hoverBorder,
    colors.hoverBorderDark,
    colors.hoverBg,
    colors.hoverBgDark,
    "[&:hover]:text-foreground",
    "transition-colors",
    "text-muted-foreground",
    "cursor-pointer",
  ].join(" ")
}

/**
 * Get button classes for a delete/remove button
 * @returns Combined className string for delete button styling
 */
export function getDeleteButtonClasses(): string {
  return "h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 cursor-pointer"
}

/**
 * Get button classes for a small delete button (used in list nodes)
 * @returns Combined className string for small delete button styling
 */
export function getDeleteButtonSmallClasses(): string {
  return "h-6 w-6 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 cursor-pointer"
}

/**
 * Get button classes for a ghost button with cursor pointer
 * @param additionalClasses - Optional additional classes to append
 * @returns Combined className string
 */
export function getGhostButtonClasses(additionalClasses: string = ""): string {
  return `cursor-pointer ${additionalClasses}`.trim()
}

