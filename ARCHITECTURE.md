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
├── config/               # Configuration files
│   └── platforms/        # Platform-specific configurations
│       ├── web.ts        # Web platform config
│       ├── whatsapp.ts   # WhatsApp platform config
│       ├── instagram.ts  # Instagram platform config
│       └── index.ts      # Platform config exports
└── lib/                  # External library configurations
```

## 🏗️ Architecture Principles

### 1. **Separation of Concerns**
- **Types**: All TypeScript interfaces and types in `/types`
- **Constants**: Platform limits, mappings, and configurations in `/constants`
- **Utilities**: Reusable functions in `/utils`
- **Configuration**: Platform-specific configs in `/config`

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

## 🎨 Platform Configurations

Each platform has its own configuration file with:

```typescript
interface PlatformConfig {
  platform: Platform
  name: string
  limits: {
    question: number
    button: number
    maxButtons: number
    maxOptions: number
  }
  styling: {
    primaryColor: string
    borderColor: string
    backgroundColor: string
    // ... other styling properties
  }
  features: {
    supportsRichText: boolean
    supportsImages: boolean
    // ... other feature flags
  }
  nodeTypes: {
    question: string
    quickReply: string
    // ... platform-specific node types
  }
}
```

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

// Platform Configs
import { getPlatformConfig } from "@/config/platforms"
```

### Component Usage
```typescript
// Create a new node using the factory
const newNode = createNode("question", platform, position)

// Validate platform
if (isValidPlatform(userInput)) {
  const config = getPlatformConfig(userInput)
  // ... use config
}

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
1. Create config file in `/config/platforms/new-platform.ts`
2. Add platform type to `/types/index.ts`
3. Update constants in `/constants/`
4. Add platform-specific components
5. Update utilities if needed

### Adding a New Node Type
1. Add node data interface to `/types/index.ts`
2. Update node type mappings in `/constants/node-types.ts`
3. Add factory function in `/utils/node-factory.ts`
4. Create platform-specific components
5. Register in main component

This modular architecture makes the codebase much more maintainable, testable, and extensible while providing clear separation of concerns and better code organization.
