# 🚀 Getting Started with Magic Flow

Welcome to Magic Flow! This guide will help you understand the codebase and start contributing.

---

## 📚 Documentation Index

### For New Developers

1. **Start Here: THIS FILE** - Overview and getting started
2. **`ARCHITECTURE.md`** - System architecture and design principles
3. **`ADDING_NEW_NODES.md`** - Complete guide to adding new node types
4. **`QUICK_NODE_REFERENCE.md`** - Quick checklist for node addition

### For Understanding Specific Systems

5. **`constants/node-limits/README.md`** - Node limits system documentation
6. **`NODE_LIMITS_REFACTOR.md`** - Node limits refactoring summary
7. **`NODE_LIMITS_INTEGRATION.md`** - Integration details
8. **`NODE_LIMITS_GUIDE.md`** - Usage guide (legacy)
9. **`NODE_LIMITS_REFERENCE.md`** - Quick reference (legacy)

---

## 🏗️ Project Structure

```
magic-flow/
├── app/
│   └── page.tsx                    # Main application & flow editor
├── components/
│   ├── nodes/                      # Node components
│   │   ├── core/                   # Base node & start node
│   │   ├── web/                    # Web-specific nodes
│   │   ├── whatsapp/              # WhatsApp nodes
│   │   └── instagram/             # Instagram nodes
│   ├── node-sidebar.tsx           # Draggable node templates
│   ├── properties-panel.tsx       # Node properties editor
│   ├── connection-menu.tsx        # Node connection menu
│   └── platform-selector.tsx      # Platform switcher
├── constants/
│   ├── node-limits/               # Node limit system (modular)
│   │   ├── types.ts              # Type definitions
│   │   ├── config.ts             # Node configurations
│   │   ├── helpers.ts            # Validation functions
│   │   └── index.ts              # Public API
│   ├── node-types.ts             # Node type mappings
│   ├── platform-limits.ts        # Platform-wide limits
│   └── index.ts                  # Exports
├── utils/
│   ├── node-operations.ts        # Node creation & utilities
│   ├── platform-labels.ts        # Platform-specific labels
│   ├── change-tracker.ts         # Version tracking
│   └── version-storage.ts        # Version management
├── hooks/
│   └── use-version-manager.ts    # Version management hook
├── lib/
│   └── platform-config.ts        # Platform configurations
└── types/
    └── index.ts                   # TypeScript types
```

---

## 🎯 Core Concepts

### 1. Platforms

The app supports three platforms:
- **Web** - Browser-based flows
- **WhatsApp** - WhatsApp chat flows
- **Instagram** - Instagram DM/Story flows

Each platform has:
- Specific node types
- Different character limits
- Platform-specific styling
- Unique constraints

### 2. Nodes

Nodes are the building blocks of flows:
- **Question Nodes** - Send messages
- **Quick Reply Nodes** - Messages with buttons
- **List Nodes** - Interactive lists (WhatsApp/Instagram only)
- **Comment Nodes** - Annotations
- **Special Nodes** - Platform-specific features

### 3. Node Limits

Each node type has specific constraints:
- Character limits for text fields
- Maximum number of buttons/options
- Connection rules
- Platform-specific variations

**See:** `constants/node-limits/README.md`

### 4. Version Management

The app supports:
- Draft mode for editing
- Version history
- Publishing versions
- Reverting to published state

---

## 🚀 Quick Start

### 1. Understanding the Flow

```typescript
User selects platform → Drags node from sidebar → Node appears on canvas
→ User edits node → Connects nodes → Saves flow → Publishes
```

### 2. Key Files to Know

**Main Application:**
- `app/page.tsx` - The heart of the app, handles all flow logic

**Node System:**
- `components/nodes/` - All node components
- `constants/node-limits/` - Node constraints
- `utils/node-operations.ts` - Node utilities

**Platform System:**
- `utils/platform-labels.ts` - Platform-specific text
- `lib/platform-config.ts` - Platform configurations

### 3. Common Tasks

#### Task: Add a new node type
**Guide:** `ADDING_NEW_NODES.md`  
**Quick Reference:** `QUICK_NODE_REFERENCE.md`

#### Task: Modify node limits
**File:** `constants/node-limits/config.ts`  
**Guide:** `constants/node-limits/README.md`

#### Task: Change platform styling
**Files:** 
- `components/nodes/{platform}/` - Node styling
- `utils/platform-labels.ts` - Colors

#### Task: Add validation
**File:** `constants/node-limits/helpers.ts`  
**Guide:** `constants/node-limits/README.md`

---

## 🔧 Development Workflow

### Setting Up

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Run type checking
npx tsc --noEmit
```

### Making Changes

1. **Read relevant documentation**
   - Check `ARCHITECTURE.md` for system design
   - Check specific guides for your task

2. **Make your changes**
   - Follow existing patterns
   - Use TypeScript strictly
   - Update affected files

3. **Test thoroughly**
   - Manual testing in browser
   - Check all platforms
   - Verify edge cases

4. **Update documentation**
   - Update README files if needed
   - Add comments to complex code

---

## 📖 Learning Path

### Day 1: Understanding
1. Read this file
2. Read `ARCHITECTURE.md`
3. Explore the UI - try creating flows
4. Look at existing node components

### Day 2: Deep Dive
1. Read `constants/node-limits/README.md`
2. Study `app/page.tsx` structure
3. Understand node creation flow
4. Look at validation system

### Day 3: Practice
1. Read `ADDING_NEW_NODES.md`
2. Try adding a simple node
3. Test on different platforms
4. Understand the full lifecycle

### Week 1 Goal
- Understand overall architecture
- Can add a simple node
- Know where to find things
- Comfortable with the codebase

---

## 🎯 Common Questions

### How do I add a new node?
**Answer:** Follow `ADDING_NEW_NODES.md` step by step. Use `QUICK_NODE_REFERENCE.md` as a checklist.

### Where are node limits defined?
**Answer:** `constants/node-limits/config.ts` - See `constants/node-limits/README.md` for details.

### How do I make a node platform-specific?
**Answer:** Use `platformSupportsNodeType()` in `utils/platform-labels.ts`

### How does validation work?
**Answer:** The `constants/node-limits/helpers.ts` provides validation functions that use limits from `config.ts`

### Where is styling defined?
**Answer:** In node components using Tailwind CSS. Platform colors are in `utils/platform-labels.ts`

### How do I test my changes?
**Answer:** 
1. Run `npm run dev`
2. Open browser
3. Try all platforms
4. Test edge cases
5. Check console for errors

---

## 🛠️ Useful Commands

```bash
# Development
npm run dev                    # Start dev server
npm run build                  # Build for production
npm run lint                   # Run linter
npx tsc --noEmit              # Type checking

# Finding things
grep -r "searchTerm" .        # Search in all files
grep -r "NodeType" components/ # Search in directory

# Quick checks
npm run build 2>&1 | head -50  # Check build errors
```

---

## 📝 Code Style

### TypeScript
```typescript
// Always type your parameters
function createNode(nodeType: string, platform: Platform): Node {
  // ...
}

// Use interfaces for complex types
interface NodeData {
  id: string
  label: string
  platform: Platform
}

// Import types from @/types
import type { Platform } from "@/types"
```

### Components
```typescript
// Use functional components with types
export function MyNode({ data, selected }: { data: NodeData; selected?: boolean }) {
  // ...
}

// Use hooks properly
const [state, setState] = useState<string>("")
const nodeLimits = getNodeLimits(nodeType, platform)
```

### Styling
```typescript
// Use Tailwind CSS
className="min-w-[260px] max-w-[300px] bg-white border-green-100"

// Platform-specific colors
className={\`border-\${platform === 'whatsapp' ? 'green' : 'blue'}-100\`}

// Or use helper functions
style={{ backgroundColor: getPlatformColor(platform, "primary") }}
```

---

## 🐛 Debugging Tips

### Node not appearing in sidebar?
- Check `components/node-sidebar.tsx` - is it in `BASE_NODE_TEMPLATES`?
- Check `utils/platform-labels.ts` - does `platformSupportsNodeType()` return true?

### Node can't be created?
- Check `utils/node-operations.ts` - is there a case for your node in `createNode()`?
- Check `app/page.tsx` - is it registered in `nodeTypes` object?

### Validation not working?
- Check `constants/node-limits/config.ts` - are limits defined correctly?
- Check component - is it calling `getNodeLimits()` and using the values?

### TypeScript errors?
- Make sure all imports are correct
- Check type definitions in `@/types`
- Use proper types from `constants/node-limits/types.ts`

### Console errors?
- Open browser console (F12)
- Look for red errors
- Check network tab for failed requests
- Use console.log() strategically

---

## 🎓 Resources

### Internal Documentation
- `ARCHITECTURE.md` - System design
- `ADDING_NEW_NODES.md` - Node creation guide
- `constants/node-limits/README.md` - Limits system
- `QUICK_NODE_REFERENCE.md` - Quick reference

### External Resources
- [React Flow Docs](https://reactflow.dev/) - Flow library
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [Lucide Icons](https://lucide.dev/) - Icons
- [TypeScript Handbook](https://www.typescriptlang.org/docs/) - TypeScript

---

## 💡 Best Practices

1. **Follow Existing Patterns** - Look at how similar features are implemented
2. **Type Everything** - Use TypeScript to its fullest
3. **Test Thoroughly** - Test on all platforms and edge cases
4. **Document Changes** - Update docs when making significant changes
5. **Ask Questions** - Better to ask than to break things
6. **Start Small** - Don't try to change everything at once
7. **Use the Guides** - We have detailed guides for a reason!

---

## 🎯 Next Steps

Ready to start? Here's what to do:

1. ✅ Read this file (you're here!)
2. 📖 Read `ARCHITECTURE.md` for system overview
3. 🔍 Explore the codebase - look at existing nodes
4. 🎨 Try making a small change - add a button, change a color
5. 🚀 Add your first node - follow `ADDING_NEW_NODES.md`

---

## 🤝 Need Help?

- Check the relevant guide first
- Look at existing code for examples
- Search the codebase for similar implementations
- Read the error message carefully

---

**Welcome aboard! Happy coding! 🎉**

Last Updated: November 3, 2025


