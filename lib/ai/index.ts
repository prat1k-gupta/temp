/**
 * AI Library - Main exports
 */

// Core
export { AIClient, getAIClient } from './core/ai-client'
export { AIToolRegistry, getAIToolRegistry, registerAITool } from './core/ai-registry'
export { 
  buildAIContext, 
  buildContextDescription, 
  getPlatformGuidelines,
  getNodeTypeGuidelines 
} from './core/ai-context'

// Tools (auto-registers on import)
export * from './tools'

