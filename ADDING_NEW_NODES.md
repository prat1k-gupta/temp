# 🚀 Adding New Nodes - Complete Guide

A comprehensive step-by-step guide for adding new node types to Magic Flow.

---

## 📋 Prerequisites

Before you start, make sure you understand:
- React components and TypeScript
- The platform system (Web, WhatsApp, Instagram)
- Node limits and validation system

**Recommended Reading:**
- `constants/node-limits/README.md` - Node limits system
- `ARCHITECTURE.md` - Overall architecture
- `NODE_LIMITS_REFACTOR.md` - Node limits structure

---

## 🎯 Example: Adding a "Media Node"

We'll create a **Media Node** that allows users to send images/videos. This node will be:
- ✅ Available on WhatsApp
- ✅ Available on Instagram  
- ❌ Not available on Web

**Node Features:**
- Upload media file
- Add caption (max 200 chars for WhatsApp, 150 for Instagram)
- Select media type (image/video)
- Single output connection

---

## 📝 Step-by-Step Guide

### Step 1: Define Node Limits

**File:** `constants/node-limits/config.ts`

Add your node configuration in the `getNodeLimits()` switch statement:

```typescript
case "media":
  return {
    // Caption field
    text: {
      min: 0,
      max: platform === "whatsapp" ? 200 : 150,
      placeholder: "Add a caption for your media...",
    },
    // Connection limits
    maxConnections: 1,
    allowMultipleOutputs: false,
    allowMultipleInputs: true,
  }
```

Also add to the `getBaseNodeType()` function:

```typescript
// In getBaseNodeType()
if (nodeType.includes("Media") || nodeType === "media") {
  return "media"
}
```

**Location in file:** Around line 200

---

### Step 2: Update Platform Labels

**File:** `utils/platform-labels.ts`

Add labels for your node in the `NODE_TYPE_LABELS` object:

```typescript
export const NODE_TYPE_LABELS: Record<string, Record<Platform, string>> = {
  // ... existing labels ...
  media: {
    web: "Web Media",           // Even if not used
    whatsapp: "WhatsApp Media",
    instagram: "Instagram Media",
  },
}
```

Add platform support check in `platformSupportsNodeType()`:

```typescript
export function platformSupportsNodeType(platform: Platform, nodeType: string): boolean {
  if (nodeType === "whatsappList") {
    return platform === "whatsapp" || platform === "instagram"
  }
  
  // Add your node
  if (nodeType === "media") {
    return platform === "whatsapp" || platform === "instagram"
  }
  
  return true
}
```

**Location in file:** Lines 30-60 for labels, lines 100-110 for support check

---

### Step 3: Create Node Component

**File:** `components/nodes/whatsapp/whatsapp-media-node.tsx`

Create a new component file:

```typescript
"use client"

import { Handle, Position } from "@xyflow/react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Image, Video, Upload, Edit3 } from "lucide-react"
import { useState, useEffect } from "react"
import { getNodeLimits } from "@/constants"
import type { Platform } from "@/types"

export function WhatsAppMediaNode({ data, selected }: { data: any; selected?: boolean }) {
  const [isEditingCaption, setIsEditingCaption] = useState(false)
  const [editingCaptionValue, setEditingCaptionValue] = useState("")
  const [mediaType, setMediaType] = useState<"image" | "video">(data.mediaType || "image")

  useEffect(() => {
    if (!isEditingCaption) {
      setEditingCaptionValue(data.caption || "")
    }
  }, [data.caption, isEditingCaption])

  const platform = (data.platform || "whatsapp") as Platform
  const nodeType = "media"
  const nodeLimits = getNodeLimits(nodeType, platform)
  const maxLength = nodeLimits.text?.max || 200

  const isOverLimit = (text: string) => {
    return text.length > maxLength
  }

  const startEditingCaption = () => {
    setEditingCaptionValue(data.caption || "")
    setIsEditingCaption(true)
  }

  const finishEditingCaption = () => {
    if (data.onNodeUpdate) {
      data.onNodeUpdate(data.id, { ...data, caption: editingCaptionValue })
    }
    setIsEditingCaption(false)
  }

  const handleMediaTypeChange = (type: "image" | "video") => {
    setMediaType(type)
    if (data.onNodeUpdate) {
      data.onNodeUpdate(data.id, { ...data, mediaType: type })
    }
  }

  return (
    <div className="relative">
      <Card
        className={\`min-w-[260px] max-w-[300px] bg-white border-green-100 shadow-sm transition-all duration-200 hover:shadow-md hover:border-green-200 \${
          selected ? "ring-1 ring-green-300/50 shadow-md" : ""
        }\`}
      >
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center gap-2">
            {/* WhatsApp Icon */}
            <div className="w-5 h-5 bg-green-500 rounded-md flex items-center justify-center flex-shrink-0">
              <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488" />
              </svg>
            </div>
            <div className="font-medium text-gray-700 text-sm">
              {data.label || "Media"}
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="pt-0 space-y-3 pb-8 px-4">
          {/* Media Type Selector */}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={mediaType === "image" ? "default" : "outline"}
              onClick={() => handleMediaTypeChange("image")}
              className="flex-1"
            >
              <Image className="w-3 h-3 mr-1" />
              Image
            </Button>
            <Button
              size="sm"
              variant={mediaType === "video" ? "default" : "outline"}
              onClick={() => handleMediaTypeChange("video")}
              className="flex-1"
            >
              <Video className="w-3 h-3 mr-1" />
              Video
            </Button>
          </div>

          {/* Media Upload Placeholder */}
          <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center">
            <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
            <p className="text-xs text-gray-500">Upload {mediaType}</p>
          </div>

          {/* Caption Input */}
          {isEditingCaption ? (
            <div className="space-y-2">
              <Textarea
                value={editingCaptionValue}
                onChange={(e) => setEditingCaptionValue(e.target.value)}
                onBlur={finishEditingCaption}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    finishEditingCaption()
                  }
                }}
                className={\`text-sm min-h-[60px] resize-none border-green-200 focus:border-green-300 \${
                  isOverLimit(editingCaptionValue) ? "border-red-300" : ""
                }\`}
                placeholder={nodeLimits.text?.placeholder || "Add a caption..."}
                autoFocus
              />
              <div className="flex justify-between items-center">
                <span
                  className={\`text-xs \${
                    isOverLimit(editingCaptionValue) ? "text-red-500" : "text-gray-400"
                  }\`}
                >
                  {editingCaptionValue.length}/{maxLength}
                </span>
                {isOverLimit(editingCaptionValue) && (
                  <Badge variant="destructive" className="text-xs h-5">
                    Too long
                  </Badge>
                )}
              </div>
            </div>
          ) : (
            <div
              className="text-sm text-gray-600 cursor-pointer hover:bg-green-50/30 px-2 py-1.5 rounded border border-transparent hover:border-green-100 transition-colors"
              onClick={startEditingCaption}
            >
              {data.caption || "Click to add caption..."}
            </div>
          )}
        </CardContent>

        <Handle
          type="target"
          position={Position.Left}
          className="w-3 h-3 bg-green-500 border-2 border-white opacity-100 hover:scale-110 transition-transform"
        />

        <div className="absolute bottom-2 right-3 flex items-center gap-1.5">
          <span className="text-[10px] text-gray-400 font-medium">Next</span>
          <Handle
            type="source"
            position={Position.Right}
            className="w-3 h-3 bg-green-500 border-2 border-white opacity-100 hover:scale-110 transition-transform relative"
            style={{ position: "relative", transform: "none", right: "auto", top: "auto" }}
          />
        </div>
      </Card>
    </div>
  )
}
```

**💡 Pro Tips:**
- Use `getNodeLimits()` for validation
- Follow existing node patterns for consistency
- Add platform-specific icons (WhatsApp green, Instagram gradient)
- Use proper TypeScript types

---

### Step 4: Create Instagram Variant (Optional)

**File:** `components/nodes/instagram/instagram-media-node.tsx`

If you need platform-specific UI, create an Instagram version:

```typescript
// Similar to WhatsApp version but with Instagram styling
// Change border colors: border-green-100 → border-pink-100
// Change icon colors: bg-green-500 → bg-gradient-to-r from-purple-500 to-pink-500
// Use Instagram icon instead of WhatsApp icon
```

**OR** use a shared component with conditional styling based on `data.platform`.

---

### Step 5: Register Node in App

**File:** `app/page.tsx`

#### 5a. Import your component (around line 24-36):

```typescript
// ... existing imports ...
import { WhatsAppMediaNode } from "@/components/nodes/whatsapp/whatsapp-media-node"
import { InstagramMediaNode } from "@/components/nodes/instagram/instagram-media-node" // if separate
```

#### 5b. Register in `nodeTypes` object (around line 90-111):

```typescript
const nodeTypes = {
  start: StartNode,
  comment: CommentNode,
  // ... existing types ...
  
  // Add your nodes
  whatsappMedia: WhatsAppMediaNode,
  instagramMedia: InstagramMediaNode, // or WhatsAppMediaNode if shared
  
  // Instagram specific nodes
  instagramQuestion: InstagramQuestionNode,
  // ...
}
```

---

### Step 6: Update Node Creation Logic

**File:** `utils/node-operations.ts`

Add your node to the `createNode()` function:

```typescript
export const createNode = (
  nodeType: string,
  platform: Platform,
  position: { x: number; y: number },
  id?: string
): Node => {
  const nodeId = id || generateNodeId(nodeType)
  const specificType = getPlatformSpecificNodeType(nodeType, platform)
  
  // ... existing switch cases ...
  
  // Add your node
  if (nodeType === "media") {
    return {
      id: nodeId,
      type: specificType,
      position,
      data: {
        id: nodeId,
        label: getPlatformSpecificLabel("media", platform),
        caption: "",
        mediaType: "image",
        mediaUrl: null,
        platform,
        onNodeUpdate: (id: string, updates: any) => {
          // Will be replaced by actual handler
        },
      },
    }
  }
  
  // ... rest of function
}
```

**Location:** Around line 35-60

---

### Step 7: Add to Node Type Mappings

**File:** `constants/node-types.ts`

Add your node to the mappings:

```typescript
export const NODE_TYPE_MAPPINGS: Record<string, Record<Platform, string>> = {
  question: {
    web: "webQuestion",
    whatsapp: "whatsappQuestion",
    instagram: "instagramQuestion"
  },
  // ... existing mappings ...
  
  // Add media node
  media: {
    web: "media",                  // Not used but defined for completeness
    whatsapp: "whatsappMedia",
    instagram: "instagramMedia"
  }
} as const

export const NODE_LABELS: Record<string, string> = {
  // ... existing labels ...
  media: "Media",
  whatsappMedia: "WhatsApp Media",
  instagramMedia: "Instagram Media",
}

export const NODE_CONTENT: Record<string, string> = {
  // ... existing content ...
  media: "Send images or videos",
  whatsappMedia: "Send WhatsApp media",
  instagramMedia: "Send Instagram media",
}
```

**Location:** Lines 10-40

---

### Step 8: Add to Sidebar

**File:** `components/node-sidebar.tsx`

Add your node to the `BASE_NODE_TEMPLATES` array:

```typescript
const BASE_NODE_TEMPLATES: NodeTemplate[] = [
  // ... existing templates ...
  {
    type: "media",
    icon: Image,  // Import from lucide-react
    disabled: false,
    getLabel: (platform) => getNodeLabel("media", platform),
    getDescription: () => "Send images or videos",
    getColor: (platform) => getPlatformColor(platform, "accent"),
    isAvailable: (platform) => platformSupportsNodeType(platform, "media"),
  },
]
```

**Location:** Around line 27-73

---

### Step 9: Add to Connection Menu (Optional)

**File:** `components/connection-menu.tsx`

If users should be able to add this node from handle connections:

```typescript
const BASE_MENU_ITEMS: MenuItem[] = [
  // ... existing items ...
  {
    type: "media",
    getLabel: (platform) => getNodeLabel("media", platform),
    icon: Image,
    getColor: (platform) => getPlatformTextColor(platform, "accent"),
    isAvailable: (platform) => platformSupportsNodeType(platform, "media"),
  },
]
```

**Location:** Around line 20-60

---

### Step 10: Add to Context Menu

**File:** `app/page.tsx`

Add case in `addNodeAtPosition()` function:

```typescript
const addNodeAtPosition = useCallback(
  (nodeType: string) => {
    // ... existing code ...
    
    try {
      switch (nodeType) {
        case "comment":
          // ... existing code ...
          break
        case "question":
          // ... existing code ...
          break
          
        // Add your node
        case "media":
          newNode = createNode("media", platform, position, newNodeId)
          break
          
        default:
          console.warn(\`[v0] Unknown node type: \${nodeType}\`)
          return
      }
      
      // ... rest of function
    }
  },
  [/* dependencies */]
)
```

**Location:** Around line 944-1004

Also add to the `onDrop()` function around line 813-899.

---

### Step 11: Update Properties Panel (Optional)

**File:** `components/properties-panel.tsx`

If your node needs custom properties UI:

```typescript
// Add icon mapping
const NODE_ICONS: Record<string, any> = {
  // ... existing icons ...
  media: Image,
  whatsappMedia: Image,
  instagramMedia: Image,
}

// Add color mapping
const NODE_COLORS: Record<string, string> = {
  // ... existing colors ...
  media: "bg-purple-500",
  whatsappMedia: "bg-green-500",
  instagramMedia: "bg-pink-500",
}

// Add custom UI section
{selectedNode.type === "whatsappMedia" || selectedNode.type === "instagramMedia" ? (
  <div>
    {/* Custom UI for media nodes */}
    <Label>Media Settings</Label>
    {/* Add your custom controls */}
  </div>
) : null}
```

**Location:** Lines 20-50 for mappings, 150+ for custom UI

---

## ✅ Testing Checklist

After implementing, test these scenarios:

### Basic Functionality
- [ ] Node appears in sidebar for correct platforms (WhatsApp, Instagram)
- [ ] Node does NOT appear for Web platform
- [ ] Node can be dragged onto canvas
- [ ] Node can be created via right-click context menu
- [ ] Node icon and styling are correct

### Node Behavior
- [ ] Caption field validates character limits (200 for WhatsApp, 150 for Instagram)
- [ ] Shows error when exceeding character limit
- [ ] Media type toggle works (image/video)
- [ ] Node data persists when deselected
- [ ] Single output handle works correctly

### Integration
- [ ] Node can be connected to other nodes
- [ ] Node appears in connection menu from handles
- [ ] Properties panel shows node details
- [ ] Node can be deleted
- [ ] Node can be copied/pasted
- [ ] Node data saves in flow JSON
- [ ] Node loads correctly from saved flow

### Edge Cases
- [ ] Empty caption is allowed
- [ ] Very long caption shows error
- [ ] Platform switching doesn't break the node
- [ ] Multiple media nodes work together
- [ ] Undo/redo works with media nodes

---

## 🎨 Styling Guidelines

### Colors by Platform

**WhatsApp:**
- Primary: `#25d366` (green)
- Border: `border-green-100`, `border-green-200`
- Hover: `hover:border-green-300`
- Selected: `ring-green-300/50`

**Instagram:**
- Primary: `#E1306C` (pink)
- Border: `border-pink-100`, `border-pink-200`
- Hover: `hover:border-pink-300`
- Selected: `ring-pink-300/50`
- Gradient: `bg-gradient-to-r from-purple-500 to-pink-500`

**Web:**
- Primary: `#3b82f6` (blue)
- Border: `border-blue-100`, `border-blue-200`
- Hover: `hover:border-blue-300`
- Selected: `ring-blue-300/50`

### Common Styles

```typescript
// Card wrapper
<Card className={\`
  min-w-[260px] max-w-[300px] 
  bg-white 
  border-{platform}-100 
  shadow-sm 
  transition-all duration-200 
  hover:shadow-md hover:border-{platform}-200 
  \${selected ? "ring-1 ring-{platform}-300/50 shadow-md" : ""}
\`}>

// Input/Textarea
<Textarea className="
  text-sm 
  min-h-[60px] 
  resize-none 
  border-{platform}-200 
  focus:border-{platform}-300
" />

// Handle
<Handle className="
  w-3 h-3 
  bg-{platform}-500 
  border-2 border-white 
  opacity-100 
  hover:scale-110 
  transition-transform
" />
```

---

## 📁 File Checklist

Make sure you've updated all these files:

- [ ] `constants/node-limits/config.ts` - Node limits
- [ ] `utils/platform-labels.ts` - Labels and support check
- [ ] `components/nodes/{platform}/{platform}-media-node.tsx` - Component
- [ ] `app/page.tsx` - Registration and logic
- [ ] `utils/node-operations.ts` - Node creation
- [ ] `constants/node-types.ts` - Type mapping
- [ ] `components/node-sidebar.tsx` - Sidebar template
- [ ] `components/connection-menu.tsx` - Connection menu (optional)
- [ ] `components/properties-panel.tsx` - Properties UI (optional)

---

## 🐛 Common Issues

### Issue: Node doesn't appear in sidebar
**Solution:** Check `platformSupportsNodeType()` in `utils/platform-labels.ts`

### Issue: Node appears but can't be created
**Solution:** Check `createNode()` in `utils/node-operations.ts` has your node case

### Issue: Validation not working
**Solution:** Verify `getNodeLimits()` in `constants/node-limits/config.ts` returns correct limits

### Issue: TypeScript errors
**Solution:** 
- Import `Platform` type from `@/types`
- Use `getNodeLimits()` return type
- Check all props are typed correctly

### Issue: Node styling wrong
**Solution:** Check platform color classes match the selected platform

---

## 🚀 Quick Start Template

Use this as a starting template for any new node:

```bash
# 1. Copy an existing node as template
cp components/nodes/whatsapp/whatsapp-question-node.tsx \
   components/nodes/whatsapp/whatsapp-[yournode]-node.tsx

# 2. Search and replace in the file
# - Component name
# - Node type
# - Custom fields
# - Validation logic

# 3. Follow steps 1-11 above

# 4. Test thoroughly!
```

---

## 📚 Additional Resources

- **Node Limits:** `constants/node-limits/README.md`
- **Architecture:** `ARCHITECTURE.md`
- **Platform Labels:** `utils/platform-labels.ts`
- **Existing Nodes:** `components/nodes/{platform}/`

---

## 💡 Pro Tips

1. **Start Simple:** Begin with basic text node, add features incrementally
2. **Copy Patterns:** Use existing nodes as reference
3. **Test Early:** Test after each step, don't wait till the end
4. **Reuse Styles:** Use existing Tailwind classes for consistency
5. **Type Everything:** Use TypeScript for better DX
6. **Validate Always:** Use node limits for all user input
7. **Document:** Add comments for complex logic

---

## 🎉 You're Done!

After following all steps, you should have a fully functional node that:
- ✅ Appears in the sidebar
- ✅ Can be added to the canvas
- ✅ Validates user input
- ✅ Connects to other nodes
- ✅ Saves and loads correctly
- ✅ Follows platform styling

**Happy Node Building! 🎨**

---

**Need Help?**
- Check existing node implementations
- Review the architecture docs
- Look at the node limits guide

**Last Updated:** November 3, 2025


