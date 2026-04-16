import { describe, it, expect } from 'vitest'
import { getSimplifiedNodeDocumentation, getNodeSelectionRules, getNodeDependencies } from '../core/node-documentation'
import { collectFlowVariablesRich } from '@/utils/flow-variables'
import type { Node } from '@xyflow/react'
import { readFileSync } from 'fs'

describe('Phase A: AI Platform', () => {
  describe('A1: Node Docs Cache', () => {
    it('caches getSimplifiedNodeDocumentation by platform', () => {
      const docs1 = getSimplifiedNodeDocumentation('whatsapp')
      const docs2 = getSimplifiedNodeDocumentation('whatsapp')
      expect(docs1).toBe(docs2) // same reference = cached
      expect(docs1.length).toBeGreaterThan(100)
    })

    it('caches different platforms separately', () => {
      const wa = getSimplifiedNodeDocumentation('whatsapp')
      const web = getSimplifiedNodeDocumentation('web')
      expect(wa).not.toBe(web)
    })

    it('caches getNodeSelectionRules without templates', () => {
      const rules1 = getNodeSelectionRules('whatsapp')
      const rules2 = getNodeSelectionRules('whatsapp')
      expect(rules1).toBe(rules2)
      expect(rules1).toContain('NODE SELECTION RULES:')
    })

    it('appends user templates fresh (not from cache)', () => {
      const base = getNodeSelectionRules('whatsapp')
      const withTemplates = getNodeSelectionRules('whatsapp', [
        { id: 't1', name: 'Test', aiMetadata: { whenToUse: 'test', selectionRule: 'Use for testing', description: 'test', contentFields: '' } }
      ])
      expect(withTemplates).not.toBe(base)
      expect(withTemplates).toContain('Use for testing')
      expect(withTemplates).toContain('flowTemplate:t1')

      // Without templates again — should still return cached base
      const base2 = getNodeSelectionRules('whatsapp')
      expect(base2).toBe(base)
    })

    it('caches getNodeDependencies (including empty)', () => {
      const deps1 = getNodeDependencies('whatsapp')
      const deps2 = getNodeDependencies('whatsapp')
      expect(deps1).toBe(deps2)
    })
  })

  describe('A5: Sonnet model', () => {
    it('create mode uses claude-sonnet', () => {
      const src = readFileSync('./lib/ai/tools/generate-flow-create.ts', 'utf-8')
      expect(src).toContain("model: 'claude-sonnet'")
      expect(src).not.toContain("model: 'claude-haiku'")
    })

    it('fallback uses claude-sonnet', () => {
      const src = readFileSync('./lib/ai/tools/generate-flow.ts', 'utf-8')
      // Should not have the old ternary with haiku
      expect(src).not.toContain("'claude-haiku'")
    })
  })

  describe('A3: list_variables infrastructure', () => {
    it('collectFlowVariablesRich returns rich metadata', () => {
      const mockNodes = [
        { id: '1', type: 'question', position: { x: 0, y: 0 }, data: { storeAs: 'user_color', question: 'Favorite color?' } },
        { id: '2', type: 'quickReply', position: { x: 0, y: 100 }, data: { storeAs: 'user_size', question: 'Size?', buttons: [{ text: 'S' }, { text: 'M' }] } },
        { id: '3', type: 'apiFetch', position: { x: 0, y: 200 }, data: { responseMapping: { order_id: 'data.id', status: 'data.status' } } },
        { id: '4', type: 'action', position: { x: 0, y: 300 }, data: { variables: [{ name: 'full_name', value: '{{first}} {{last}}' }] } },
      ] as Node[]

      const vars = collectFlowVariablesRich(mockNodes)
      expect(vars.length).toBe(5) // user_color, user_size, order_id, status, full_name

      const colorVar = vars.find(v => v.name === 'user_color')!
      expect(colorVar.hasTitleVariant).toBe(false) // question = no title variant
      expect(colorVar.sourceNodeType).toBe('question')

      const sizeVar = vars.find(v => v.name === 'user_size')!
      expect(sizeVar.hasTitleVariant).toBe(true) // quickReply = has title variant

      const apiVars = vars.filter(v => v.sourceNodeType === 'apiFetch')
      expect(apiVars.length).toBe(2)

      expect(vars.some(v => v.name === 'full_name')).toBe(true)
    })
  })

  describe('A4: undo_last tool', () => {
    it('EditToolCallbacks accepts null for setEditResult', () => {
      const src = readFileSync('./lib/ai/tools/generate-flow-edit.ts', 'utf-8')
      expect(src).toContain('setEditResult: (result: BuildEditFlowResult | null) => void')
    })

    it('undo_last tool is defined', () => {
      const src = readFileSync('./lib/ai/tools/generate-flow-edit.ts', 'utf-8')
      expect(src).toContain('undo_last: tool({')
      expect(src).toContain('callbacks.setEditResult(null)')
    })
  })

  describe('A2: trigger_flow + toolContext', () => {
    it('GenerateFlowRequest has toolContext', () => {
      const src = readFileSync('./lib/ai/tools/generate-flow.ts', 'utf-8')
      expect(src).toContain('toolContext?:')
      expect(src).toContain('publishedFlowId?: string')
      expect(src).toContain('authHeader?: string')
    })

    it('route handler extracts auth and builds toolContext', () => {
      const src = readFileSync('./app/api/ai/flow-assistant/route.ts', 'utf-8')
      expect(src).toContain("request.headers.get('Authorization')")
      expect(src).toContain('toolContext:')
      expect(src).toContain('publishedFlowId,')
      expect(src).toContain('waAccountName,')
      expect(src).toContain('authHeader,')
    })

    it('trigger_flow tool is always registered with runtime precondition checks', () => {
      const src = readFileSync('./lib/ai/tools/generate-flow-edit.ts', 'utf-8')
      expect(src).toContain('extraTools.trigger_flow = tool({')
      expect(src).toContain('Flow is not published yet')
      expect(src).toContain('active session')
    })

    it('AIAssistant sends auth via apiClient.raw and threads new props', () => {
      const src = readFileSync('./components/ai/ai-assistant.tsx', 'utf-8')
      expect(src).toContain('publishedFlowId?: string')
      expect(src).toContain('waAccountId?: string')
      // Auth header now flows through apiClient.raw (which adds the
      // Bearer token + handles 401 refresh + retry centrally). This
      // assertion guards against a regression that drops back to raw
      // fetch and loses the refresh path.
      expect(src).toContain('apiClient.raw("/api/ai/flow-assistant"')
    })

    it('page.tsx passes publishedFlowId and waAccountId', () => {
      const src = readFileSync('./app/flow/[id]/page.tsx', 'utf-8')
      // Check both props are passed to some component with persistence.currentFlow
      expect(src).toContain('publishedFlowId={persistence.currentFlow?.publishedFlowId}')
      expect(src).toContain('waAccountId={persistence.currentFlow?.waAccountId}')
    })
  })

  describe('Prompt updates', () => {
    it('edit instructions mention all new tools', () => {
      const src = readFileSync('./lib/ai/tools/flow-prompts.ts', 'utf-8')
      expect(src).toContain('undo_last')
      expect(src).toContain('list_variables')
      expect(src).toContain('trigger_flow')
    })

    it('trigger_flow prompt is after dependencyRules, not at end', () => {
      const src = readFileSync('./lib/ai/tools/flow-prompts.ts', 'utf-8')
      const depIdx = src.indexOf('dependencyRules')
      const triggerIdx = src.indexOf('trigger_flow')
      const instructionsIdx = src.indexOf('getEditInstructions')
      // trigger_flow mention should be between dependencyRules and Instructions
      expect(triggerIdx).toBeGreaterThan(depIdx)
      expect(triggerIdx).toBeLessThan(instructionsIdx)
    })
  })
})
