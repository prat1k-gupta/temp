# Node Limits Quick Reference

## Platform-Specific Character Limits

| Platform  | Question Text | Button Text | Comment |
|-----------|--------------|-------------|---------|
| Web       | 500          | 20          | 200     |
| WhatsApp  | 160          | 20          | 150     |
| Instagram | 100          | 15          | 100     |

## Platform-Specific Button Limits

| Platform  | Max Buttons/Options |
|-----------|---------------------|
| Web       | 3                   |
| WhatsApp  | 10                  |
| Instagram | 10                  |

---

## Node Types and Their Limits

### 📝 Question Node (All Platforms)

```
┌─────────────────────────────────────┐
│  Question Node                      │
├─────────────────────────────────────┤
│  Question Text:                     │
│    - Min: 1 character               │
│    - Max: Platform-specific         │
│                                     │
│  Connections:                       │
│    - Max outputs: 1                 │
│    - Multiple inputs: ✓             │
└─────────────────────────────────────┘
```

**Use Case:** Simple message or question without user interaction

---

### ⚡ Quick Reply Node (All Platforms)

```
┌─────────────────────────────────────┐
│  Quick Reply Node                   │
├─────────────────────────────────────┤
│  Question Text:                     │
│    - Min: 1 character               │
│    - Max: Platform-specific         │
│                                     │
│  Buttons:                           │
│    - Min: 1                         │
│    - Max: Platform-specific         │
│      (Web: 3, WA/IG: 10)           │
│    - Button text max: 20 (WA/Web)  │
│                       15 (IG)      │
│                                     │
│  Connections:                       │
│    - Max outputs: Same as buttons   │
│    - Multiple inputs: ✓             │
└─────────────────────────────────────┘
```

**Use Case:** Interactive question with quick action buttons
**Note:** Automatically converts to List when button limit is reached

---

### 📋 List Node (WhatsApp & Instagram Only)

```
┌─────────────────────────────────────┐
│  List Node                          │
├─────────────────────────────────────┤
│  Question Text:                     │
│    - Min: 1 character               │
│    - Max: Platform-specific         │
│                                     │
│  List Title:                        │
│    - Max: 60 characters             │
│                                     │
│  Options:                           │
│    - Min: 1                         │
│    - Max: 10                        │
│    - Option text max: 20            │
│    - Description max: 72            │
│                                     │
│  Connections:                       │
│    - Max outputs: 10                │
│    - Multiple inputs: ✓             │
└─────────────────────────────────────┘
```

**Use Case:** Interactive list with many options
**Note:** NOT available on Web platform

---

### 💬 Comment Node (All Platforms)

```
┌─────────────────────────────────────┐
│  Comment Node                       │
├─────────────────────────────────────┤
│  Comment Text:                      │
│    - Min: 0 characters              │
│    - Max: Platform-specific         │
│      (200/150/100)                  │
│                                     │
│  Connections:                       │
│    - Max outputs: 0                 │
│    - Multiple inputs: ✗             │
└─────────────────────────────────────┘
```

**Use Case:** Documentation and notes (doesn't affect flow)

---

### ▶️ Start Node (All Platforms)

```
┌─────────────────────────────────────┐
│  Start Node                         │
├─────────────────────────────────────┤
│  Properties:                        │
│    - Fixed node                     │
│    - Cannot be deleted              │
│                                     │
│  Connections:                       │
│    - Max outputs: 1                 │
│    - Multiple inputs: ✗             │
└─────────────────────────────────────┘
```

**Use Case:** Entry point of the flow

---

## Platform-Specific Nodes

### 📱 WhatsApp Message Node

```
┌─────────────────────────────────────┐
│  WhatsApp Message Node              │
├─────────────────────────────────────┤
│  Message Text:                      │
│    - Min: 1 character               │
│    - Max: 4096 characters           │
│      (WhatsApp limit)               │
│                                     │
│  Connections:                       │
│    - Max outputs: 1                 │
│    - Multiple inputs: ✓             │
└─────────────────────────────────────┘
```

---

### 📷 Instagram DM Node

```
┌─────────────────────────────────────┐
│  Instagram DM Node                  │
├─────────────────────────────────────┤
│  Message Text:                      │
│    - Min: 1 character               │
│    - Max: 1000 characters           │
│      (Instagram limit)              │
│                                     │
│  Connections:                       │
│    - Max outputs: 1                 │
│    - Multiple inputs: ✓             │
└─────────────────────────────────────┘
```

---

### 📖 Instagram Story Node

```
┌─────────────────────────────────────┐
│  Instagram Story Node               │
├─────────────────────────────────────┤
│  Story Text:                        │
│    - Min: 0 characters              │
│    - Max: 500 characters            │
│                                     │
│  Connections:                       │
│    - Max outputs: 1                 │
│    - Multiple inputs: ✓             │
└─────────────────────────────────────┘
```

---

### 📋 Web Form Node

```
┌─────────────────────────────────────┐
│  Web Form Node                      │
├─────────────────────────────────────┤
│  Form Title:                        │
│    - Min: 1 character               │
│    - Max: 200 characters            │
│                                     │
│  Connections:                       │
│    - Max outputs: 1                 │
│    - Multiple inputs: ✓             │
└─────────────────────────────────────┘
```

---

## Automatic Conversions

### Question → Quick Reply
**Trigger:** When you add the first button to a Question node
**Result:** Node converts to Quick Reply type

### Quick Reply → List
**Trigger:** When you exceed the button limit for the platform
- Web: More than 3 buttons → NOT converted (no list support)
- WhatsApp: More than 10 buttons → Converts to List
- Instagram: More than 10 buttons → Converts to List

### List → Quick Reply
**Trigger:** When you delete options and have 3 or fewer remaining
**Result:** List converts back to Quick Reply

---

## Connection Rules

| Node Type      | Max Outputs | Multiple Inputs | Multiple Outputs |
|----------------|-------------|-----------------|------------------|
| Start          | 1           | ✗               | ✗                |
| Question       | 1           | ✓               | ✗                |
| Quick Reply    | 3-10*       | ✓               | ✓                |
| List           | 10          | ✓               | ✓                |
| Comment        | 0           | ✗               | ✗                |
| WhatsApp Msg   | 1           | ✓               | ✗                |
| Instagram DM   | 1           | ✓               | ✗                |
| Instagram Story| 1           | ✓               | ✗                |
| Web Form       | 1           | ✓               | ✗                |

*Depends on platform button limits

---

## Validation Functions

```typescript
// Get all limits for a node
getNodeLimits(nodeType, platform)

// Validate text
isTextWithinNodeLimits(text, nodeType, platform, fieldType)

// Validate buttons
areButtonsWithinNodeLimits(count, nodeType, platform)

// Validate options
areOptionsWithinNodeLimits(count, nodeType, platform)

// Check capabilities
nodeSupportsButtons(nodeType)
nodeSupportsOptions(nodeType)
nodeSupportsMultipleOutputs(nodeType, platform)

// Get max connections
getMaxConnections(nodeType, platform)
```

---

## Common Patterns

### ✅ Valid Flow
```
Start → Question → Quick Reply (3 buttons) → Questions (3 paths)
```

### ✅ Valid Flow
```
Start → Quick Reply (10 buttons) → Auto-converts to List → ...
```

### ❌ Invalid Flow
```
Start → Comment → ... (Comments can't have outputs)
```

### ❌ Invalid Flow
```
Start → Web Quick Reply (4 buttons) (Web max is 3)
```

---

## Platform Support Matrix

| Node Type      | Web | WhatsApp | Instagram |
|----------------|-----|----------|-----------|
| Question       | ✓   | ✓        | ✓         |
| Quick Reply    | ✓   | ✓        | ✓         |
| List           | ✗   | ✓        | ✓         |
| Comment        | ✓   | ✓        | ✓         |
| Start          | ✓   | ✓        | ✓         |
| Message Node   | ✗   | ✓        | ✗         |
| DM Node        | ✗   | ✗        | ✓         |
| Story Node     | ✗   | ✗        | ✓         |
| Form Node      | ✓   | ✗        | ✗         |

