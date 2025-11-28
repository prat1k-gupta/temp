# AI Button Features Guide

AI-powered button generation and improvement for Quick Reply nodes across all platforms.

## 🚀 Features

### 1. **AI Button Generation**
- **What**: Generate button options based on the question/context
- **Where**: Quick Reply nodes (Web, WhatsApp, Instagram)
- **When**: Shows when there are no buttons and a question exists
- **How**: Click "Generate Buttons" → AI creates smart options

### 2. **Individual Button Improvement**
- **What**: Improve a single button's copy using AI
- **Where**: Each button in Quick Reply nodes
- **When**: Hover over a button to see the ✨ sparkle icon
- **How**: Click the sparkle → AI enhances the text

### 3. **Question Text AI**
- **What**: Improve or shorten question text
- **Where**: Question textarea in Quick Reply nodes
- **When**: When editing the question
- **How**: Use the floating AI toolbar (Improve/Shorten buttons)

---

## 📋 Usage Examples

### Example 1: Generate Buttons
```
Question: "What type of support do you need?"

AI Generates:
✅ Technical Support
✅ Billing Question
✅ General Inquiry
```

### Example 2: Improve Button
```
Before: "contact support"
After:  "Contact Support"
```

### Example 3: Platform-Specific Limits
- **Web**: 10 buttons, 20 chars each
- **WhatsApp**: 10 buttons, 20 chars each
- **Instagram**: 10 buttons, 15 chars each

---

## 🎯 Quick Reply Nodes Updated

### ✅ Web Quick Reply (`/components/nodes/web/web-quick-reply-node.tsx`)
- AI question improvements
- AI button generation
- Individual button improvement
- Platform: Web

### ✅ WhatsApp Quick Reply (`/components/nodes/whatsapp/whatsapp-quick-reply-node.tsx`)
- AI question improvements
- AI button generation
- Individual button improvement
- Platform: WhatsApp

### ✅ Instagram Quick Reply (`/components/nodes/instagram/instagram-quick-reply-node.tsx`)
- AI question improvements
- AI button generation
- Individual button improvement
- Platform: Instagram

---

## 🏗️ Technical Implementation

### Components Created

#### 1. **AIButtonToolbar** (`/components/ai/ai-button-toolbar.tsx`)
```tsx
<AIButtonToolbar
  questionContext="What do you need?"
  buttons={buttons}
  onUpdateButtons={handleUpdateButtons}
  maxButtons={10}
  maxButtonLength={20}
  nodeType="webQuickReply"
  platform="web"
/>
```

**Features:**
- Shows "Generate Buttons" when no buttons exist
- Shows "Fill remaining" when buttons < max
- Handles AI generation with proper formatting
- Respects platform-specific limits

#### 2. **AIButtonActions** (`/components/ai/ai-button-toolbar.tsx`)
```tsx
<AIButtonActions
  label={buttonText}
  onImprove={handleImprove}
  maxLength={20}
  disabled={loading}
/>
```

**Features:**
- Individual button improvement
- Sparkle icon indicator
- Hover-to-reveal UI
- Loading states

### Hooks Created

#### **useAIButtonGenerator** (`/hooks/use-node-ai.ts`)
```tsx
const ai = useAIButtonGenerator('webQuickReply', 'web')

// Generate buttons
const result = await ai.generateButtons(
  "What do you need?",
  3,
  { maxLength: 20 }
)

// Improve copy
const improved = await ai.improveCopy(
  "contact us",
  "button",
  { maxLength: 20 }
)
```

### AI Tools Created

#### **generate-buttons** (`/lib/ai/tools/generate-buttons.ts`)
- Generates button options based on context
- Respects platform limits
- Avoids duplicating existing buttons
- Returns structured button data

### API Routes

#### **POST /api/ai/generate-buttons**
```typescript
// Request
{
  context: "What do you need?",
  count: 3,
  platform: "web",
  maxLength: 20,
  existingOptions: ["Option 1"]
}

// Response
{
  options: [
    {
      label: "Technical Support",
      value: "technical_support",
      description: "Get help with technical issues"
    }
  ]
}
```

---

## 🎨 UI/UX Features

### Visual Indicators
1. **Generate Button**: Purple border, wand icon
2. **Improve Button**: Sparkle icon, appears on hover
3. **AI Toolbar**: Floating on question textarea
4. **Loading States**: Spinner animations

### User Flow
1. User creates Quick Reply node
2. User types a question
3. AI offers to generate buttons
4. User clicks "Generate Buttons"
5. AI creates 3-10 relevant buttons
6. User can improve individual buttons
7. User can improve the question text

### Toast Notifications
- ✅ "Generated 3 buttons!" - Success
- ✅ "Button improved!" - Success with reason
- ❌ "Failed to generate buttons" - Error
- ℹ️ "Please add a question first" - Info

---

## 🧪 Testing

### Test Scenarios

#### 1. **Button Generation**
- [ ] Generate buttons with valid question
- [ ] Generate buttons with short question
- [ ] Generate buttons with long question
- [ ] Generate respects platform limits
- [ ] No duplicates with existing buttons

#### 2. **Button Improvement**
- [ ] Improve empty button → no change
- [ ] Improve short button → enhanced
- [ ] Improve over-limit button → shortened
- [ ] Loading state shows correctly
- [ ] Error handling works

#### 3. **Cross-Platform**
- [ ] Web Quick Reply - all features work
- [ ] WhatsApp Quick Reply - all features work
- [ ] Instagram Quick Reply - all features work
- [ ] Platform limits respected
- [ ] Platform-specific prompts

---

## 🔧 Configuration

### Environment Variables
```bash
OPENAI_API_KEY=your-openai-api-key
```

### Node Limits (`/constants/node-limits`)
```typescript
webQuickReply: {
  buttons: {
    max: 10,
    textMaxLength: 20
  }
}

whatsappQuickReply: {
  buttons: {
    max: 10,
    textMaxLength: 20
  }
}

instagramQuickReply: {
  buttons: {
    max: 10,
    textMaxLength: 15
  }
}
```

---

## 📊 Performance

### Optimizations
1. **Debouncing**: Not needed (button clicks)
2. **Caching**: None (always fresh)
3. **Parallel Calls**: No (sequential for safety)
4. **Rate Limiting**: Handled by API

### Response Times
- Button Generation: ~2-4 seconds
- Button Improvement: ~1-2 seconds
- Error Recovery: Immediate

---

## 🐛 Troubleshooting

### Common Issues

#### "Generate Buttons" doesn't show
- **Cause**: No question entered
- **Fix**: Add a question first

#### AI button clicks don't work
- **Cause**: Focus issue with textarea
- **Fix**: Already fixed with `onMouseDown` handler

#### Buttons are too long
- **Cause**: AI didn't respect limit
- **Fix**: AI tool now enforces maxLength

#### No AI response
- **Cause**: Missing API key
- **Fix**: Add `OPENAI_API_KEY` to `.env.local`

### Debug Mode
```typescript
// Enable console logs
localStorage.setItem('debug_ai', 'true')

// Check API calls
console.log('[useNodeAI] Generating buttons:', requestBody)
console.log('[useNodeAI] Response status:', response.status)
```

---

## 🚀 Future Enhancements

### Potential Features
1. **Bulk Improve**: Improve all buttons at once
2. **Smart Suggestions**: Context-aware button recommendations
3. **A/B Testing**: Generate multiple button sets
4. **Templates**: Pre-defined button patterns
5. **Analytics**: Track which buttons perform best
6. **Multi-language**: Generate buttons in different languages

### Technical Improvements
1. Streaming responses for faster perceived performance
2. Offline mode with cached suggestions
3. Custom AI models per platform
4. User feedback loop for improvements

---

## 📚 Related Documentation

- [AI Features Guide](/AI_FEATURES_GUIDE.md) - Overview of all AI features
- [Setup AI](/SETUP_AI.md) - Initial setup instructions
- [Node Limits Guide](/NODE_LIMITS_GUIDE.md) - Platform limits reference
- [Adding New Nodes](/ADDING_NEW_NODES.md) - How to create nodes with AI

---

## 🎉 Summary

You now have **AI-powered button generation and improvement** across all Quick Reply nodes! 

### What You Can Do:
✨ Generate smart button options from questions
✨ Improve individual button copy
✨ Shorten/improve question text
✨ Works on Web, WhatsApp, and Instagram
✨ Respects platform-specific limits
✨ Beautiful, intuitive UI

### How to Use:
1. Create a Quick Reply node
2. Add a question
3. Click "Generate Buttons"
4. Hover over buttons to improve them
5. Use AI toolbar on question text

**Enjoy building better flows with AI! 🚀**

