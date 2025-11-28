# 🤖 Magic Flow - AI Features Guide

Complete guide to using and extending AI capabilities in Magic Flow.

---

## 📦 Installation

### 1. Install Dependencies

```bash
npm install ai @ai-sdk/openai zod
# or
pnpm add ai @ai-sdk/openai zod
```

### 2. Configure Environment

Create or update `.env.local`:

```env
# OpenAI API Key (required for AI features)
OPENAI_API_KEY=sk-your-api-key-here
```

### 3. That's It!

The AI layer is now ready to use. All infrastructure is already set up.

---

## 🎯 Features

### 1. **Per-Node AI Copy Improver** ✨

Improve text quality in any node with one click.

**Features:**
- ✍️ Improve clarity and engagement
- 📏 Auto-shorten to fit platform limits
- 🎯 Platform-aware (WhatsApp, Instagram, Web)
- 🔄 Context-aware improvements

**Already integrated in:**
- Web Question Node (demo)

### 2. **Smart Text Shortening** 📏

Automatically shorten text that exceeds platform character limits.

**Features:**
- Preserves meaning
- Platform-specific optimization
- Shows character count and reduction

---

## 🚀 Quick Start - Using AI in Nodes

### Method 1: Using the AIToolbar Component (Easiest)

```tsx
import { AIToolbar } from '@/components/ai/ai-toolbar'

export function MyNode({ data }: NodeProps) {
  const [text, setText] = useState(data.text || '')
  const maxLength = 500

  return (
    <div>
      <Textarea 
        value={text} 
        onChange={(e) => setText(e.target.value)}
      />
      
      {/* Add AI toolbar - that's it! */}
      <AIToolbar
        value={text}
        onChange={setText}
        nodeType="myNode"
        platform={data.platform}
        field="text"
        maxLength={maxLength}
      />
    </div>
  )
}
```

### Method 2: Using the AITextField Component (Even Easier)

```tsx
import { AITextField } from '@/components/ai/ai-text-field'

export function MyNode({ data }: NodeProps) {
  const [text, setText] = useState(data.text || '')

  return (
    <AITextField
      value={text}
      onChange={setText}
      nodeType="myNode"
      platform={data.platform}
      field="text"
      maxLength={500}
      placeholder="Enter your text..."
    />
  )
}
```

### Method 3: Using the useNodeAI Hook (Most Flexible)

```tsx
import { useNodeAI } from '@/hooks/use-node-ai'

export function MyNode({ data }: NodeProps) {
  const [text, setText] = useState(data.text || '')
  
  const ai = useNodeAI({
    nodeType: 'myNode',
    platform: data.platform,
    capabilities: ['improve-copy', 'shorten']
  })

  const handleImprove = async () => {
    const result = await ai.improveCopy(text, 'text', { maxLength: 500 })
    if (result) {
      setText(result.improvedText)
    }
  }

  return (
    <div>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} />
      <Button onClick={handleImprove} disabled={ai.loading}>
        ✨ Improve with AI
      </Button>
    </div>
  )
}
```

---

## 🔧 Advanced Usage

### Creating Custom AI Tools

Want to add a new AI capability? Here's how:

#### 1. Define the Tool Type

```typescript
// types/ai.ts
export type AIToolName = 
  | 'improve-copy'
  | 'shorten'
  | 'your-new-tool'  // Add here
```

#### 2. Create the Tool Implementation

```typescript
// lib/ai/tools/your-new-tool.ts
import type { AITool, AIToolResult } from '@/types/ai'
import { getAIClient } from '../core/ai-client'

export const yourNewTool: AITool<RequestType, ResponseType> = {
  name: 'your-new-tool',
  description: 'What your tool does',
  
  async execute(request: RequestType): Promise<AIToolResult<ResponseType>> {
    try {
      const aiClient = getAIClient()
      
      // Build your prompts
      const systemPrompt = "You are..."
      const userPrompt = `Task: ${request.input}`
      
      // Call AI
      const response = await aiClient.generate({
        systemPrompt,
        userPrompt
      })
      
      // Return result
      return {
        success: true,
        data: { output: response.text }
      }
    } catch (error) {
      return {
        success: false,
        error: 'Failed to execute tool'
      }
    }
  }
}
```

#### 3. Register the Tool

```typescript
// lib/ai/tools/index.ts
export { yourNewTool } from './your-new-tool'

import { registerAITool } from '../core/ai-registry'
import { yourNewTool } from './your-new-tool'

registerAITool(yourNewTool)
```

#### 4. Create API Endpoint

```typescript
// app/api/ai/your-new-tool/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { yourNewTool } from '@/lib/ai/tools/your-new-tool'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const result = await yourNewTool.execute(body)
  
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }
  
  return NextResponse.json(result.data)
}
```

#### 5. Use in Nodes

```typescript
const ai = useNodeAI({
  nodeType: 'myNode',
  capabilities: ['your-new-tool']
})

// Tool is automatically available!
```

---

## 🏗️ Architecture

```
/types/ai.ts                      # Type definitions
/lib/ai/
  ├── core/
  │   ├── ai-client.ts            # AI SDK wrapper
  │   ├── ai-context.ts           # Context builder
  │   └── ai-registry.ts          # Tool registry
  ├── tools/
  │   ├── improve-copy.ts         # Copy improvement
  │   ├── shorten-text.ts         # Text shortening
  │   └── your-tool.ts            # Your custom tools
  └── index.ts
/hooks/
  └── use-node-ai.ts              # Main React hook
/components/ai/
  ├── ai-toolbar.tsx              # AI action buttons
  └── ai-text-field.tsx           # AI-enhanced input
/app/api/ai/
  ├── improve-copy/route.ts       # API endpoints
  └── shorten-text/route.ts
```

---

## 📖 API Reference

### `useNodeAI(config)`

Main hook for AI capabilities.

```typescript
const ai = useNodeAI({
  nodeType: string              // Required: Type of node
  platform: Platform            // Required: Target platform
  capabilities: AIToolName[]    // Required: Enabled tools
})

// Returns:
{
  improveCopy: (text, field, options?) => Promise<ImproveCopyResponse>
  shortenText: (text, targetLength, options?) => Promise<ShortenTextResponse>
  loading: boolean
  error: string | null
  hasCapability: (name) => boolean
}
```

### `AIToolbar` Component

Pre-built toolbar with AI actions.

```typescript
<AIToolbar
  value={string}           // Current text
  onChange={(val) => {}}   // Update handler
  nodeType={string}        // Node type
  platform={Platform}      // Platform
  field={string}           // Field name
  maxLength={number}       // Optional: character limit
/>
```

### `AITextField` Component

Text area with built-in AI toolbar.

```typescript
<AITextField
  value={string}
  onChange={(val) => {}}
  nodeType={string}
  platform={Platform}
  field={string}
  maxLength={number}
  placeholder={string}
  rows={number}
/>
```

---

## 🎨 Customization

### Custom System Prompts

Override default prompts:

```typescript
const ai = useNodeAI({
  nodeType: 'myNode',
  platform: 'whatsapp',
  capabilities: ['improve-copy'],
  systemPrompt: 'You are a friendly assistant specialized in...'
})
```

### Platform-Specific Behavior

The AI automatically adapts to platforms:

- **WhatsApp**: Conversational, emoji-friendly, concise
- **Instagram**: Engaging, visual, modern tone
- **Web**: Professional, clear, structured

### Node-Specific Context

Provide additional context:

```typescript
const result = await ai.improveCopy(text, 'question', {
  context: {
    purpose: 'collecting user feedback',
    flowContext: 'after purchase',
    previousNodes: ['welcome', 'order-confirmation']
  }
})
```

---

## 🔮 Coming Soon

### Phase 2: Smart Node Recommender
- Suggest next nodes based on flow context
- Learn from user patterns
- One-click node addition

### Phase 3: AI Flow Builder
- Generate complete flows from text prompts
- Interactive refinement
- Template library

---

## 💡 Best Practices

1. **Always provide maxLength** for character-limited platforms
2. **Use platform context** - it makes AI suggestions better
3. **Combine improve + shorten** for best results
4. **Test with real content** - AI works better with context
5. **Don't over-rely on AI** - review generated content

---

## 🐛 Troubleshooting

### AI buttons not showing?

Check:
1. API key is set in `.env.local`
2. Dependencies are installed
3. Component is imported correctly

### "Failed to improve copy" error?

Check:
1. OpenAI API key is valid
2. You have API credits
3. Check browser console for details

### API key not working?

Make sure `.env.local` is in the root directory and the dev server was restarted after adding it.

---

## 📝 Examples

See the Web Question Node for a complete working example:
`/components/nodes/web/web-question-node.tsx`

---

## 🤝 Contributing

Want to add a new AI tool? Follow the "Creating Custom AI Tools" guide above and submit a PR!

---

## 📚 Resources

- [Vercel AI SDK Docs](https://sdk.vercel.ai/docs)
- [OpenAI API Docs](https://platform.openai.com/docs)
- Magic Flow Node Guide: `/ADDING_NEW_NODES.md`

---

**Built with ❤️ using Vercel AI SDK**

