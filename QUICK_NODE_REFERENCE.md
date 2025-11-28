# 🎯 Quick Node Addition Reference Card

A condensed checklist for adding new nodes. See `ADDING_NEW_NODES.md` for detailed guide.

---

## ✅ 9-Step Checklist

### 1️⃣ Define Limits
**File:** `constants/node-limits/config.ts`
```typescript
case "yourNode":
  return {
    text: { min: 0, max: 200, placeholder: "..." },
    buttons: { min: 1, max: 10, textMaxLength: 20 },
    maxConnections: 1,
    allowMultipleOutputs: false,
    allowMultipleInputs: true,
  }
```

### 2️⃣ Add Labels
**File:** `utils/platform-labels.ts`
```typescript
// Add to NODE_TYPE_LABELS
yourNode: {
  web: "Web YourNode",
  whatsapp: "WhatsApp YourNode",
  instagram: "Instagram YourNode",
}

// Add to platformSupportsNodeType()
if (nodeType === "yourNode") {
  return platform === "whatsapp" || platform === "instagram"
}
```

### 3️⃣ Create Component
**File:** `components/nodes/{platform}/{platform}-yournode-node.tsx`
```typescript
import { getNodeLimits } from "@/constants"
import type { Platform } from "@/types"

export function WhatsAppYourNodeNode({ data, selected }) {
  const nodeLimits = getNodeLimits("yourNode", data.platform)
  // ... component logic
}
```

### 4️⃣ Register Node
**File:** `app/page.tsx`
```typescript
// Import
import { WhatsAppYourNodeNode } from "@/components/nodes/whatsapp/whatsapp-yournode-node"

// Register in nodeTypes
const nodeTypes = {
  // ... existing
  whatsappYourNode: WhatsAppYourNodeNode,
  instagramYourNode: InstagramYourNodeNode,
}
```

### 5️⃣ Add Creation Logic
**File:** `utils/node-operations.ts`
```typescript
if (nodeType === "yourNode") {
  return {
    id: nodeId,
    type: specificType,
    position,
    data: {
      id: nodeId,
      label: getPlatformSpecificLabel("yourNode", platform),
      // ... your fields
      platform,
      onNodeUpdate: () => {},
    },
  }
}
```

### 6️⃣ Update Type Mappings
**File:** `constants/node-types.ts`
```typescript
export const NODE_TYPE_MAPPINGS = {
  // ... existing
  yourNode: {
    web: "yourNode",
    whatsapp: "whatsappYourNode",
    instagram: "instagramYourNode"
  }
}

export const NODE_LABELS = {
  // ... existing
  yourNode: "Your Node",
}
```

### 7️⃣ Add to Sidebar
**File:** `components/node-sidebar.tsx`
```typescript
const BASE_NODE_TEMPLATES: NodeTemplate[] = [
  // ... existing
  {
    type: "yourNode",
    icon: YourIcon, // from lucide-react
    disabled: false,
    getLabel: (platform) => getNodeLabel("yourNode", platform),
    getDescription: () => "Description",
    getColor: (platform) => getPlatformColor(platform, "primary"),
    isAvailable: (platform) => platformSupportsNodeType(platform, "yourNode"),
  },
]
```

### 8️⃣ Add Context Menu Handler
**File:** `app/page.tsx`
```typescript
// In addNodeAtPosition()
switch (nodeType) {
  // ... existing cases
  case "yourNode":
    newNode = createNode("yourNode", platform, position, newNodeId)
    break
}

// Also add to onDrop() function
```

### 9️⃣ Add Connection Menu (Optional)
**File:** `components/connection-menu.tsx`
```typescript
const BASE_MENU_ITEMS: MenuItem[] = [
  // ... existing
  {
    type: "yourNode",
    getLabel: (platform) => getNodeLabel("yourNode", platform),
    icon: YourIcon,
    getColor: (platform) => getPlatformTextColor(platform, "primary"),
    isAvailable: (platform) => platformSupportsNodeType(platform, "yourNode"),
  },
]
```

---

## 📁 Files to Update

| # | File | Purpose | Required |
|---|------|---------|----------|
| 1 | `constants/node-limits/config.ts` | Define limits | ✅ |
| 2 | `utils/platform-labels.ts` | Labels & support | ✅ |
| 3 | `components/nodes/{platform}/{node}.tsx` | Component | ✅ |
| 4 | `app/page.tsx` | Register | ✅ |
| 5 | `utils/node-operations.ts` | Creation | ✅ |
| 6 | `constants/node-types.ts` | Mappings | ✅ |
| 7 | `components/node-sidebar.tsx` | Sidebar | ✅ |
| 8 | `components/connection-menu.tsx` | Connection | ⚪ Optional |
| 9 | `components/properties-panel.tsx` | Properties | ⚪ Optional |

---

## 🎨 Component Template

```typescript
"use client"

import { Handle, Position } from "@xyflow/react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { useState, useEffect } from "react"
import { getNodeLimits } from "@/constants"
import type { Platform } from "@/types"

export function YourNode({ data, selected }: { data: any; selected?: boolean }) {
  const platform = (data.platform || "whatsapp") as Platform
  const nodeLimits = getNodeLimits("yourNode", platform)
  
  return (
    <div className="relative">
      <Card className={\`min-w-[260px] max-w-[300px] bg-white 
        border-green-100 shadow-sm transition-all duration-200 
        hover:shadow-md hover:border-green-200 
        \${selected ? "ring-1 ring-green-300/50 shadow-md" : ""}\`}>
        
        <CardHeader className="pb-2 pt-3 px-4">
          {/* Header content */}
        </CardHeader>
        
        <CardContent className="pt-0 space-y-3 pb-8 px-4">
          {/* Node content */}
        </CardContent>

        <Handle type="target" position={Position.Left}
          className="w-3 h-3 bg-green-500 border-2 border-white" />
        
        <div className="absolute bottom-2 right-3">
          <Handle type="source" position={Position.Right}
            className="w-3 h-3 bg-green-500 border-2 border-white"
            style={{ position: "relative", transform: "none" }} />
        </div>
      </Card>
    </div>
  )
}
```

---

## 🧪 Testing Checklist

Quick test scenarios:

- [ ] Appears in sidebar for correct platforms
- [ ] Can drag onto canvas
- [ ] Validates input correctly
- [ ] Connects to other nodes
- [ ] Saves/loads correctly
- [ ] Delete works
- [ ] Copy/paste works

---

## 🎨 Platform Colors

```typescript
// WhatsApp
border-green-100, bg-green-500, ring-green-300

// Instagram  
border-pink-100, bg-pink-500, ring-pink-300

// Web
border-blue-100, bg-blue-500, ring-blue-300
```

---

## 🐛 Common Mistakes

❌ **Forgetting to add to sidebar** → Node won't appear  
❌ **Wrong platform support** → Appears on wrong platforms  
❌ **Missing createNode case** → Can't create from context menu  
❌ **No limits defined** → Validation fails  
❌ **Wrong import path** → TypeScript errors

---

## 💡 Quick Tips

1. Copy existing node as template
2. Update all 9 files in order
3. Test after each step
4. Use `getNodeLimits()` for validation
5. Follow existing patterns
6. Check console for errors

---

## 📚 Full Guide

For detailed explanations, examples, and troubleshooting:
**See:** `ADDING_NEW_NODES.md`

---

**Print this card and keep it handy! 📌**

Last Updated: November 3, 2025


