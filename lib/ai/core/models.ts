import { openai } from '@ai-sdk/openai'
import { anthropic } from '@ai-sdk/anthropic'
import { xai } from '@ai-sdk/xai'

export type ModelId =
  | 'claude-sonnet'
  | 'claude-haiku'
  | 'grok-fast'
  | 'gpt-4.1'
  | 'gpt-4o'

export function getModel(id: ModelId) {
  switch (id) {
    case 'claude-sonnet': return anthropic('claude-sonnet-4-5-20250929')
    case 'claude-haiku':  return anthropic('claude-haiku-4-5-20251001')
    case 'grok-fast':     return xai('grok-3-fast')
    case 'gpt-4.1':       return openai('gpt-4.1')
    case 'gpt-4o':         return openai('gpt-4o')
  }
}

export const DEFAULT_MODEL: ModelId = 'claude-sonnet'
