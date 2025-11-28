"use client"
import { MessageCircle, Zap, List, X } from "lucide-react"
import type { Platform } from "@/types"
import { 
  getNodeLabel, 
  getPlatformTextColor,
  platformSupportsNodeType 
} from "@/utils/platform-labels"

interface ConnectionMenuProps {
  isOpen: boolean
  position: { x: number; y: number }
  onClose: () => void
  onSelectNodeType: (nodeType: string) => void
  platform: Platform
}

interface MenuItem {
  type: string
  getLabel: (platform: Platform) => string
  icon: any
  getColor: (platform: Platform) => string
  isAvailable: (platform: Platform) => boolean
}

const BASE_MENU_ITEMS: MenuItem[] = [
  {
    type: "question",
    getLabel: (platform) => getNodeLabel("question", platform),
    icon: MessageCircle,
    getColor: (platform) => getPlatformTextColor(platform, "primary"),
    isAvailable: () => true,
  },
  {
    type: "quickReply",
    getLabel: (platform) => getNodeLabel("quickReply", platform),
    icon: Zap,
    getColor: (platform) => getPlatformTextColor(platform, "secondary"),
    isAvailable: () => true,
  },
  {
    type: "whatsappList",
    getLabel: (platform) => getNodeLabel("list", platform),
    icon: List,
    getColor: (platform) => getPlatformTextColor(platform, "tertiary"),
    isAvailable: (platform) => platformSupportsNodeType(platform, "whatsappList"),
  },
  // Future nodes can be added here:
  // { type: "ai-step", label: "AI Step", icon: Bot, color: "text-purple-600", badge: "AI" },
  // { type: "condition", label: "Condition", icon: GitBranch, color: "text-orange-600" },
]

export function ConnectionMenu({ isOpen, position, onClose, onSelectNodeType, platform }: ConnectionMenuProps) {
  if (!isOpen) return null

  const menuItems = BASE_MENU_ITEMS.filter(item => item.isAvailable(platform))

  return (
    <div
      className="connection-menu fixed bg-white border border-gray-200 rounded-lg shadow-xl py-2 z-50 min-w-[200px] max-h-[400px] overflow-y-auto"
      style={{
        left: Math.min(position.x, window.innerWidth - 220),
        top: Math.min(position.y, window.innerHeight - 300),
      }}
    >
      {menuItems.map((item) => {
        const ItemIcon = item.icon
        const label = item.getLabel(platform)
        const color = item.getColor(platform)
        
        return (
          <button
            key={item.type}
            className="w-full px-4 py-3 text-left text-sm hover:bg-gray-50 transition-colors flex items-center gap-3 group"
            onClick={() => onSelectNodeType(item.type)}
          >
            <ItemIcon className={`w-4 h-4 ${color}`} />
            <span className="flex-1 text-gray-700 group-hover:text-gray-900">+ {label}</span>
          </button>
        )
      })}
      <div className="border-t border-gray-200 mt-2 pt-2">
        <button
          className="w-full px-4 py-2 text-left text-sm text-gray-500 hover:bg-gray-50 transition-colors flex items-center gap-3"
          onClick={onClose}
        >
          <X className="w-4 h-4" />
          Cancel
        </button>
      </div>
    </div>
  )
}
