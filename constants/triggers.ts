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
      id: "web-embedded",
      platform: "web",
      category: "Form Type",
      title: "Embedded",
      description: "Embedded form integration for your website",
      icon: "Layout",
    },
    {
      id: "web-standalone",
      platform: "web",
      category: "Form Type",
      title: "Standalone",
      description: "Dedicated form page with unique URL",
      icon: "Globe",
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

