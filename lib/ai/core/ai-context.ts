import type { Node, Edge } from "@xyflow/react"
import type { Platform } from "@/types"
import type { AIContext } from "@/types/ai"
import { getNodeLimits } from "@/constants"
import { getNodeDocumentationString, getNodeDocumentation } from "./node-documentation"

/**
 * Build AI context from node information
 * This provides the AI with relevant information about the node and flow
 */
export function buildAIContext(params: {
  nodeId?: string
  nodeType: string
  platform: Platform
  nodes?: Node[]
  edges?: Edge[]
}): AIContext {
  const { nodeId, nodeType, platform, nodes, edges } = params

  // Get node limits for this type and platform
  const nodeLimits = getNodeLimits(nodeType, platform)

  // Build flow context if nodes and edges are provided
  let flowContext
  if (nodes && edges && nodeId) {
    const connectedNodes = getConnectedNodes(nodeId, nodes, edges)
    flowContext = {
      nodes,
      edges,
      connectedNodes
    }
  }

  return {
    nodeType,
    platform,
    nodeLimits,
    flowContext
  }
}

/**
 * Get nodes connected to a specific node
 */
function getConnectedNodes(
  nodeId: string,
  nodes: Node[],
  edges: Edge[]
): Node[] {
  const connectedNodeIds = new Set<string>()

  // Find incoming connections
  edges.forEach(edge => {
    if (edge.target === nodeId) {
      connectedNodeIds.add(edge.source)
    }
    if (edge.source === nodeId) {
      connectedNodeIds.add(edge.target)
    }
  })

  return nodes.filter(node => connectedNodeIds.has(node.id))
}

/**
 * Build a text description of the node context for AI
 */
export function buildContextDescription(context: AIContext): string {
  const parts: string[] = []

  // Node type and platform
  parts.push(`Node Type: ${context.nodeType}`)
  parts.push(`Platform: ${context.platform}`)

  // Platform limits
  if (context.nodeLimits) {
    const limits: string[] = []
    
    if (context.nodeLimits.text) {
      const { min, max } = context.nodeLimits.text
      if (max) limits.push(`Text: ${min || 0}-${max} characters`)
    }
    
    if (context.nodeLimits.buttons) {
      const { min, max } = context.nodeLimits.buttons
      if (max) limits.push(`Buttons: ${min || 0}-${max} buttons`)
    }
    
    if (context.nodeLimits.options) {
      const { min, max } = context.nodeLimits.options
      if (max) limits.push(`Options: ${min || 0}-${max} options`)
    }
    
    if (limits.length > 0) {
      parts.push(`Limits: ${limits.join(', ')}`)
    }
  }

  // Flow context
  if (context.flowContext) {
    parts.push(`Flow has ${context.flowContext.nodes.length} nodes and ${context.flowContext.edges.length} connections`)
    
    if (context.flowContext.connectedNodes && context.flowContext.connectedNodes.length > 0) {
      const nodeTypes = context.flowContext.connectedNodes.map(n => n.type).join(', ')
      parts.push(`Connected to: ${nodeTypes}`)
    }
  }

  return parts.join('\n')
}

/**
 * Build platform-specific guidelines for AI
 */
export function getPlatformGuidelines(platform: Platform): string {
  switch (platform) {
    case 'whatsapp':
      return `
WhatsApp Guidelines:
- Keep messages conversational and friendly
- Use emojis sparingly and contextually
- Break long text into smaller messages
- Buttons should be action-oriented (max 20 chars)
- Use simple, clear language
`
    case 'instagram':
      return `
Instagram Guidelines:
- Keep copy engaging and visual
- Use modern, casual tone
- Emojis can be more liberal
- Messages should feel native to social media
- Keep it brief and punchy
`
    case 'web':
      return `
Web Guidelines:
- Professional yet approachable tone
- Clear and concise
- Action-oriented CTAs
- Proper grammar and punctuation
- Can be slightly more formal than social
`
    default:
      return ''
  }
}

/**
 * Build node-specific guidelines for AI
 */
export function getNodeTypeGuidelines(nodeType: string, platform?: Platform): string {
  // Try to get comprehensive documentation first
  if (platform) {
    const doc = getNodeDocumentation(nodeType, platform)
    if (doc) {
      return `Node Type: ${doc.type}
Category: ${doc.category}
Description: ${doc.description}
${doc.isSuperNode ? '⚠️ SUPER NODE - Use this for data collection, NOT question nodes' : ''}

Properties:
- Required: ${doc.properties.required.join(", ") || "None"}
- Optional: ${doc.properties.optional.join(", ") || "None"}

Limits:
${formatLimitsForGuidelines(doc.limits)}

Best Practices:
${doc.usage.bestPractices.map(p => `- ${p}`).join("\n")}

Examples:
${doc.usage.examples.map(e => `- ${e}`).join("\n")}`
    }
  }

  // Fallback to simple guidelines
  const guidelines: Record<string, string> = {
    question: 'This is a question node. The text should be clear, specific, and encourage a response.',
    quickReply: 'These are quick reply buttons. Keep labels short, action-oriented, and easy to tap.',
    message: 'This is a message node. Provide clear information or instructions.',
    list: 'This is a list of options. Keep labels concise and descriptions helpful.',
    condition: 'This is a conditional logic node. Keep conditions clear and unambiguous.',
    name: 'This is a name collection node. Ask for name in a friendly, natural way.',
    email: 'This is an email collection node. Explain why you need their email.',
    dob: 'This is a date of birth collection node. Be clear about format and purpose.',
    address: 'This is an address collection node. Break down into clear steps.',
  }

  return guidelines[nodeType] || `This is a ${nodeType} node.`
}

function formatLimitsForGuidelines(limits: any): string {
  const parts: string[] = []
  if (limits.text) {
    parts.push(`- Text: ${limits.text.min || 0}-${limits.text.max} characters`)
  }
  if (limits.buttons) {
    parts.push(`- Buttons: ${limits.buttons.min}-${limits.buttons.max} buttons (max ${limits.buttons.textMaxLength} chars each)`)
  }
  if (limits.options) {
    parts.push(`- Options: ${limits.options.min}-${limits.options.max} options (max ${limits.options.textMaxLength} chars each)`)
  }
  if (limits.maxConnections) {
    parts.push(`- Max connections: ${limits.maxConnections}`)
  }
  return parts.join("\n") || "- No specific limits"
}

/**
 * Get comprehensive node documentation for AI prompts
 */
export function getNodeDocumentationForPrompt(platform: Platform, nodeTypes?: string[]): string {
  return getNodeDocumentationString(platform, nodeTypes)
}

