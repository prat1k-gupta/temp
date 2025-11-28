# Node Limits Module

A modular, organized system for defining and validating node-specific constraints in the Magic Flow application.

## 📁 Structure

```
constants/node-limits/
├── types.ts      # TypeScript type definitions
├── config.ts     # Node limit configurations
├── helpers.ts    # Validation and utility functions
├── index.ts      # Public API exports
└── README.md     # This file
```

---

## 📄 Files Overview

### 1. `types.ts` - Type Definitions

Defines the shape of node limits and validation results.

**Key Types:**
- `NodeLimits` - Comprehensive interface for all node constraints
- `ValidationResult` - Standardized validation response

**Example:**
```typescript
interface NodeLimits {
  question?: { min?: number; max: number; placeholder?: string }
  buttons?: { min: number; max: number; textMaxLength: number }
  options?: { min: number; max: number; textMaxLength: number; descriptionMaxLength?: number }
  maxConnections?: number
  allowMultipleOutputs?: boolean
  allowMultipleInputs?: boolean
}
```

---

### 2. `config.ts` - Configuration

Centralized configuration for all node types and their constraints.

**Main Function:**
- `getNodeLimits(nodeType, platform)` - Returns node-specific limits

**Supported Node Types:**
- `question` - Simple question nodes
- `quickReply` - Quick reply nodes with buttons
- `list` - List nodes with options
- `comment` - Comment/annotation nodes
- `start` - Flow start node
- `whatsappMessage` - WhatsApp-specific messages
- `instagramDM` - Instagram direct messages
- `instagramStory` - Instagram story replies
- `webForm` - Web form nodes

**Example:**
```typescript
import { getNodeLimits } from "@/constants/node-limits"

const limits = getNodeLimits("webQuickReply", "web")
console.log(limits.buttons?.max) // 3
console.log(limits.question?.max) // 500
```

---

### 3. `helpers.ts` - Validation & Utilities

Helper functions for validating node data and checking capabilities.

**Capability Checks:**
- `nodeSupportsButtons(nodeType)` - Check if node type supports buttons
- `nodeSupportsOptions(nodeType)` - Check if node type supports list options
- `nodeSupportsMultipleOutputs(nodeType, platform)` - Check for multiple output connections
- `getMaxConnections(nodeType, platform)` - Get maximum connection count

**Validation Functions:**
- `isTextWithinNodeLimits(text, nodeType, platform, fieldType)` - Validate text length
- `areButtonsWithinNodeLimits(count, nodeType, platform)` - Validate button count
- `areOptionsWithinNodeLimits(count, nodeType, platform)` - Validate option count
- `isButtonTextValid(text, nodeType, platform)` - Validate button text length
- `isOptionTextValid(text, nodeType, platform)` - Validate option text length
- `isOptionDescriptionValid(text, nodeType, platform)` - Validate option description length

**Example:**
```typescript
import { areButtonsWithinNodeLimits, isButtonTextValid } from "@/constants/node-limits"

// Check if we can add another button
const canAdd = areButtonsWithinNodeLimits(4, "webQuickReply", "web")
if (!canAdd.valid) {
  console.log(canAdd.reason) // "Maximum 3 buttons allowed"
}

// Validate button text
const textValid = isButtonTextValid("Click me!", "webQuickReply", "web")
console.log(textValid.valid) // true
```

---

### 4. `index.ts` - Public API

Exports all public types and functions. This is the main entry point.

**Usage:**
```typescript
// Import from the module
import { 
  getNodeLimits, 
  areButtonsWithinNodeLimits,
  type NodeLimits 
} from "@/constants/node-limits"
```

---

## 🚀 Usage Examples

### Getting Node Limits

```typescript
import { getNodeLimits } from "@/constants/node-limits"

// In a React component
const MyNodeComponent = ({ data }) => {
  const platform = data.platform || "web"
  const nodeLimits = getNodeLimits("webQuickReply", platform)
  
  const maxQuestionLength = nodeLimits.question?.max || 500
  const maxButtons = nodeLimits.buttons?.max || 3
  const maxButtonTextLength = nodeLimits.buttons?.textMaxLength || 20
  
  // Use these values for validation and UI
}
```

### Validating User Input

```typescript
import { isTextWithinNodeLimits, isButtonTextValid } from "@/constants/node-limits"

// Validate question text
const questionResult = isTextWithinNodeLimits(
  userInput,
  "webQuestion",
  "web",
  "question"
)

if (!questionResult.valid) {
  console.error(questionResult.reason)
  // "Maximum 500 characters allowed"
}

// Validate button text
const buttonResult = isButtonTextValid(buttonText, "webQuickReply", "web")
if (!buttonResult.valid) {
  showError(buttonResult.reason)
}
```

### Checking Node Capabilities

```typescript
import { 
  nodeSupportsButtons, 
  nodeSupportsMultipleOutputs,
  getMaxConnections 
} from "@/constants/node-limits"

const nodeType = "quickReply"
const platform = "web"

if (nodeSupportsButtons(nodeType)) {
  // Show "Add Button" UI
}

if (nodeSupportsMultipleOutputs(nodeType, platform)) {
  // Allow multiple edge connections
}

const maxConnections = getMaxConnections(nodeType, platform)
console.log(`This node can have up to ${maxConnections} connections`)
```

### Dynamic Button Addition

```typescript
import { areButtonsWithinNodeLimits } from "@/constants/node-limits"

const addButton = () => {
  const currentCount = buttons.length
  const validation = areButtonsWithinNodeLimits(
    currentCount + 1,
    "webQuickReply",
    "web"
  )
  
  if (validation.valid) {
    // Add the button
    setButtons([...buttons, newButton])
  } else {
    // Show conversion to list node or error
    toast.error(validation.reason)
  }
}
```

---

## 🎨 Adding New Node Types

To add a new node type, update `config.ts`:

```typescript
// In getNodeLimits() switch statement
case "yourNewNodeType":
  return {
    question: {
      min: 1,
      max: CHARACTER_LIMITS[platform].question,
      placeholder: "Your custom placeholder...",
    },
    buttons: {
      min: 1,
      max: 5,
      textMaxLength: 30,
    },
    maxConnections: 5,
    allowMultipleOutputs: true,
    allowMultipleInputs: true,
  }
```

Also update the base type mapping in `config.ts`:

```typescript
// In getBaseNodeType()
if (nodeType === "yourNewNodeType") {
  return "yourNewNodeType"
}
```

---

## 🧪 Testing

All validation functions return a `ValidationResult`:

```typescript
interface ValidationResult {
  valid: boolean        // Is the validation passing?
  reason?: string       // Human-readable error message
  max?: number          // Maximum allowed value
  current?: number      // Current value being validated
}
```

This standardized response makes it easy to show user-friendly error messages:

```typescript
const result = areButtonsWithinNodeLimits(5, "webQuickReply", "web")

if (!result.valid) {
  showToast({
    type: "error",
    message: result.reason,
    details: `Current: ${result.current}, Max: ${result.max}`
  })
}
```

---

## 📊 Benefits of This Structure

1. **Modularity** - Each file has a single, clear responsibility
2. **Maintainability** - Easy to find and update specific functionality
3. **Type Safety** - Full TypeScript support with proper type exports
4. **Reusability** - Helper functions can be composed and reused
5. **Testability** - Each module can be tested independently
6. **Scalability** - Easy to add new node types or validation rules
7. **Clear API** - Public API through index.ts, internal details hidden

---

## 🔄 Migration from Old Structure

The old monolithic `node-limits.ts` file has been split into this modular structure. All imports remain the same:

```typescript
// Still works the same way!
import { getNodeLimits, areButtonsWithinNodeLimits } from "@/constants"

// Or import directly from the module
import { getNodeLimits } from "@/constants/node-limits"
```

No changes required in consuming code! ✅

---

## 📝 Notes

- All limits are defined per-node-type AND per-platform
- Validation functions provide detailed error messages
- The module automatically handles node type aliases (e.g., "webQuestion", "whatsappQuestion" → "question")
- Default fallback values are provided for robustness
- Platform-specific limits are pulled from `constants/platform-limits.ts`

---

**Last Updated:** November 3, 2025  
**Version:** 2.0.0 (Modular)

