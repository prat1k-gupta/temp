import { BasePlatform, type PlatformConstraints, type NodeType } from "./base-platform"

export class WhatsAppPlatform extends BasePlatform {
  constraints: PlatformConstraints = {
    name: "whatsapp",
    displayName: "WhatsApp",
    messageMaxLength: 160,
    buttonTextMaxLength: 20,
    maxQuickReplies: 3,
    maxListItems: 10,
    supportsRichText: false,
    supportsImages: true,
    supportsFiles: true,
    colors: {
      primary: "#25d366",
      secondary: "#128c7e",
      accent: "#075e54",
    },
  }

  availableNodes: NodeType[] = [
    {
      id: "whatsapp-message",
      name: "Message",
      category: "output",
      icon: "💬",
      description: "Send a text message",
      platforms: ["whatsapp"],
      defaultData: {
        text: "Hello! How can I help you?",
      },
    },
    {
      id: "whatsapp-quick-reply",
      name: "Quick Replies",
      category: "input",
      icon: "⚡",
      description: "Up to 3 quick reply buttons",
      platforms: ["whatsapp"],
      defaultData: {
        text: "Choose an option:",
        options: [{ label: "Option 1", value: "option1" }],
      },
    },
    {
      id: "whatsapp-list",
      name: "List Message",
      category: "input",
      icon: "📋",
      description: "Interactive list with up to 10 items",
      platforms: ["whatsapp"],
      defaultData: {
        text: "Choose from the list:",
        buttonText: "View Options",
        items: [{ title: "Option 1", description: "Description", value: "option1" }],
      },
    },
  ]
}
