/**
 * AI Tools
 * Export all available AI tools
 */

export { improveCopyTool } from './improve-copy'
export { shortenTextTool } from './shorten-text'
export { generateButtonsTool } from './generate-buttons'

// Auto-register tools
import { registerAITool } from '../core/ai-registry'
import { improveCopyTool } from './improve-copy'
import { shortenTextTool } from './shorten-text'
import { generateButtonsTool } from './generate-buttons'

// Register all tools on import
registerAITool(improveCopyTool)
registerAITool(shortenTextTool)
registerAITool(generateButtonsTool)

