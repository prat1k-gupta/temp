"use client"
import { MessageCircle, Bot, Zap, GitBranch, Shuffle, Clock, X } from "lucide-react"

interface ConnectionMenuProps {
  isOpen: boolean
  position: { x: number; y: number }
  onClose: () => void
  onSelectNodeType: (nodeType: string) => void
  platform: "web" | "whatsapp" | "instagram"
}

export function ConnectionMenu({ isOpen, position, onClose, onSelectNodeType, platform }: ConnectionMenuProps) {
  if (!isOpen) return null

  const getMenuItemsForPlatform = () => {
    const baseItems = [
      { type: "question", label: "Message", icon: MessageCircle, color: "text-blue-600" },
      { type: "quickReply", label: "Quick Reply", icon: Zap, color: "text-green-600" },
    ]

    switch (platform) {
      case "whatsapp":
        return [
          ...baseItems,
          { type: "whatsappList", label: "List Message", icon: GitBranch, color: "text-green-600" },
          { type: "ai-step", label: "AI Step", icon: Bot, color: "text-purple-600", badge: "AI" },
          { type: "condition", label: "Condition", icon: GitBranch, color: "text-orange-600" },
          { type: "delay", label: "Smart Delay", icon: Clock, color: "text-indigo-600" },
        ]
      case "instagram":
        return [
          ...baseItems,
          { type: "ai-step", label: "AI Step", icon: Bot, color: "text-purple-600", badge: "AI" },
          { type: "condition", label: "Condition", icon: GitBranch, color: "text-orange-600" },
        ]
      case "web":
      default:
        return [
          ...baseItems,
          { type: "ai-step", label: "AI Step", icon: Bot, color: "text-purple-600", badge: "AI" },
          { type: "condition", label: "Condition", icon: GitBranch, color: "text-orange-600" },
          { type: "randomizer", label: "Randomizer", icon: Shuffle, color: "text-pink-600" },
        ]
    }
  }

  const menuItems = getMenuItemsForPlatform()

  return (
    <div
      className="connection-menu fixed bg-white border border-gray-200 rounded-lg shadow-xl py-2 z-50 min-w-[200px] max-h-[400px] overflow-y-auto"
      style={{
        left: Math.min(position.x, window.innerWidth - 220),
        top: Math.min(position.y, window.innerHeight - 300),
      }}
    >
      {menuItems.map((item) => (
        <button
          key={item.type}
          className="w-full px-4 py-3 text-left text-sm hover:bg-gray-50 transition-colors flex items-center gap-3 group"
          onClick={() => onSelectNodeType(item.type)}
        >
          <item.icon className={`w-4 h-4 ${item.color}`} />
          <span className="flex-1 text-gray-700 group-hover:text-gray-900">+ {item.label}</span>
          {item.badge && (
            <span className="bg-gray-900 text-white text-xs px-2 py-1 rounded font-medium">{item.badge}</span>
          )}
        </button>
      ))}
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
