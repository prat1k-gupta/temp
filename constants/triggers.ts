import type { Platform } from "@/types"

export interface Trigger {
  id: string
  platform: Platform
  category: string
  title: string
  description: string
  icon?: string
}

export const PLATFORM_TRIGGERS: Record<Platform, Trigger[]> = {
  web: [
    {
      id: "web-page-load",
      platform: "web",
      category: "Page Events",
      title: "User visits page",
      description: "Triggered when a user lands on your website",
    },
    {
      id: "web-button-click",
      platform: "web",
      category: "User Actions",
      title: "User clicks a button",
      description: "Triggered when user clicks a specific button",
    },
    {
      id: "web-form-submit",
      platform: "web",
      category: "User Actions",
      title: "User submits a form",
      description: "Triggered when user submits a form",
    },
  ],
  whatsapp: [
    {
      id: "whatsapp-message",
      platform: "whatsapp",
      category: "WhatsApp Message",
      title: "User sends a message",
      description: "Triggered when user sends any message",
    },
    {
      id: "whatsapp-ctwa",
      platform: "whatsapp",
      category: "Click-to-WhatsApp Ad",
      title: "User clicks a CTWA Ad",
      description: "Triggered when user clicks a WhatsApp ad",
    },
    {
      id: "whatsapp-url",
      platform: "whatsapp",
      category: "WhatsApp URL",
      title: "User clicks a link",
      description: "Triggered when user clicks a WhatsApp link",
    },
  ],
  instagram: [
    {
      id: "instagram-comment",
      platform: "instagram",
      category: "Post or Reel Comments",
      title: "User comments on your Post or Reel",
      description: "Triggered when user comments on your content",
    },
    {
      id: "instagram-story-reply",
      platform: "instagram",
      category: "Story Reply",
      title: "User replies to your Story",
      description: "Triggered when user replies to your story",
    },
    {
      id: "instagram-message",
      platform: "instagram",
      category: "Instagram Message",
      title: "User sends a message",
      description: "Triggered when user sends a DM",
    },
    {
      id: "instagram-ad",
      platform: "instagram",
      category: "Instagram Ads",
      title: "User clicks an Instagram Ad",
      description: "Triggered when user clicks your ad",
    },
    {
      id: "instagram-live",
      platform: "instagram",
      category: "Live Comments",
      title: "User comments on your Live",
      description: "Triggered when user comments on live stream",
    },
    {
      id: "instagram-ref",
      platform: "instagram",
      category: "Instagram Ref URL",
      title: "User clicks a referral link",
      description: "Triggered when user clicks a referral link",
    },
  ],
}

export function getTriggersByPlatform(platform: Platform): Trigger[] {
  return PLATFORM_TRIGGERS[platform] || []
}

export function getTriggerById(triggerId: string): Trigger | undefined {
  for (const platform in PLATFORM_TRIGGERS) {
    const trigger = PLATFORM_TRIGGERS[platform as Platform].find(t => t.id === triggerId)
    if (trigger) return trigger
  }
  return undefined
}

