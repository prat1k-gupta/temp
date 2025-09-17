import { BasePlatform, type PlatformConstraints, type NodeType } from "./base-platform"

export class WebPlatform extends BasePlatform {
  constraints: PlatformConstraints = {
    name: "web",
    displayName: "Web Form",
    messageMaxLength: 500,
    buttonTextMaxLength: 50,
    maxQuickReplies: 10,
    maxListItems: 20,
    supportsRichText: true,
    supportsImages: true,
    supportsFiles: true,
    colors: {
      primary: "#3b82f6",
      secondary: "#64748b",
      accent: "#10b981",
    },
  }

  availableNodes: NodeType[] = [
    {
      id: "web-form",
      name: "Form Input",
      category: "input",
      icon: "📝",
      description: "Collect user input with form fields",
      platforms: ["web"],
      defaultData: {
        title: "Form Input",
        fields: [{ type: "text", label: "Name", required: true }],
      },
    },
    {
      id: "web-button",
      name: "Button Group",
      category: "input",
      icon: "🔘",
      description: "Multiple choice buttons",
      platforms: ["web"],
      defaultData: {
        title: "Choose an option",
        buttons: [{ label: "Option 1", value: "option1" }],
      },
    },
    {
      id: "web-display",
      name: "Rich Display",
      category: "output",
      icon: "📄",
      description: "Display rich content with images and formatting",
      platforms: ["web"],
      defaultData: {
        title: "Information",
        content: "Your content here...",
        showImage: false,
      },
    },
  ]
}
