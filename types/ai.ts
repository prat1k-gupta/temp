import type { Node, Edge } from "@xyflow/react"
import type { Platform } from "./index"

/**
 * Available AI tools that can be used with nodes
 */
export type AIToolName = 
  | 'improve-copy'      // Improve text quality
  | 'shorten'           // Shorten text to fit limits
  | 'suggest-next'      // Suggest next nodes
  | 'generate-options'  // Generate buttons/options

/**
 * Configuration for a single AI capability
 */
export interface NodeAICapability {
  name: AIToolName
  enabled: boolean
  fields?: string[]                    // Which fields this applies to
  config?: Record<string, any>         // Tool-specific configuration
}

/**
 * Main configuration for node AI capabilities
 */
export interface NodeAIConfig {
  nodeType: string
  platform?: Platform
  capabilities: AIToolName[] | NodeAICapability[]
  systemPrompt?: string                // Custom system prompt
  context?: Record<string, any>        // Additional context
}

/**
 * Result from an AI tool execution
 */
export interface AIToolResult<T = any> {
  success: boolean
  data?: T
  error?: string
  metadata?: {
    model?: string
    tokens?: number
    duration?: number
  }
}

/**
 * Request to improve copy
 */
export interface ImproveCopyRequest {
  text: string
  nodeType: string
  platform: Platform
  field: string
  maxLength?: number
  context?: {
    flowContext?: string
    previousNodes?: string[]
    purpose?: string
  }
}

/**
 * Response from improve copy
 */
export interface ImproveCopyResponse {
  originalText: string
  improvedText: string
  improvements: string[]
  characterCount: number
}

/**
 * Request to shorten text
 */
export interface ShortenTextRequest {
  text: string
  targetLength: number
  nodeType: string
  platform: Platform
  preserveMeaning?: boolean
  context?: {
    purpose?: string
    flowContext?: string
    existingButtons?: string[]
  }
}

/**
 * Response from shorten text
 */
export interface ShortenTextResponse {
  originalText: string
  shortenedText: string
  originalLength: number
  newLength: number
  reduction: number
}

/**
 * Request to suggest next nodes
 */
export interface SuggestNodesRequest {
  currentNodeType: string
  platform: Platform
  flowContext?: string
  existingNodes?: Array<{ id: string; type: string; label?: string }>
  edges?: Array<{ source: string; target: string; sourceHandle?: string }>
  maxSuggestions?: number
}

/**
 * Suggested node
 */
export interface SuggestedNode {
  type: string
  label: string
  reason: string
  description: string
  previewContent?: string
  generatedContent?: {
    question?: string
    buttons?: Array<{ text: string; label?: string }>
    options?: Array<{ text: string }>
    text?: string
    [key: string]: any
  }
}

/**
 * Response from suggest nodes
 */
export interface SuggestNodesResponse {
  suggestions: SuggestedNode[]
}

/**
 * Request to generate options (buttons, list items)
 */
export interface GenerateOptionsRequest {
  context: string              // The question or context
  count: number               // Number of options to generate
  type: 'button' | 'list'    // Type of options
  maxLength?: number         // Max length per option
  platform: Platform
  existingOptions?: string[] // Don't duplicate these
}

/**
 * Response from generate options
 */
export interface GenerateOptionsResponse {
  options: Array<{
    label: string
    value?: string
    description?: string
  }>
}

/**
 * AI tool definition
 */
export interface AITool<TRequest = any, TResponse = any> {
  name: AIToolName
  description: string
  execute: (request: TRequest) => Promise<AIToolResult<TResponse>>
}

/**
 * Context passed to AI tools
 */
export interface AIContext {
  nodeType: string
  platform: Platform
  nodeLimits?: {
    text?: { min?: number; max?: number }
    buttons?: { min?: number; max?: number }
    options?: { min?: number; max?: number }
  }
  flowContext?: {
    nodes: Node[]
    edges: Edge[]
    connectedNodes?: Node[]
  }
}

/**
 * AI service configuration
 */
export interface AIServiceConfig {
  provider: 'openai' | 'anthropic'
  model?: string
  apiKey?: string
  maxTokens?: number
  temperature?: number
}

