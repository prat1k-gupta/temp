# Theme Guide - Magic Flow

## Quick Reference for Theme-Aware Styling

### Core Principle
**ALWAYS use CSS variable-based classes. NEVER use hardcoded colors.**

## Background Colors

| Use Case | Class | Description |
|----------|-------|-------------|
| Node backgrounds | `bg-card` | Card/node backgrounds |
| Page backgrounds | `bg-background` | Main page background |
| Subtle backgrounds | `bg-muted` | Disabled states, subtle UI |
| Interactive elements | `bg-accent` | Hover states, active items |
| Popover/dropdown | `bg-popover` | Floating UI elements |

## Text Colors

| Use Case | Class | Description |
|----------|-------|-------------|
| Primary text | `text-foreground` | Main body text |
| Card text | `text-card-foreground` | Text on cards |
| Muted text | `text-muted-foreground` | Secondary/helper text |
| Accent text | `text-accent-foreground` | Text on accent backgrounds |
| Popover text | `text-popover-foreground` | Text in popovers |
| Destructive | `text-destructive` | Error/warning text |

## Border Colors

| Use Case | Class | Description |
|----------|-------|-------------|
| Standard borders | `border-border` | Default border color |
| Input borders | `border-input` | Form inputs |
| Handles/connections | `border-background` | Node connection points |

## Platform-Specific Colors

### Web Platform (Blue)
```tsx
// Background
bg-blue-500

// Borders (with dark mode)
border-blue-100 dark:border-blue-900
hover:border-blue-200 dark:hover:border-blue-800

// Rings (with dark mode)
ring-blue-300/50 dark:ring-blue-600/50

// Text
text-blue-600 dark:text-blue-400
```

### WhatsApp Platform (Green)
```tsx
// Background
bg-green-500

// Borders (with dark mode)
border-green-100 dark:border-green-900
hover:border-green-200 dark:hover:border-green-800

// Rings (with dark mode)
ring-green-300/50 dark:ring-green-600/50

// Text
text-green-600 dark:text-green-400
```

### Instagram Platform (Pink)
```tsx
// Background
bg-pink-500

// Borders (with dark mode)
border-pink-100 dark:border-pink-900
hover:border-pink-200 dark:hover:border-pink-800

// Rings (with dark mode)
ring-pink-300/50 dark:ring-pink-600/50

// Text
text-pink-600 dark:text-pink-400
```

### Comment Node (Yellow)
```tsx
// Background
bg-yellow-50 dark:bg-yellow-950/30

// Borders
border-yellow-200 dark:border-yellow-800

// Text
text-yellow-800 dark:text-yellow-200
text-yellow-600 dark:text-yellow-400

// Hover
hover:bg-yellow-100 dark:hover:bg-yellow-900/30

// Ring
ring-yellow-400 dark:ring-yellow-600
```

### Start Node
```tsx
// Uses theme color variable
bg-chart-2

// Icon background
bg-white/20 dark:bg-black/20
```

## Common Patterns

### Card Component
```tsx
<Card className={`
  bg-card 
  border-{platform}-100 dark:border-{platform}-900 
  hover:border-{platform}-200 dark:hover:border-{platform}-800
  ${selected ? "ring-1 ring-{platform}-300/50 dark:ring-{platform}-600/50" : ""}
`}>
```

### Editable Text
```tsx
<div className="
  text-card-foreground 
  hover:bg-accent/50 
  cursor-pointer
">
```

### Muted/Helper Text
```tsx
<p className="text-xs text-muted-foreground">
  Helper text here
</p>
```

### Buttons with Platform Colors
```tsx
<Button className="
  bg-accent/40 
  hover:bg-accent/50 
  text-card-foreground
">
```

### Connection Handles
```tsx
<Handle
  type="target"
  position={Position.Left}
  className="
    w-3 h-3 
    bg-{platform}-500 
    border-2 border-background 
    opacity-100 
    hover:scale-110 
    transition-transform
  "
/>
```

## Migration Checklist

When updating existing nodes or creating new ones:

- [ ] Replace `bg-white` → `bg-card`
- [ ] Replace `text-gray-700` → `text-card-foreground`
- [ ] Replace `text-gray-600` → `text-muted-foreground`
- [ ] Replace `text-gray-400` → `text-muted-foreground`
- [ ] Replace `border-white` → `border-background`
- [ ] Add `dark:border-*` for all platform colors
- [ ] Add `dark:hover:border-*` for hover states
- [ ] Add `dark:ring-*` for selection rings
- [ ] Test in both light and dark modes

## Examples

### ❌ WRONG (Hardcoded Colors)
```tsx
<Card className="bg-white border-gray-200 text-gray-700">
  <p className="text-gray-600">Some text</p>
  <Button className="bg-blue-50 hover:bg-blue-100">
    Click me
  </Button>
</Card>
```

### ✅ CORRECT (Theme-Aware)
```tsx
<Card className="bg-card border-border text-card-foreground">
  <p className="text-muted-foreground">Some text</p>
  <Button className="bg-accent/40 hover:bg-accent/50">
    Click me
  </Button>
</Card>
```

### ✅ CORRECT (Platform-Specific with Dark Mode)
```tsx
<Card className="
  bg-card 
  border-blue-100 dark:border-blue-900
  hover:border-blue-200 dark:hover:border-blue-800
">
  <div className="w-5 h-5 bg-blue-500 rounded-md">
    <Globe className="w-3 h-3 text-white" />
  </div>
  <p className="text-muted-foreground">Content</p>
</Card>
```

## Debugging Dark Mode Issues

If something looks wrong in dark mode:

1. Check for hardcoded colors (`bg-white`, `text-gray-*`)
2. Ensure `dark:` variants exist for platform colors
3. Verify `border-background` is used for handles
4. Check hover states have dark variants
5. Inspect with browser DevTools in dark mode
6. Use the theme toggle to quickly test both modes

## CSS Variables Reference

The theme uses CSS variables defined in `globals.css`:

```css
/* Light mode */
--background: 0 0% 100%;
--foreground: 222.2 84% 4.9%;
--card: 0 0% 100%;
--card-foreground: 222.2 84% 4.9%;
--muted: 210 40% 96.1%;
--muted-foreground: 215.4 16.3% 46.9%;
--border: 214.3 31.8% 91.4%;

/* Dark mode */
--background: 222.2 84% 4.9%;
--foreground: 210 40% 98%;
--card: 222.2 84% 4.9%;
--card-foreground: 210 40% 98%;
--muted: 217.2 32.6% 17.5%;
--muted-foreground: 215 20.2% 65.1%;
--border: 217.2 32.6% 17.5%;
```

These automatically switch when the theme changes!

