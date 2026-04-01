# Design System Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inherited Sampling Central theme with a clean, ManyChat-inspired token system — new color palette, semantic tokens, scoped platform theming, full dark mode.

**Architecture:** Pure CSS variables in `globals.css` as single source of truth. Tailwind v4 `@theme inline` maps CSS vars to utility classes. No TypeScript color definitions — CSS owns all colors. Platform theming scoped to `--platform-accent` for canvas handles only.

**Tech Stack:** Tailwind CSS v4, shadcn/ui, CSS custom properties, `@theme inline`, `color-mix()`

**Spec:** `docs/superpowers/specs/2026-04-01-design-system-cleanup.md`

---

## File Structure

**Delete:**
- `styles/globals.css` — unused OKLch version

**Rewrite:**
- `app/globals.css` — full token system rewrite

**Create:**
- `constants/edge-styles.ts` — shared edge style constant (replaces 30+ hardcoded `#6366f1` instances)

**Modify:**
- `lib/platform-config.ts` — remove `colors` object
- `app/login/page.tsx` — replace hardcoded brand colors
- `app/register/page.tsx` — replace hardcoded brand colors
- `app/(dashboard)/flows/page.tsx` — replace hardcoded brand colors
- `app/(dashboard)/templates/page.tsx` — replace hardcoded brand colors
- `app/(dashboard)/flow-templates/page.tsx` — replace hardcoded brand colors
- `app/flow/[id]/page.tsx` — edge styles + hardcoded colors
- `app/template/[id]/page.tsx` — edge styles
- `components/properties-panel.tsx` — node type badge colors + misc
- `components/node-sidebar.tsx` — brand text color
- `components/connection-menu.tsx` — node category icon colors
- `components/template-editor-modal.tsx` — icon color + edge styles
- `components/template-sidebar-section.tsx` — icon color
- `components/template-builder.tsx` — button + section colors
- `components/template-preview.tsx` — SKIP (WhatsApp UI simulation, intentional)
- `components/ai/ai-suggestions-panel.tsx` — AI color map
- `components/ai/ai-button-toolbar.tsx` — AI sparkle/spinner colors
- `components/ai/ai-toolbar.tsx` — AI sparkle/spinner + gradient text
- `components/ai/ai-button-suggestions.tsx` — platform color map
- `components/ai/suggested-nodes.tsx` — AI color map
- `components/ai/ai-assistant.tsx` — sparkle icon colors
- `components/nodes/core/base-node.tsx` — remove getPlatformConfig colors, use CSS token
- `components/nodes/action/transfer-node.tsx` — keep `#7c2d12` (node identity)
- `components/nodes/action/api-fetch-node.tsx` — keep `#1a365d` (node identity)
- `components/nodes/action/template-message-node.tsx` — keep `#075e54`/`#00a884` (WhatsApp brand)
- `components/nodes/fulfillment/event-node.tsx` — replace `#052762` with primary token
- `components/nodes/fulfillment/tracking-notification-node.tsx` — replace `#052762`
- `components/nodes/fulfillment/retail-store-node.tsx` — replace `#052762`
- `components/nodes/fulfillment/generic-fulfillment-node.tsx` — replace `#052762`
- `components/nodes/fulfillment/home-delivery-node.tsx` — replace `#052762`
- `hooks/use-node-operations.ts` — edge style constant
- `hooks/use-flow-interactions.ts` — edge style constant
- `hooks/use-flow-ai.ts` — edge style constant
- `hooks/use-version-manager.ts` — edge style constant
- `utils/flow-plan-builder.ts` — edge style constant
- `utils/whatsapp-converter.ts` — edge style constant
- `lib/ai/tools/generate-flow.ts` — edge style constant
- `data/flows.json` — edge stroke color

---

## Phase 1 — Foundation

### Task 1: Rewrite globals.css with new token system

**Files:**
- Rewrite: `app/globals.css`

- [ ] **Step 1: Rewrite the `:root` block**

Replace the entire `:root` block in `app/globals.css` with the new token values. Key changes from current:
- `--primary`: `#052762` → `#2872F4` (Freestand blue, was dark navy)
- `--secondary`: `#0A49B7` → `#f3f4f6` (gray, was blue)
- `--accent`: `#2872F4` → `#f3f4f6` (gray for hover backgrounds, was blue)
- `--muted`: `#f5f5f5` → `#f3f4f6`
- `--border`: `#d1d5db` → `#e5e7eb`
- New tokens: `--warning`, `--warning-foreground`, `--success`, `--success-foreground`, `--info`, `--info-foreground`
- New token: `--platform-accent`, `--platform-accent-foreground`
- Sidebar tokens: dark navy → light/white

```css
:root {
  /* Surfaces */
  --background: #ffffff;
  --foreground: #1f2937;
  --card: #ffffff;
  --card-foreground: #1f2937;
  --popover: #ffffff;
  --popover-foreground: #1f2937;
  --muted: #f3f4f6;
  --muted-foreground: #6b7280;

  /* Brand */
  --primary: #2872F4;
  --primary-foreground: #ffffff;

  /* Neutral secondary */
  --secondary: #f3f4f6;
  --secondary-foreground: #1f2937;
  --accent: #f3f4f6;
  --accent-foreground: #1f2937;

  /* Semantic */
  --destructive: #dc2626;
  --destructive-foreground: #ffffff;
  --warning: #f59e0b;
  --warning-foreground: #ffffff;
  --success: #10b981;
  --success-foreground: #ffffff;
  --info: #3b82f6;
  --info-foreground: #ffffff;

  /* Borders & inputs */
  --border: #e5e7eb;
  --input: #e5e7eb;
  --ring: #2872F4;

  /* Charts */
  --chart-1: #2872F4;
  --chart-2: #0A49B7;
  --chart-3: #052762;
  --chart-4: #16a34a;
  --chart-5: #dc2626;

  /* Radius */
  --radius: 0.375rem;

  /* Sidebar — light/white (ManyChat-style) */
  --sidebar: #ffffff;
  --sidebar-foreground: #374151;
  --sidebar-primary: #2872F4;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #f3f4f6;
  --sidebar-accent-foreground: #1f2937;
  --sidebar-border: #e5e7eb;
  --sidebar-ring: #2872F4;

  /* Platform accent — canvas-scoped, handle dots only */
  --platform-accent: #2872F4;
  --platform-accent-foreground: #ffffff;
}
```

- [ ] **Step 2: Rewrite the `.dark` block**

```css
.dark {
  --background: #111827;
  --foreground: #f9fafb;
  --card: #1f2937;
  --card-foreground: #f9fafb;
  --popover: #1f2937;
  --popover-foreground: #f9fafb;
  --muted: #374151;
  --muted-foreground: #9ca3af;

  --primary: #2872F4;
  --primary-foreground: #ffffff;
  --secondary: #374151;
  --secondary-foreground: #f9fafb;
  --accent: #374151;
  --accent-foreground: #f9fafb;

  --destructive: #ef4444;
  --destructive-foreground: #ffffff;
  --warning: #fbbf24;
  --warning-foreground: #111827;
  --success: #34d399;
  --success-foreground: #111827;
  --info: #60a5fa;
  --info-foreground: #ffffff;

  --border: #4b5563;
  --input: #374151;
  --ring: #2872F4;

  --chart-1: #2872F4;
  --chart-2: #0A49B7;
  --chart-3: #60a5fa;
  --chart-4: #16a34a;
  --chart-5: #ef4444;

  --sidebar: #111827;
  --sidebar-foreground: #e5e7eb;
  --sidebar-primary: #2872F4;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #1f2937;
  --sidebar-accent-foreground: #e5e7eb;
  --sidebar-border: #374151;
  --sidebar-ring: #2872F4;

  --platform-accent: #2872F4;
  --platform-accent-foreground: #ffffff;
}
```

- [ ] **Step 3: Rewrite platform overrides**

Replace the current `body[data-platform="..."]` blocks. They no longer override `--primary` or `--ring` — only `--platform-accent`.

```css
[data-platform="whatsapp"] {
  --platform-accent: #25d366;
}
[data-platform="instagram"] {
  --platform-accent: #E1306C;
}
[data-platform="web"] {
  --platform-accent: #2872F4;
}
```

- [ ] **Step 4: Rewrite `@theme inline` block**

Replace the entire `@theme inline` block with the complete version including new tokens:

```css
@theme inline {
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);

  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);

  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);

  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);

  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
  --color-info: var(--info);
  --color-info-foreground: var(--info-foreground);

  --color-platform-accent: var(--platform-accent);
  --color-platform-accent-foreground: var(--platform-accent-foreground);
}
```

- [ ] **Step 5: Tokenize React Flow CSS**

In the same file, replace hardcoded `#2872F4` in React Flow styles with `var(--primary)`:

```css
.react-flow__edge.react-flow__edge-default .react-flow__edge-path {
  stroke: var(--primary);
}

.react-flow__connectionline {
  stroke: var(--primary);
}

.react-flow__handle:hover {
  box-shadow: 0 4px 12px color-mix(in srgb, var(--primary) 40%, transparent) !important;
  border-color: var(--primary) !important;
}

.react-flow__handle-connecting {
  box-shadow: 0 4px 16px color-mix(in srgb, var(--primary) 60%, transparent) !important;
  border-color: var(--primary) !important;
}
```

- [ ] **Step 6: Verify build compiles**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit`
Expected: PASS (CSS-only changes, no type errors)

- [ ] **Step 7: Commit**

```bash
git add app/globals.css
git commit -m "feat: rewrite globals.css with new design system tokens

New semantic tokens (warning, success, info, platform-accent).
Primary shifted from navy #052762 to Freestand blue #2872F4.
Sidebar tokens shifted from dark navy to light/white.
Platform overrides scoped to --platform-accent only.
React Flow CSS tokenized."
```

---

### Task 2: Delete unused globals.css and update platform-config.ts

**Files:**
- Delete: `styles/globals.css`
- Modify: `lib/platform-config.ts`

- [ ] **Step 1: Delete `styles/globals.css`**

```bash
rm styles/globals.css
```

This file uses OKLch color format and is not imported anywhere — it's leftover from a shadcn init.

- [ ] **Step 2: Remove `colors` from `PlatformConfig` type and config**

In `lib/platform-config.ts`, remove the `colors` property from the interface and all config entries:

```typescript
import type { Platform } from "@/types"

export interface PlatformConfig {
  name: Platform
  displayName: string
}

// Node-specific limits (text, buttons, options) are resolved via getNodeLimits()
// from constants/node-limits/config.ts — do NOT duplicate them here.
export const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  whatsapp: {
    name: "whatsapp",
    displayName: "WhatsApp",
  },
  instagram: {
    name: "instagram",
    displayName: "Instagram",
  },
  web: {
    name: "web",
    displayName: "Web",
  },
} as const

export function getPlatformConfig(platform: Platform): PlatformConfig {
  return PLATFORM_CONFIGS[platform]
}
```

- [ ] **Step 3: Fix any TypeScript errors from removing `colors`**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit`

Files that reference `platformConfig.colors` or `platformColors`:
- `components/nodes/core/base-node.tsx` — uses `platformConfig.colors.primary` for border and badge
- `components/ai/ai-button-suggestions.tsx` — has its own `platformColors` object (unrelated to config)
- `components/nodes/web/web-form-node.tsx` — may reference platform colors

Fix `base-node.tsx` — replace inline platform color styles with CSS token classes:

```tsx
import type React from "react"
import { memo } from "react"
import { Handle, Position } from "@xyflow/react"
import type { Platform } from "@/types"

export interface BaseNodeData {
  id: string
  platform: Platform
  onNodeUpdate: (nodeId: string, updates: any) => void
  [key: string]: any
}

export interface BaseNodeProps {
  data: BaseNodeData
  children: React.ReactNode
}

export const BaseNode = memo(({ data, children }: BaseNodeProps) => {
  return (
    <div className="relative bg-card border-2 border-platform-accent rounded-lg shadow-sm hover:shadow-md transition-shadow">
      <Handle type="target" position={Position.Top} className="w-3 h-3 !bg-muted-foreground border-2 border-background" />

      {/* Platform indicator */}
      <div className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-platform-accent text-xs flex items-center justify-center text-platform-accent-foreground font-bold">
        {data.platform.charAt(0).toUpperCase()}
      </div>

      {children}

      <Handle type="source" position={Position.Bottom} className="w-3 h-3 !bg-muted-foreground border-2 border-background" />
    </div>
  )
})

BaseNode.displayName = "BaseNode"
```

Remove the `getPlatformConfig` import since it's no longer needed here.

- [ ] **Step 4: Verify build**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: delete unused styles/globals.css, remove colors from platform-config

CSS is now the single source of truth for all colors.
base-node.tsx uses bg-platform-accent instead of inline styles."
```

---

### Task 3: Create shared edge style constant

**Files:**
- Create: `constants/edge-styles.ts`

- [ ] **Step 1: Create the constant**

```typescript
import type { CSSProperties } from "react"

/**
 * Default edge style for all ReactFlow edges.
 * Uses CSS variable so it inherits from the design system.
 */
export const DEFAULT_EDGE_STYLE: CSSProperties = {
  stroke: "var(--primary)",
  strokeWidth: 2,
}
```

- [ ] **Step 2: Commit**

```bash
git add constants/edge-styles.ts
git commit -m "feat: add DEFAULT_EDGE_STYLE constant for ReactFlow edges"
```

---

## Phase 2 — App Shell

### Task 4: Migrate login and register pages

**Files:**
- Modify: `app/login/page.tsx`
- Modify: `app/register/page.tsx`

- [ ] **Step 1: Update login page**

In `app/login/page.tsx`, make these replacements:

1. SVG logo: change `stroke="#052762"` to `stroke="currentColor"`, add `className="... text-primary"` to the `<svg>` element (currently `className="w-16 h-16 mx-auto mb-4"` → `className="w-16 h-16 mx-auto mb-4 text-primary"`)

2. Line 87: `text-[#052762]` → `text-foreground` (heading, should be main text color)

3. Line 121: `bg-[#052762] hover:bg-[#0A49B7] text-white` → remove entirely (shadcn `Button` with `variant="default"` already uses `bg-primary text-primary-foreground`)

4. Line 135: `text-[#052762]` → `text-primary`

- [ ] **Step 2: Update register page**

In `app/register/page.tsx`, same pattern:

1. SVG logo: `stroke="#052762"` → `stroke="currentColor"`, add `text-primary` to svg className

2. Line 84: `text-[#052762]` → `text-foreground`

3. Line 139: `bg-[#052762] hover:bg-[#0A49B7] text-white` → remove entirely (use default Button variant)

4. Line 153: `text-[#052762]` → `text-primary`

- [ ] **Step 3: Verify build**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add app/login/page.tsx app/register/page.tsx
git commit -m "feat: migrate login/register pages to design system tokens"
```

---

### Task 5: Migrate dashboard flows page

**Files:**
- Modify: `app/(dashboard)/flows/page.tsx`

- [ ] **Step 1: Update `getPlatformIconBg` function**

The WhatsApp badge uses `bg-[#25D366]/10 text-[#25D366]` — this is an intentional brand badge. Keep the WhatsApp and Instagram colors since they represent external brand identity. These are not our tokens:

```typescript
function getPlatformIconBg(platform: Platform) {
  switch (platform) {
    case "whatsapp": return "bg-[#25D366]/10 text-[#25D366]"  // Keep: WhatsApp brand
    case "instagram": return "bg-pink-500/10 text-pink-500"     // Keep: Instagram brand
    case "web": return "bg-primary/10 text-primary"             // Changed: use our token
    default: return "bg-muted text-muted-foreground"
  }
}
```

- [ ] **Step 2: Replace CTA buttons**

Line 455: `bg-[#052762] hover:bg-[#0A49B7] text-white` → remove (use default Button variant which is now `bg-primary`)

Line 512: `bg-[#052762] text-white hover:bg-[#0A49B7]` → remove (active filter button, use default variant)

- [ ] **Step 3: Verify build**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add app/(dashboard)/flows/page.tsx
git commit -m "feat: migrate flows dashboard to design system tokens"
```

---

### Task 6: Migrate dashboard templates and flow-templates pages

**Files:**
- Modify: `app/(dashboard)/templates/page.tsx`
- Modify: `app/(dashboard)/flow-templates/page.tsx`

- [ ] **Step 1: Update templates page**

In `app/(dashboard)/templates/page.tsx`:

1. Line 274: `bg-[#052762] hover:bg-[#0A49B7] text-white` → remove (default Button variant)

2. Line 291: `bg-[#052762]` (accent bar on card) → `bg-primary`

- [ ] **Step 2: Update flow-templates page**

In `app/(dashboard)/flow-templates/page.tsx`:

1. Line 176: `${isDefault ? "bg-[#052762]" : "bg-indigo-500"}` → `${isDefault ? "bg-primary" : "bg-indigo-500"}`

2. Line 198: `${isDefault ? "bg-[#052762]" : "bg-indigo-500"}` → `${isDefault ? "bg-primary" : "bg-indigo-500"}`

Note: `bg-indigo-500` for non-default (AI-generated) templates is intentional differentiation — keep it.

- [ ] **Step 3: Verify build**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add app/(dashboard)/templates/page.tsx app/(dashboard)/flow-templates/page.tsx
git commit -m "feat: migrate dashboard template pages to design system tokens"
```

---

### Task 7: Migrate sidebar and misc shell components

**Files:**
- Modify: `components/node-sidebar.tsx`
- Modify: `components/template-sidebar-section.tsx`
- Modify: `components/template-editor-modal.tsx`
- Modify: `components/template-builder.tsx`
- Modify: `components/connection-menu.tsx`

- [ ] **Step 1: Update node-sidebar.tsx**

Line 174: `text-[#052762]` → `text-primary`

- [ ] **Step 2: Update template-sidebar-section.tsx**

Line 159: `bg-[#052762]` → `bg-primary`

- [ ] **Step 3: Update template-editor-modal.tsx**

Line 353: `bg-[#052762]` → `bg-primary`

Edge styles at lines 92, 291, 299, 302 — import and use `DEFAULT_EDGE_STYLE`:
```typescript
import { DEFAULT_EDGE_STYLE } from "@/constants/edge-styles"
```

Replace all `{ stroke: "#6366f1", strokeWidth: 2 }` with `DEFAULT_EDGE_STYLE`.

- [ ] **Step 4: Update template-builder.tsx**

Line 264: `bg-[#052762] hover:bg-[#0A49B7] text-white` → remove (default Button variant)

Line 395: `border-[#052762]/20 bg-[#052762]/[0.02]` → `border-primary/20 bg-primary/[0.02]`

Line 399: `text-[#052762] bg-[#052762]/10` → `text-primary bg-primary/10`

Line 575: `bg-[#00a884]` → keep (WhatsApp brand green, intentional)

- [ ] **Step 5: Update connection-menu.tsx**

Lines 209-210: `bg-[#052762]` → `bg-primary` for information and fulfillment categories

- [ ] **Step 6: Verify build**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add components/node-sidebar.tsx components/template-sidebar-section.tsx components/template-editor-modal.tsx components/template-builder.tsx components/connection-menu.tsx
git commit -m "feat: migrate sidebar and shell components to design system tokens"
```

---

## Phase 3 — Builder Canvas

### Task 8: Migrate edge styles across all files

**Files:**
- Modify: `app/flow/[id]/page.tsx`
- Modify: `app/template/[id]/page.tsx`
- Modify: `hooks/use-node-operations.ts`
- Modify: `hooks/use-flow-interactions.ts`
- Modify: `hooks/use-flow-ai.ts`
- Modify: `hooks/use-version-manager.ts`
- Modify: `utils/flow-plan-builder.ts`
- Modify: `utils/whatsapp-converter.ts`
- Modify: `lib/ai/tools/generate-flow.ts`
- Modify: `data/flows.json`

This is a mechanical find-and-replace. In every file:

1. Add import: `import { DEFAULT_EDGE_STYLE } from "@/constants/edge-styles"`
2. Replace every `{ stroke: "#6366f1", strokeWidth: 2 }` with `DEFAULT_EDGE_STYLE`
3. Replace every `{ ...edge.style, strokeWidth: 2, stroke: "#6366f1" }` with `{ ...edge.style, ...DEFAULT_EDGE_STYLE }`
4. Replace `connectionLineStyle={{ stroke: "#6366f1", strokeWidth: 2 }}` with `connectionLineStyle={DEFAULT_EDGE_STYLE}`

- [ ] **Step 1: Migrate `app/flow/[id]/page.tsx`**

Lines 627, 644, 647: replace edge style references.

Also fix other hardcoded colors:
- Line 340: `text-[#2872F4]` → `text-primary`
- Line 341: `text-[#052762]` → `text-primary`

- [ ] **Step 2: Migrate `app/template/[id]/page.tsx`**

Lines 252, 269, 272: replace edge style references.

- [ ] **Step 3: Migrate hooks**

`hooks/use-node-operations.ts` line 408
`hooks/use-flow-interactions.ts` lines 125, 556
`hooks/use-flow-ai.ts` lines 474, 579
`hooks/use-version-manager.ts` line 19

Add import and replace in each.

- [ ] **Step 4: Migrate utils**

`utils/flow-plan-builder.ts` — 14 instances (lines 278, 335, 380, 398, 409, 497, 628, 691, 707, 716, 739, 755, 770, 866). Add import and replace all.

`utils/whatsapp-converter.ts` — 5 instances (lines 839, 859, 882, 896, 911). Add import and replace all.

- [ ] **Step 5: Migrate `lib/ai/tools/generate-flow.ts`**

Line 424: replace edge style.

- [ ] **Step 6: Update `data/flows.json`**

Line 62: change `"stroke": "#6366f1"` to `"stroke": "var(--primary)"`.

- [ ] **Step 7: Verify build**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add app/flow/[id]/page.tsx app/template/[id]/page.tsx hooks/ utils/flow-plan-builder.ts utils/whatsapp-converter.ts lib/ai/tools/generate-flow.ts constants/edge-styles.ts data/flows.json
git commit -m "feat: replace 30+ hardcoded edge colors with DEFAULT_EDGE_STYLE constant

All edge styles now use var(--primary) via shared constant."
```

---

### Task 9: Migrate fulfillment node components

**Files:**
- Modify: `components/nodes/fulfillment/event-node.tsx`
- Modify: `components/nodes/fulfillment/home-delivery-node.tsx`
- Modify: `components/nodes/fulfillment/retail-store-node.tsx`
- Modify: `components/nodes/fulfillment/tracking-notification-node.tsx`
- Modify: `components/nodes/fulfillment/generic-fulfillment-node.tsx`

All five follow the same pattern. For each file:

- [ ] **Step 1: Replace `bg-[#052762]` with `bg-primary` in node icon and handles**

In each fulfillment node:
- Node icon div: `bg-[#052762]` → `bg-primary`
- Handle components: `bg-[#052762]` → `bg-primary`

- [ ] **Step 2: Replace `text-[#2872F4]` with `text-primary`**

In event-node.tsx line 71, retail-store-node.tsx line 71, home-delivery-node.tsx line 71: `text-[#2872F4]` → `text-primary`

- [ ] **Step 3: Replace feature badge colors**

In event-node.tsx line 85, retail-store-node.tsx line 85, home-delivery-node.tsx line 85:
`bg-blue-50 dark:bg-blue-950/20 text-[#052762] dark:text-blue-300 border-blue-200 dark:border-blue-800`
→ `bg-primary/5 dark:bg-primary/10 text-primary dark:text-primary/80 border-primary/20 dark:border-primary/30`

- [ ] **Step 4: Replace `text-green-500` success indicators**

In event-node.tsx lines 97, 102, 109: `text-green-500` → `text-success`

- [ ] **Step 5: Replace tracking-notification-node.tsx specific colors**

Line 139: `bg-[#052762]` → `bg-primary`
Line 151: `border-[#052762]/20` → `border-primary/20`
Line 180: `border-[#052762]/20 focus:border-[#052762]/40` → `border-primary/20 focus:border-primary/40`

- [ ] **Step 6: Fix `web-form-node.tsx`**

In `components/nodes/web/web-form-node.tsx`:

Line 79: `style={{ backgroundColor: "#3b82f6" }}` → replace with `className="bg-primary"`
Line 107: `hover:bg-gray-50` → `hover:bg-muted`
Line 110: `text-gray-900` → `text-card-foreground`
Line 122: `text-red-500` → `text-destructive`
Line 136: `border-gray-200` → `border-border`
Line 159: `style={{ backgroundColor: data.platform ? getPlatformConfig(data.platform).colors.primary : "#3b82f6" }}` → replace with `className="bg-platform-accent text-platform-accent-foreground"`

Remove the `getPlatformConfig` import and `platformConfig` variable since they're no longer used.

- [ ] **Step 7: Remove `getPlatformColor` and `getPlatformRing` functions**

In event-node.tsx (lines 23-43), home-delivery-node.tsx, retail-store-node.tsx: these functions return hardcoded platform-specific border/ring colors. Replace with a simpler approach using the `--platform-accent` token:

```typescript
// Replace both getPlatformColor and getPlatformRing with:
const platformBorder = "border-platform-accent/20 dark:border-platform-accent/30"
const platformRing = "ring-platform-accent/30"
```

Then in the Card JSX:
```tsx
<Card className={`min-w-[260px] max-w-[300px] bg-card ${platformBorder} transition-all ${
  selected ? `ring-1 ${platformRing}` : ""
}`}>
```

- [ ] **Step 8: Verify build**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add components/nodes/fulfillment/
git commit -m "feat: migrate fulfillment nodes to design system tokens"
```

---

### Task 10: Migrate AI panel components

**Files:**
- Modify: `components/ai/ai-suggestions-panel.tsx`
- Modify: `components/ai/ai-button-toolbar.tsx`
- Modify: `components/ai/ai-toolbar.tsx`
- Modify: `components/ai/ai-button-suggestions.tsx`
- Modify: `components/ai/suggested-nodes.tsx`
- Modify: `components/ai/ai-assistant.tsx`

- [ ] **Step 1: Update ai-suggestions-panel.tsx**

Replace the `aiColors` object and all hardcoded references:

```typescript
const aiColors = {
  card: "border-primary/20 dark:border-primary/30",
  accent: "text-primary",
  button: "bg-primary hover:bg-primary/90 shadow-md hover:shadow-lg",
}
```

Lines 49, 61, 66: `text-[#2872F4]` → `text-primary`
Line 24: remove gradient, use `bg-primary hover:bg-primary/90`

- [ ] **Step 2: Update ai-button-suggestions.tsx**

Replace the `platformColors` object — AI features should always use Freestand brand, not platform colors:

```typescript
const aiColors = {
  badge: "bg-primary hover:bg-primary/90",
  text: "text-primary",
  border: "border-primary/20 dark:border-primary/30",
  hover: "hover:bg-primary/5 dark:hover:bg-primary/10",
  button: "bg-primary hover:bg-primary/90"
}
```

Update component to use `aiColors` instead of `platformColors[platform]`.

Line 93: `border-[#2872F4]` → `border-primary`
Line 95: `text-[#2872F4]` → `text-primary`
Line 97: gradient `from-[#052762] to-[#2872F4]` → `text-primary` (remove gradient, use flat color)

- [ ] **Step 3: Update ai-button-toolbar.tsx**

Lines 208, 210, 240, 242, 292: `text-[#2872F4]` and `border-[#2872F4]` → `text-primary` and `border-primary`

- [ ] **Step 4: Update ai-toolbar.tsx**

Lines 133, 135: `text-[#2872F4]` → `text-primary`
Line 137: gradient `from-[#052762] to-[#2872F4]` → `text-primary` (remove gradient)

- [ ] **Step 5: Update suggested-nodes.tsx**

Lines 27, 44, 48, 61: same pattern — `text-[#052762]` → `text-primary`, `text-[#2872F4]` → `text-primary`

- [ ] **Step 6: Update ai-assistant.tsx**

Lines 347, 496: `text-[#2872F4]` → `text-primary`

- [ ] **Step 7: Verify build**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add components/ai/
git commit -m "feat: migrate AI components to design system tokens

All AI panels now use bg-primary/text-primary instead of hardcoded hex.
Removed per-platform color maps from AI components — AI is always Freestand-branded."
```

---

### Task 11: Migrate properties panel node type badges

**Files:**
- Modify: `components/properties-panel.tsx`

- [ ] **Step 1: Update node type badge color map**

At lines 130-151, replace the `nodeTypeBadgeColors` map. Keep platform-specific node colors (they represent the platform, not our brand), replace Freestand blues with tokens:

```typescript
const nodeTypeBadgeColors: Record<string, string> = {
  // Platform nodes — keep platform brand colors
  webQuestion: "bg-blue-500 text-white",
  webQuickReply: "bg-blue-600 text-white",
  whatsappQuestion: "bg-green-500 text-white",
  whatsappQuickReply: "bg-green-600 text-white",
  whatsappInteractiveList: "bg-green-700 text-white",
  whatsappMessage: "bg-green-400 text-white",
  instagramQuestion: "bg-pink-500 text-white",
  instagramQuickReply: "bg-pink-600 text-white",
  instagramDM: "bg-pink-400 text-white",
  instagramStory: "bg-pink-500 text-white",
  // Logic nodes
  condition: "bg-primary text-primary-foreground",
  // Fulfillment nodes
  homeDelivery: "bg-primary text-primary-foreground",
  trackingNotification: "bg-primary text-primary-foreground",
  event: "bg-primary text-primary-foreground",
  retailStore: "bg-primary text-primary-foreground",
  // Action nodes — distinct identity colors (intentional)
  apiFetch: "bg-[#1a365d] text-white",
  transfer: "bg-[#7c2d12] text-white",
  templateMessage: "bg-[#075e54] text-white",
}
```

Note: `apiFetch`, `transfer`, `templateMessage` keep their distinct identity colors — they're visually meaningful (dark blue = API, brown = transfer/handoff, teal = WhatsApp template).

- [ ] **Step 2: Replace other hardcoded colors in properties panel**

Line 1744: `text-[#2872F4]` → `text-primary`
Line 2139: `text-[#2872F4]` → `text-primary`
Line 2141: `text-[#052762] dark:text-blue-100` → `text-primary dark:text-primary/80`
Line 2142: `text-[#052762] dark:text-blue-300` → `text-primary/80 dark:text-primary/60`

- [ ] **Step 3: Verify build**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add components/properties-panel.tsx
git commit -m "feat: migrate properties panel to design system tokens"
```

---

## Phase 4 — Dark Mode Audit

### Task 12: Systematic dark mode verification

**Files:**
- Potentially any file touched in Phases 1-3

- [ ] **Step 1: Start the app in Docker**

```bash
cd /Users/pratikgupta/Freestand/magic-flow && docker compose up -d
```

- [ ] **Step 2: Audit checklist — verify each area in BOTH light and dark mode**

Open `http://localhost:3002` and verify:

1. **Login page** — form, buttons, links, logo visible in both themes
2. **Register page** — same checks
3. **Flows dashboard** — cards, badges, platform pills, empty state, CTA buttons
4. **Templates page** — cards, accent bars, CTA buttons
5. **Flow templates page** — cards with "Built-in" badge, accent bar, icon backgrounds
6. **Flow editor** — open a flow:
   - Canvas background
   - Node cards (all types) — borders, text, badges
   - Edge colors
   - Handle dots — platform-colored
   - Connection line while dragging
   - Properties panel — node type badges, settings icon, fulfillment info box
   - Node sidebar — logo text, category headers
   - Connection menu — node category icons
7. **AI panels** — trigger AI suggestions:
   - Sparkle icons
   - Loading spinners
   - Suggestion cards
   - Accept/Cancel buttons
8. **Template editor modal** — open a template:
   - Modal header icon
   - Edge colors in mini canvas
9. **Template preview** — WhatsApp simulation should look correct (these were intentionally kept)
10. **Modals and dialogs** — delete confirmations, popovers, dropdowns should have correct backgrounds and text colors
11. **Input focus rings** — should be Freestand blue in both themes
12. **Sidebar** — should be light/white in light mode, dark in dark mode

- [ ] **Step 3: Fix any issues found**

For each issue, fix the component and note what was wrong.

Common dark mode issues to watch for:
- `text-primary` on dark `bg-primary` (text disappears)
- Missing `dark:` variant on borders or subtle backgrounds
- `bg-primary/5` too subtle in dark mode (may need `dark:bg-primary/10`)
- White text on white background in sidebar (if `--sidebar` is white)

- [ ] **Step 4: Verify build after fixes**

Run: `cd /Users/pratikgupta/Freestand/magic-flow && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit fixes**

```bash
git add -A
git commit -m "fix: dark mode audit — fix contrast and missing overrides"
```

---

## Phase 5 — CLAUDE.md Update (after user confirms UI)

### Task 13: Update CLAUDE.md with design system rules

**Files:**
- Modify: `CLAUDE.md` (magic-flow)

**Gate:** Only execute this task after user has reviewed the UI and confirmed it looks correct.

- [ ] **Step 1: Add Design System section to CLAUDE.md**

Add after the "UI Rules" section:

```markdown
## Design System

All colors come from CSS custom properties in `globals.css`. Never use hardcoded hex colors in components.

**Token usage:**
- Buttons/CTAs: `bg-primary text-primary-foreground` (Freestand blue)
- Secondary buttons: `bg-secondary text-secondary-foreground`
- Hover backgrounds: `bg-accent` or `hover:bg-muted`
- Errors/delete: `bg-destructive text-destructive-foreground`
- Warnings/validation: `bg-warning text-warning-foreground` or `text-warning`
- Success states: `bg-success text-success-foreground` or `text-success`
- Info states: `bg-info text-info-foreground` or `text-info`
- Canvas handles: `bg-platform-accent` (changes per platform)
- Edges: use `DEFAULT_EDGE_STYLE` from `constants/edge-styles.ts`

**Platform theming:**
- `--platform-accent` changes per platform (WhatsApp green, Instagram pink, Web blue)
- Only canvas elements (node handles) use `platform-accent`
- App shell (buttons, focus rings, sidebar) always uses `--primary`
- `--primary` and `--ring` do NOT change per platform

**Intentional exceptions (OK to hardcode):**
- External brand badges (WhatsApp green pill, Instagram pink pill on dashboard)
- WhatsApp UI simulation in template-preview.tsx
- Node identity colors: transfer (#7c2d12), API fetch (#1a365d), template message (#075e54)

**Never:**
- Use `bg-[#hex]` or `text-[#hex]` for any color that exists as a token
- Define color maps in TypeScript — CSS is the source of truth
- Override `--primary` or `--ring` per platform (use `--platform-accent` instead)
```

- [ ] **Step 2: Remove outdated color rules from existing UI Rules section**

The existing "Platform theme: --primary and --ring change per platform" rule is now wrong. Remove it — the new Design System section covers it accurately.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add design system rules to CLAUDE.md"
```
