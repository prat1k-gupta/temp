import type { AITool, AIToolName } from '@/types/ai'

/**
 * AI Tool Registry
 * Centralized registry for all AI tools
 * Makes it easy to add new tools and manage them
 */
export class AIToolRegistry {
  private tools = new Map<AIToolName, AITool>()

  /**
   * Register a new AI tool
   */
  register<TRequest = any, TResponse = any>(
    tool: AITool<TRequest, TResponse>
  ): void {
    if (this.tools.has(tool.name)) {
      console.warn(`[AI Registry] Tool "${tool.name}" is already registered. Overwriting.`)
    }
    this.tools.set(tool.name, tool)
    console.log(`[AI Registry] Registered tool: ${tool.name}`)
  }

  /**
   * Get a tool by name
   */
  get(name: AIToolName): AITool | undefined {
    return this.tools.get(name)
  }

  /**
   * Check if a tool is registered
   */
  has(name: AIToolName): boolean {
    return this.tools.has(name)
  }

  /**
   * Get all registered tool names
   */
  getToolNames(): AIToolName[] {
    return Array.from(this.tools.keys())
  }

  /**
   * Get all registered tools
   */
  getAllTools(): AITool[] {
    return Array.from(this.tools.values())
  }

  /**
   * Execute a tool by name
   */
  async execute<TRequest = any, TResponse = any>(
    toolName: AIToolName,
    request: TRequest
  ): Promise<ReturnType<AITool<TRequest, TResponse>['execute']>> {
    const tool = this.tools.get(toolName)
    
    if (!tool) {
      throw new Error(`[AI Registry] Tool "${toolName}" not found`)
    }

    console.log(`[AI Registry] Executing tool: ${toolName}`)
    const startTime = Date.now()
    
    try {
      const result = await tool.execute(request)
      const duration = Date.now() - startTime
      console.log(`[AI Registry] Tool "${toolName}" completed in ${duration}ms`)
      return result
    } catch (error) {
      console.error(`[AI Registry] Tool "${toolName}" failed:`, error)
      throw error
    }
  }
}

// Singleton instance
let registryInstance: AIToolRegistry | null = null

/**
 * Get the global AI tool registry
 */
export function getAIToolRegistry(): AIToolRegistry {
  if (!registryInstance) {
    registryInstance = new AIToolRegistry()
    // Tools will be auto-registered when they're imported
  }
  return registryInstance
}

/**
 * Helper function to register a tool globally
 */
export function registerAITool(tool: AITool): void {
  const registry = getAIToolRegistry()
  registry.register(tool)
}

