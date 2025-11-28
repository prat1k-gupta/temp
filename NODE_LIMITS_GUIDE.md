# Node-Wise Limitations Guide

This document explains how to use the node-wise limitation system in Magic Flow.

## Overview

The node-wise limitation system provides granular control over what each node type can do. It combines platform-specific limits with node-specific constraints to create a comprehensive validation system.

## Architecture

```
┌─────────────────────────────────────────┐
│     constants/platform-limits.ts        │  ← Platform-level limits
│  (Web, WhatsApp, Instagram)             │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│      constants/node-limits.ts           │  ← Node-level limits
│  (Question, QuickReply, List, etc.)     │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│         getNodeLimits()                  │  ← Combined limits
│  (nodeType + platform)                   │
└─────────────────────────────────────────┘
```

## Node Limits Structure

Each node type has specific limits defined:

```typescript
interface NodeLimits {
  // Text field limits
  text?: { min?: number; max: number; placeholder?: string }
  question?: { min?: number; max: number; placeholder?: string }
  title?: { min?: number; max: number; placeholder?: string }
  description?: { min?: number; max: number; placeholder?: string }
  comment?: { min?: number; max: number; placeholder?: string }
  
  // Button/Option limits
  buttons?: {
    min: number
    max: number
    textMaxLength: number
  }
  options?: {
    min: number
    max: number
    textMaxLength: number
    descriptionMaxLength?: number
  }
  
  // List-specific limits
  listTitle?: { max: number }
  
  // Connection constraints
  maxConnections?: number
  allowMultipleOutputs?: boolean
  allowMultipleInputs?: boolean
}
```

## Node Types and Their Limits

### 1. Question Node
```typescript
{
  question: { min: 1, max: 500 (web) | 160 (whatsapp) | 100 (instagram) }
  maxConnections: 1
  allowMultipleOutputs: false
  allowMultipleInputs: true
}
```

### 2. Quick Reply Node
```typescript
{
  question: { min: 1, max: [platform-specific] }
  buttons: { 
    min: 1, 
    max: 3 (web) | 10 (whatsapp) | 10 (instagram),
    textMaxLength: 20 (web/whatsapp) | 15 (instagram)
  }
  maxConnections: [same as button max]
  allowMultipleOutputs: true
  allowMultipleInputs: true
}
```

### 3. List Node
```typescript
{
  question: { min: 1, max: [platform-specific] }
  listTitle: { max: 60 }
  options: { 
    min: 1, 
    max: 10,
    textMaxLength: [platform-specific],
    descriptionMaxLength: 72
  }
  maxConnections: 10
  allowMultipleOutputs: true
  allowMultipleInputs: true
}
```

### 4. Comment Node
```typescript
{
  comment: { min: 0, max: 200 (web) | 150 (whatsapp) | 100 (instagram) }
  maxConnections: 0
  allowMultipleOutputs: false
  allowMultipleInputs: false
}
```

### 5. Platform-Specific Nodes

#### WhatsApp Message
```typescript
{
  text: { min: 1, max: 4096 }
  maxConnections: 1
  allowMultipleOutputs: false
  allowMultipleInputs: true
}
```

#### Instagram DM
```typescript
{
  text: { min: 1, max: 1000 }
  maxConnections: 1
  allowMultipleOutputs: false
  allowMultipleInputs: true
}
```

## Usage Examples

### 1. Get Limits for a Node

```typescript
import { getNodeLimits } from "@/constants/node-limits"

// Get limits for a WhatsApp quick reply node
const limits = getNodeLimits("whatsappQuickReply", "whatsapp")

console.log(limits.buttons?.max) // 10
console.log(limits.question?.max) // 160
console.log(limits.allowMultipleOutputs) // true
```

### 2. Validate Text Input

```typescript
import { isTextWithinNodeLimits } from "@/constants/node-limits"

const questionText = "What would you like to know?"
const validation = isTextWithinNodeLimits(
  questionText,
  "webQuestion",
  "web",
  "question"
)

if (!validation.valid) {
  console.error(validation.error)
  // "Maximum 500 characters allowed (current: 550)"
}
```

### 3. Validate Buttons

```typescript
import { areButtonsWithinNodeLimits } from "@/constants/node-limits"

const buttonCount = 5
const validation = areButtonsWithinNodeLimits(
  buttonCount,
  "webQuickReply",
  "web"
)

if (!validation.valid) {
  console.error(validation.error)
  // "Maximum 3 buttons allowed"
}
```

### 4. Check Node Capabilities

```typescript
import { 
  nodeSupportsButtons,
  nodeSupportsOptions,
  nodeSupportsMultipleOutputs,
  getMaxConnections
} from "@/constants/node-limits"

const nodeType = "whatsappQuickReply"
const platform = "whatsapp"

// Check if node supports buttons
if (nodeSupportsButtons(nodeType)) {
  console.log("This node can have buttons")
}

// Check if node supports multiple outputs
if (nodeSupportsMultipleOutputs(nodeType, platform)) {
  console.log("This node can have multiple connections")
}

// Get max connections
const maxConnections = getMaxConnections(nodeType, platform)
console.log(`Max connections: ${maxConnections}`) // 10
```

### 5. Get Text Field Limits

```typescript
import { getTextFieldLimit } from "@/constants/node-limits"

// Get question field limits
const questionLimits = getTextFieldLimit(
  "instagramQuestion",
  "instagram",
  "question"
)

console.log(questionLimits.max) // 100
console.log(questionLimits.placeholder) // "Type your question here..."
```

## Using in Components

### Example: Question Node Component

```typescript
import { getNodeLimits, isTextWithinNodeLimits } from "@/constants/node-limits"

export function QuestionNode({ data, nodeType, platform }) {
  const limits = getNodeLimits(nodeType, platform)
  const [questionText, setQuestionText] = useState(data.question || "")
  
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value
    
    // Validate on change
    const validation = isTextWithinNodeLimits(
      newText,
      nodeType,
      platform,
      "question"
    )
    
    if (validation.valid) {
      setQuestionText(newText)
      data.onNodeUpdate(data.id, { question: newText })
    } else {
      // Show error
      toast.error(validation.error)
    }
  }
  
  return (
    <textarea
      value={questionText}
      onChange={handleTextChange}
      maxLength={limits.question?.max}
      placeholder={limits.question?.placeholder}
    />
  )
}
```

### Example: Quick Reply Node Component

```typescript
import { getNodeLimits, areButtonsWithinNodeLimits } from "@/constants/node-limits"

export function QuickReplyNode({ data, nodeType, platform }) {
  const limits = getNodeLimits(nodeType, platform)
  const [buttons, setButtons] = useState(data.buttons || [])
  
  const canAddButton = () => {
    const validation = areButtonsWithinNodeLimits(
      buttons.length + 1,
      nodeType,
      platform
    )
    return validation.valid
  }
  
  const addButton = () => {
    if (canAddButton()) {
      const newButtons = [...buttons, { text: "" }]
      setButtons(newButtons)
      data.onNodeUpdate(data.id, { buttons: newButtons })
    } else {
      toast.error(`Maximum ${limits.buttons?.max} buttons allowed`)
    }
  }
  
  return (
    <div>
      {buttons.map((button, index) => (
        <input
          key={index}
          value={button.text}
          maxLength={limits.buttons?.textMaxLength}
          onChange={(e) => updateButton(index, e.target.value)}
        />
      ))}
      {canAddButton() && (
        <button onClick={addButton}>Add Button</button>
      )}
    </div>
  )
}
```

## Adding New Node Types

To add a new node type with custom limits:

1. Open `constants/node-limits.ts`
2. Add a new case in `getNodeLimits()`:

```typescript
case "yourNewNodeType":
  return {
    text: {
      min: 1,
      max: 500,
      placeholder: "Your placeholder...",
    },
    buttons: {
      min: 0,
      max: 5,
      textMaxLength: 30,
    },
    maxConnections: 5,
    allowMultipleOutputs: true,
    allowMultipleInputs: true,
  }
```

3. Update `getBaseNodeType()` if needed to map aliases

## Best Practices

1. **Always validate user input** using the validation functions
2. **Use `getNodeLimits()` to get limits** instead of hardcoding values
3. **Check capabilities before showing UI** (e.g., check `nodeSupportsButtons()` before showing button controls)
4. **Show helpful error messages** using the validation error messages
5. **Consider both platform and node limits** when defining constraints

## Migration Guide

If you have existing code using hardcoded limits:

### Before:
```typescript
const MAX_BUTTONS = 3
if (buttons.length >= MAX_BUTTONS) {
  alert("Max buttons reached")
}
```

### After:
```typescript
import { areButtonsWithinNodeLimits } from "@/constants/node-limits"

const validation = areButtonsWithinNodeLimits(
  buttons.length + 1,
  nodeType,
  platform
)

if (!validation.valid) {
  toast.error(validation.error)
}
```

## Future Enhancements

Potential additions to the system:
- Custom validation rules per node type
- Dynamic limits based on user subscription
- A/B testing different limits
- Analytics on limit usage
- Soft vs hard limits (warnings vs errors)

