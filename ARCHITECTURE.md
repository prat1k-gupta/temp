# Magic Flow - Modular Architecture

This document outlines the modular architecture and code organization of the Magic Flow application.

## 📁 Project Structure

```
magic-flow/
├── app/                    # Next.js app directory
│   ├── page.tsx           # Main flow editor component
│   └── layout.tsx         # Root layout
├── components/            # React components
│   ├── nodes/            # Node components
│   ├── ui/               # UI components
│   └── ...               # Other components
├── types/                # TypeScript type definitions
│   └── index.ts          # Core types and interfaces
├── constants/            # Application constants
│   ├── platform-limits.ts   # Platform-specific limits
│   ├── node-types.ts        # Node type mappings
│   └── index.ts             # Centralized exports
├── utils/                # Utility functions
│   ├── event-helpers.ts     # Event handling utilities
│   ├── platform-helpers.ts  # Platform-specific utilities
│   ├── validation.ts        # Validation functions
│   ├── node-operations.ts   # Node manipulation utilities
│   ├── node-factory.ts      # Node creation factories
│   └── index.ts             # Centralized exports
├── lib/                  # Library code
│   ├── node-registry.ts    # Platform registry
│   └── platforms/          # Platform definitions (minimal usage)
└── hooks/                # Custom React hooks
```

## 🏗️ Architecture Principles

### 1. **Separation of Concerns**
- **Types**: All TypeScript interfaces and types in `/types`
- **Constants**: Platform limits, mappings, and configurations in `/constants` (single source of truth)
- **Utilities**: Reusable functions in `/utils`
- **Components**: Platform-specific node components in `/components/nodes/`

### 2. **Modular Imports**
- Each module has a centralized `index.ts` for clean imports
- Components import only what they need
- No circular dependencies

### 3. **Type Safety**
- Comprehensive TypeScript coverage
- Platform-specific type guards
- Proper error handling with typed exceptions

## 📋 Core Types

### Platform Types
```typescript
type Platform = "web" | "whatsapp" | "instagram"
```

### Node Data Types
```typescript
interface BaseNodeData extends Record<string, unknown> {
  platform: Platform
  label?: string
  // ... other common properties
}

interface QuestionNodeData extends BaseNodeData {
  question?: string
  characterLimit?: number
}

// ... other specialized node data types
```

## ⚙️ Constants Organization

### Platform Limits
```typescript
// Character limits per platform
const CHARACTER_LIMITS: Record<Platform, { question: number; button: number }>

// Button limits per platform  
const BUTTON_LIMITS: Record<Platform, number>

// UI interaction thresholds
const INTERACTION_THRESHOLDS
```

### Node Type Mappings
```typescript
// Maps base types to platform-specific types
const NODE_TYPE_MAPPINGS: Record<string, Record<Platform, string>>

// Platform-specific labels and content
const NODE_LABELS: Record<string, Record<Platform, string>>
const NODE_CONTENT: Record<string, Record<Platform, string>>
```

## 🛠️ Utility Functions

### Event Helpers
- `getClientCoordinates()` - Extract coordinates from various event types
- `isDoubleClick()` - Detect double-click interactions
- `hasClientCoordinates()` - Type guard for event properties

### Platform Helpers
- `getPlatformSpecificNodeType()` - Get platform-specific node type
- `getPlatformSpecificLabel()` - Get platform-specific labels
- `getPlatformSpecificContent()` - Get platform-specific content
- `getBaseNodeType()` - Reverse mapping from platform type to base type

### Validation
- `isValidNodeId()` - Validate node IDs
- `isValidPlatform()` - Platform type guard
- `isValidCoordinates()` - Coordinate validation
- `isWithinCharacterLimit()` - Text length validation

### Node Operations
- `createButtonData()` - Create button data structures
- `createOptionData()` - Create option data structures
- `generateNodeId()` - Generate unique node IDs
- `canAddMoreButtons()` - Check button limits
- `supportsButtons()` - Check if node type supports buttons

### Node Factory
- `createQuestionNode()` - Create question nodes
- `createQuickReplyNode()` - Create quick reply nodes
- `createListNode()` - Create list nodes
- `createCommentNode()` - Create comment nodes
- `createNode()` - Generic node factory

## 🎨 Platform Configuration (Simplified)

Platform configurations are defined in `/constants/platform-limits.ts` as the single source of truth:

```typescript
// Character limits per platform
export const CHARACTER_LIMITS: Record<Platform, { question: number; button: number; comment: number }> = {
  web: { question: 500, button: 20, comment: 200 },
  whatsapp: { question: 160, button: 20, comment: 150 },
  instagram: { question: 100, button: 15, comment: 100 },
}

// Button limits per platform
export const BUTTON_LIMITS: Record<Platform, number> = {
  web: 3,
  whatsapp: 10,
  instagram: 10,
}
```

**Note**: The `/lib/platforms/` directory contains platform class definitions that are only used by a few specialized nodes (WhatsApp Message, Instagram DM/Story, Web Form, and Base Node) for runtime constraint validation. Most nodes use constants directly.

## 📦 Import Examples

### Clean Modular Imports
```typescript
// Types
import type { Platform, NodeData, ButtonData } from "@/types"

// Constants
import { BUTTON_LIMITS, CHARACTER_LIMITS } from "@/constants"

// Utilities
import { 
  getPlatformSpecificNodeType,
  createNode,
  isValidPlatform 
} from "@/utils"

// Platform Limits (Single Source of Truth)
import { CHARACTER_LIMITS, BUTTON_LIMITS } from "@/constants/platform-limits"
```

### Component Usage
```typescript
// Create a new node using the factory
const newNode = createNode("question", platform, position)

// Get character limits
const maxLength = CHARACTER_LIMITS[platform].question

// Check button limits
const canAddButton = buttons.length < BUTTON_LIMITS[platform]

// Get platform-specific type
const nodeType = getPlatformSpecificNodeType("question", "whatsapp")
// Returns: "whatsappQuestion"
```

## 🔄 Migration Benefits

### Before Refactoring
- ❌ All types, constants, and utilities in main component
- ❌ Repeated platform logic throughout codebase
- ❌ Hard to maintain and extend
- ❌ No clear separation of concerns

### After Refactoring
- ✅ Clean modular structure with separated concerns
- ✅ Reusable utilities and constants
- ✅ Type-safe platform configurations
- ✅ Easy to add new platforms or node types
- ✅ Better code maintainability and testability
- ✅ Clear import dependencies

## 🚀 Adding New Features

### Adding a New Platform
1. Add platform type to `/types/index.ts`
2. Update constants in `/constants/platform-limits.ts` and `/constants/node-types.ts`
3. (Optional) Create platform class in `/lib/platforms/` if specialized validation is needed
4. Create platform-specific node components in `/components/nodes/{platform}/`
5. Register node types in `app/page.tsx`
6. Update utilities if needed

### Adding a New Node Type
1. Add node data interface to `/types/index.ts`
2. Update node type mappings in `/constants/node-types.ts`
3. Add factory function in `/utils/node-factory.ts`
4. Create platform-specific components
5. Register in main component

This modular architecture makes the codebase much more maintainable, testable, and extensible while providing clear separation of concerns and better code organization.
