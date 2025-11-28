# 🚀 AI Features Setup - Quick Start

## ⚡ 2-Minute Setup

### Step 1: Install Dependencies

Run ONE of these commands:

```bash
# Using npm
npm install ai @ai-sdk/openai zod

# OR using pnpm
pnpm add ai @ai-sdk/openai zod
```

### Step 2: Add API Key

Create `.env.local` in the project root (if it doesn't exist):

```env
OPENAI_API_KEY=sk-your-openai-api-key-here
```

**Get your API key from**: https://platform.openai.com/api-keys

### Step 3: Restart Dev Server

```bash
# Stop the current server (Ctrl+C)
# Then restart
npm run dev
```

---

## ✅ Verify Setup

1. **Open any flow** in the editor
2. **Click on a Question node**
3. **Click to edit the question text**
4. **You should see**:
   - ✨ "Improve" button
   - 📏 "Shorten" button (if text is over limit)
   - Character counter

---

## 🎯 Test It Out

1. Enter some text in a Question node
2. Click **✨ Improve**
3. Watch the AI enhance your copy!
4. If text is too long, click **📏 Shorten**

---

## 📁 What We Built

```
✅ /types/ai.ts                          - Type definitions
✅ /lib/ai/                              - AI core infrastructure
   ├── core/                           - Client, context, registry
   └── tools/                          - improve-copy, shorten-text
✅ /hooks/use-node-ai.ts                - React hook for AI
✅ /components/ai/                      - UI components
   ├── ai-toolbar.tsx                  - AI action buttons
   └── ai-text-field.tsx              - AI-enhanced input
✅ /app/api/ai/                         - API endpoints
   ├── improve-copy/route.ts
   └── shorten-text/route.ts
✅ Demo in Web Question Node            - See it in action!
```

---

## 🔮 What's Next?

Now that the infrastructure is ready, you can:

### 1. **Add AI to More Nodes**

Just import and use:

```tsx
import { AIToolbar } from '@/components/ai/ai-toolbar'

// Add to any text field
<AIToolbar
  value={text}
  onChange={setText}
  nodeType="yourNode"
  platform={platform}
  field="text"
  maxLength={500}
/>
```

### 2. **Create Custom AI Tools**

Follow the guide in `AI_FEATURES_GUIDE.md` to add:
- Generate button labels
- Suggest next nodes
- Create flow templates
- And more!

### 3. **Extend Existing Tools**

Modify prompts in:
- `/lib/ai/tools/improve-copy.ts`
- `/lib/ai/tools/shorten-text.ts`

---

## 🐛 Troubleshooting

### "OpenAI API key not configured"
➡️ Make sure `.env.local` exists and has your API key
➡️ Restart the dev server after adding the key

### Dependencies not installing
➡️ Try: `rm -rf node_modules package-lock.json && npm install`
➡️ Or use pnpm instead

### AI buttons not showing
➡️ Check browser console for errors
➡️ Make sure you're editing a text field (not just viewing)
➡️ Verify the component import is correct

---

## 💡 Tips

1. **Start with small improvements** - Test on a few nodes first
2. **Review AI suggestions** - AI is smart but not perfect
3. **Customize prompts** - Make them work for your use case
4. **Monitor API usage** - Check your OpenAI dashboard

---

## 📚 Full Documentation

See `AI_FEATURES_GUIDE.md` for:
- Complete API reference
- Advanced usage patterns
- Creating custom tools
- Best practices
- Examples

---

## 🎉 You're All Set!

The AI layer is production-ready and extensible. Start adding AI to your nodes and watch Magic Flow become even more magical! ✨

**Questions?** Check the full guide or the inline code comments.

