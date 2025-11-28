# Super Nodes Guide

## Overview
Super nodes are complex, reusable nodes that contain built-in validation logic and can have sub-nodes. They are designed to handle common data collection patterns with proper validation.

## Characteristics of Super Nodes

### 1. **Double-Clickable**
- Users can double-click to see internal logic
- Shows validation rules and sub-nodes
- Expandable to reveal complexity

### 2. **Built-in Validation**
- Email: Format validation, domain check
- Name: Length check, character validation
- DOB: Date format, age validation
- Address: Component validation (street, city, zip, country)

### 3. **Visual Badge**
- All super nodes show a "Validation" badge
- Indicates they have special capabilities
- Helps users identify them in the sidebar

## Current Super Nodes

### Information Category

#### 1. **Name Node**
- **Type**: `name`
- **Validates**: 
  - Minimum/maximum length
  - Character types (letters, spaces, hyphens)
  - No numbers or special characters
- **Sub-nodes**:
  - First Name
  - Last Name
  - Full Name

#### 2. **Email Node**
- **Type**: `email`
- **Validates**:
  - Email format (RFC 5322)
  - Domain existence
  - Disposable email detection
- **Sub-nodes**:
  - Email capture
  - Verification code
  - Confirmation

#### 3. **DOB (Date of Birth) Node**
- **Type**: `dob`
- **Validates**:
  - Date format
  - Minimum age (e.g., 13+ for COPPA)
  - Maximum age (reasonable limits)
  - Future date prevention
- **Sub-nodes**:
  - Day selector
  - Month selector
  - Year selector

#### 4. **Address Node**
- **Type**: `address`
- **Validates**:
  - Street address
  - City
  - State/Province
  - ZIP/Postal code
  - Country
- **Sub-nodes**:
  - Street Line 1
  - Street Line 2 (optional)
  - City
  - State
  - ZIP
  - Country selector

## Creating New Super Nodes

### Template Structure

```typescript
{
  type: "nodeName",
  icon: IconComponent,
  label: "Display Name",
  description: "What it does",
  category: "information",
  isSuperNode: true,
  platforms: ["web", "whatsapp", "instagram"],
  badge: "Validation",
}
```

### Implementation Checklist

1. ✅ Add to `constants/node-categories.ts`
2. ⏳ Create node component in `components/nodes/super/`
3. ⏳ Implement validation logic
4. ⏳ Add sub-node structure
5. ⏳ Add double-click handler
6. ⏳ Create expansion modal/view
7. ⏳ Add to node type registry
8. ⏳ Update documentation

## Usage in Flows

### Drag and Drop
- Super nodes can be dragged from the sidebar
- They appear with a validation badge
- Tooltip shows they are double-clickable

### Double-Click Behavior
- Opens a modal showing internal structure
- Displays validation rules
- Shows sub-nodes and their connections
- Allows configuration of validation parameters

### Validation Configuration
- Each super node has configurable validation rules
- Can be adjusted per use case
- Errors are shown inline in the flow

## Future Super Nodes

### Planned
- **Phone Number**: International format validation
- **Credit Card**: PCI-compliant capture (tokenized)
- **File Upload**: Type and size validation
- **Multi-step Form**: Complex form with progress
- **Payment**: Integration with payment gateways

### Integration Category
- **API Call**: HTTP request with retry logic
- **Webhook**: Send data to external systems
- **Database Query**: Read/write to databases
- **AI Agent**: LLM-powered responses

## Best Practices

1. **Keep It Simple**: Super nodes should solve one clear problem
2. **Validate Early**: Show validation errors immediately
3. **Provide Feedback**: Clear error messages for users
4. **Be Platform-Aware**: Adapt to platform capabilities
5. **Document Well**: Clear descriptions and examples

