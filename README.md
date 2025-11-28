# 🎨 Magic Flow

A powerful, platform-aware flow builder for creating conversational experiences across Web, WhatsApp, and Instagram.

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Open http://localhost:3000
```

---

## 📚 Documentation

### 🎯 **New to the Project?**

Start here:
1. **[`README_GETTING_STARTED.md`](./README_GETTING_STARTED.md)** - Complete onboarding guide
2. **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** - System architecture overview

### 🛠️ **Development Guides**

Adding features:
- **[`ADDING_NEW_NODES.md`](./ADDING_NEW_NODES.md)** - Complete guide to adding new node types (with examples!)
- **[`QUICK_NODE_REFERENCE.md`](./QUICK_NODE_REFERENCE.md)** - Quick checklist for node addition

### 📖 **System Documentation**

Understanding the internals:
- **[`constants/node-limits/README.md`](./constants/node-limits/README.md)** - Node limits system (modular)
- **[`NODE_LIMITS_REFACTOR.md`](./NODE_LIMITS_REFACTOR.md)** - Recent refactoring details
- **[`NODE_LIMITS_INTEGRATION.md`](./NODE_LIMITS_INTEGRATION.md)** - Integration summary
- **[`CLEANUP_SUMMARY.md`](./CLEANUP_SUMMARY.md)** - Codebase cleanup notes

---

## 🏗️ Project Structure

```
magic-flow/
├── 📱 app/                         # Next.js app
│   └── page.tsx                    # Main flow editor
├── 🎨 components/
│   ├── nodes/                      # Node components
│   │   ├── core/                   # Base nodes
│   │   ├── web/                    # Web nodes
│   │   ├── whatsapp/              # WhatsApp nodes
│   │   └── instagram/             # Instagram nodes
│   ├── node-sidebar.tsx           # Node palette
│   └── properties-panel.tsx       # Node editor
├── 🔧 constants/
│   ├── node-limits/               # Node limits (modular) ⭐
│   ├── node-types.ts              # Type mappings
│   └── platform-limits.ts         # Platform limits
├── 🛠️ utils/
│   ├── node-operations.ts         # Node utilities
│   ├── platform-labels.ts         # Platform helpers
│   └── version-storage.ts         # Version management
└── 📝 docs/                        # You are here!
```

⭐ **Recently refactored** - Now modular and well-documented!

---

## ✨ Features

### 🎯 **Multi-Platform Support**
- Web flows
- WhatsApp conversations
- Instagram DMs and Stories

### 🧩 **Rich Node Types**
- Question nodes
- Quick reply buttons
- Interactive lists
- Comments and annotations
- Platform-specific nodes

### 📊 **Smart Validation**
- Character limits per platform
- Button/option constraints
- Connection rules
- Real-time validation

### 📝 **Version Management**
- Draft mode
- Version history
- Publish/revert
- Change tracking

### 🎨 **Beautiful UI**
- Platform-specific styling
- Drag-and-drop interface
- Intuitive properties panel
- Responsive design

---

## 🎓 Learning Path

### For New Developers

**Day 1:** Orientation
1. Read [`README_GETTING_STARTED.md`](./README_GETTING_STARTED.md)
2. Explore the UI - create some flows
3. Study [`ARCHITECTURE.md`](./ARCHITECTURE.md)

**Day 2:** Understanding Systems
1. Read [`constants/node-limits/README.md`](./constants/node-limits/README.md)
2. Browse existing node components
3. Understand validation flow

**Day 3:** Building
1. Follow [`ADDING_NEW_NODES.md`](./ADDING_NEW_NODES.md)
2. Add a simple test node
3. Test on different platforms

**Week 1 Goal:** Add your first production-ready node! 🎉

### For Experienced Developers

Quick references:
- [`QUICK_NODE_REFERENCE.md`](./QUICK_NODE_REFERENCE.md) - Node addition checklist
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) - Design principles
- [`constants/node-limits/README.md`](./constants/node-limits/README.md) - Limits API

---

## 🛠️ Common Tasks

### Adding a New Node Type
**Guide:** [`ADDING_NEW_NODES.md`](./ADDING_NEW_NODES.md)  
**Checklist:** [`QUICK_NODE_REFERENCE.md`](./QUICK_NODE_REFERENCE.md)

Complete step-by-step guide with example code!

### Modifying Node Limits
**File:** `constants/node-limits/config.ts`  
**Docs:** [`constants/node-limits/README.md`](./constants/node-limits/README.md)

### Changing Platform Styling
**Files:** 
- `components/nodes/{platform}/` - Node styling
- `utils/platform-labels.ts` - Colors & labels

### Adding Validation Rules
**File:** `constants/node-limits/helpers.ts`  
**Docs:** [`constants/node-limits/README.md`](./constants/node-limits/README.md)

---

## 🧪 Development

### Commands

```bash
# Development
npm run dev                # Start dev server
npm run build              # Production build
npm run lint               # Run linter

# Type checking
npx tsc --noEmit           # Check TypeScript

# Testing
npm run build 2>&1 | head -50   # Quick build check
```

### Code Style

```typescript
// Use TypeScript strictly
import type { Platform } from "@/types"
import { getNodeLimits } from "@/constants"

// Components
export function MyNode({ data, selected }: { data: NodeData; selected?: boolean }) {
  const nodeLimits = getNodeLimits("myNode", data.platform)
  // ...
}
```

---

## 🎨 Tech Stack

- **Framework:** Next.js 14 (App Router)
- **UI Library:** React 18
- **Flow Editor:** React Flow
- **Styling:** Tailwind CSS
- **Icons:** Lucide React
- **Type Safety:** TypeScript
- **State:** React Hooks

---

## 📖 Architecture Highlights

### Modular Node Limits ⭐ **NEW!**

Node constraints are now organized in a clean, modular structure:

```typescript
// Easy to use!
import { getNodeLimits, areButtonsWithinNodeLimits } from "@/constants"

const limits = getNodeLimits("quickReply", "whatsapp")
console.log(limits.buttons?.max) // 10

const validation = areButtonsWithinNodeLimits(5, "quickReply", "whatsapp")
if (validation.valid) {
  // All good!
}
```

**Details:** [`constants/node-limits/README.md`](./constants/node-limits/README.md)

### Platform-Specific Rendering

Nodes automatically adapt to the selected platform:

```typescript
const nodeType = getPlatformSpecificNodeType("question", "whatsapp")
// Returns: "whatsappQuestion"

const label = getNodeLabel("question", "instagram")  
// Returns: "Instagram Message"
```

### Version Management

Built-in version control with draft/publish workflow:

```typescript
const { 
  isEditMode, 
  toggleEditMode,
  publishVersion,
  resetToPublished 
} = useVersionManager()
```

---

## 🐛 Troubleshooting

### Node Not Appearing?
- Check `components/node-sidebar.tsx` - is it in the template array?
- Check `utils/platform-labels.ts` - platform support enabled?

### Validation Not Working?
- Check `constants/node-limits/config.ts` - limits defined?
- Check component - using `getNodeLimits()`?

### TypeScript Errors?
- Ensure imports are correct
- Check types in `@/types`
- Run `npx tsc --noEmit` for full report

**More help:** [`README_GETTING_STARTED.md`](./README_GETTING_STARTED.md#debugging-tips)

---

## 📚 Documentation Index

| Document | Purpose | Audience |
|----------|---------|----------|
| **README.md** | Overview (this file) | Everyone |
| **README_GETTING_STARTED.md** | Complete onboarding | New developers |
| **ARCHITECTURE.md** | System design | All developers |
| **ADDING_NEW_NODES.md** | Node creation guide | Feature developers |
| **QUICK_NODE_REFERENCE.md** | Quick checklist | Feature developers |
| **constants/node-limits/README.md** | Limits system API | All developers |
| **NODE_LIMITS_REFACTOR.md** | Recent changes | Maintainers |
| **NODE_LIMITS_INTEGRATION.md** | Integration details | Maintainers |

---

## 🤝 Contributing

1. **Read the guides** - We have comprehensive documentation!
2. **Follow patterns** - Look at existing code
3. **Test thoroughly** - All platforms, all edge cases
4. **Update docs** - Keep documentation current
5. **Type everything** - TypeScript is your friend

---

## 💡 Best Practices

✅ **DO:**
- Use `getNodeLimits()` for all validation
- Follow existing node patterns
- Test on all platforms
- Document complex logic
- Use TypeScript strictly

❌ **DON'T:**
- Hardcode limits
- Bypass validation
- Skip testing
- Mix concerns
- Ignore TypeScript errors

---

## 🎯 Quick Links

**Getting Started:**
- 🚀 [Getting Started Guide](./README_GETTING_STARTED.md)
- 🏗️ [Architecture](./ARCHITECTURE.md)

**Development:**
- ➕ [Adding Nodes](./ADDING_NEW_NODES.md)
- ✅ [Quick Reference](./QUICK_NODE_REFERENCE.md)

**API Reference:**
- 📊 [Node Limits](./constants/node-limits/README.md)
- 🎨 [Platform Labels](./utils/platform-labels.ts)

---

## 📝 License

[Add your license here]

---

## 🙏 Acknowledgments

Built with:
- [React Flow](https://reactflow.dev/)
- [Next.js](https://nextjs.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Lucide Icons](https://lucide.dev/)

---

**Happy Building! 🎨✨**

---

*Last Updated: November 3, 2025*  
*Version: 2.0.0 (Modular Node Limits)*


