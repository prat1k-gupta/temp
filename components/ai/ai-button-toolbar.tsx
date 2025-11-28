"use client"

import { Button } from '@/components/ui/button'
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Sparkles, Wand2, Loader2 } from 'lucide-react'
import { useNodeAI } from '@/hooks/use-node-ai'
import type { Platform, ButtonData } from '@/types'
import { toast } from 'sonner'

interface AIButtonToolbarProps {
  questionContext: string
  buttons: ButtonData[]
  onUpdateButtons: (buttons: ButtonData[]) => void
  maxButtons: number
  maxButtonLength?: number
  nodeType: string
  platform: Platform
  className?: string
  upgradeMaxButtons?: number // Max buttons after upgrade (e.g., 10 for List)
  onRequestUpgrade?: () => void // Callback when user wants to generate beyond current limit
}

/**
 * AI Toolbar for Button Management
 * Generates and improves button options
 */
export function AIButtonToolbar({
  questionContext,
  buttons,
  onUpdateButtons,
  maxButtons,
  maxButtonLength,
  nodeType,
  platform,
  className = '',
  upgradeMaxButtons,
  onRequestUpgrade
}: AIButtonToolbarProps) {
  const ai = useNodeAI({
    nodeType,
    platform,
    capabilities: ['generate-options', 'improve-copy']
  })

  // Calculate how many buttons to generate following 3-3-3-1 pattern
  const getNextBatchSize = (currentCount: number): number => {
    if (currentCount === 0) return 3 // First batch: 3
    if (currentCount === 3) return 3 // Second batch: 3 (total 6)
    if (currentCount === 6) return 3 // Third batch: 3 (total 9)
    if (currentCount === 9) return 1 // Fourth batch: 1 (total 10)
    // If not at pattern points, generate to next pattern point
    if (currentCount < 3) return 3 - currentCount
    if (currentCount < 6) return 6 - currentCount
    if (currentCount < 9) return 9 - currentCount
    if (currentCount < 10) return 10 - currentCount
    return 0 // Already at max
  }

  const handleGenerateButtons = async () => {
    if (!questionContext.trim()) {
      toast.error('Please add a question first')
      return
    }

    const batchSize = getNextBatchSize(buttons.length)
    if (batchSize === 0) {
      toast.info('Already at maximum buttons')
      return
    }

    const targetCount = buttons.length + batchSize
    console.log('[AIButtonToolbar] Generating buttons:', `current: ${buttons.length}, batch: ${batchSize}, target: ${targetCount}`)

    try {
      const existingLabels = buttons.map(b => b.label || b.text).filter((label): label is string => !!label)
      const result = await ai.generateButtons(questionContext, targetCount, {
        maxLength: maxButtonLength,
        existingButtons: existingLabels
      })

      if (result && result.options) {
        // Get only the new options (slice from current count)
        const newOptions = result.options.slice(buttons.length)
        const newButtons: ButtonData[] = [...buttons, ...newOptions.map((option, index) => ({
          id: `btn-${Date.now()}-${index}`,
          label: option.label,
          text: option.label,
          value: option.value || option.label.toLowerCase().replace(/\s+/g, '_')
        }))]

        onUpdateButtons(newButtons)
        toast.success(`Generated ${newOptions.length} button${newOptions.length > 1 ? 's' : ''}!`, {
          description: `Total: ${newButtons.length}/10`
        })
      }
    } catch (error) {
      console.error('[AIButtonToolbar] Error generating buttons:', error)
      toast.error('Failed to generate buttons')
    }
  }

  const handleFillRest = async () => {
    if (!questionContext.trim()) {
      toast.error('Please add a question first')
      return
    }

    const remaining = 10 - buttons.length
    if (remaining <= 0) {
      toast.info('Already at maximum buttons')
      return
    }

    console.log('[AIButtonToolbar] Filling rest:', `current: ${buttons.length}, remaining: ${remaining}`)

    try {
      const existingLabels = buttons.map(b => b.label || b.text).filter((label): label is string => !!label)
      const result = await ai.generateButtons(questionContext, 10, {
        maxLength: maxButtonLength,
        existingButtons: existingLabels
      })

      if (result && result.options) {
        // Get only the new options (slice from current count)
        const newOptions = result.options.slice(buttons.length)
        const newButtons: ButtonData[] = [...buttons, ...newOptions.map((option, index) => ({
          id: `btn-${Date.now()}-${index}`,
          label: option.label,
          text: option.label,
          value: option.value || option.label.toLowerCase().replace(/\s+/g, '_')
        }))]

        onUpdateButtons(newButtons)
        toast.success(`Generated ${newOptions.length} more button${newOptions.length > 1 ? 's' : ''}!`, {
          description: `Total: ${newButtons.length}/10`
        })
      }
    } catch (error) {
      console.error('[AIButtonToolbar] Error filling rest:', error)
      toast.error('Failed to generate buttons')
    }
  }

  const handleImproveButton = async (buttonIndex: number) => {
    const button = buttons[buttonIndex]
    if (!button) return

    const buttonText = button.label || button.text
    if (!buttonText) return

    console.log('[AIButtonToolbar] Improving button:', buttonText)

    try {
      const result = await ai.improveCopy(buttonText, 'button', {
        maxLength: maxButtonLength,
        context: {
          purpose: 'button label',
          flowContext: questionContext
        }
      })

      if (result) {
        const updatedButtons = [...buttons]
        updatedButtons[buttonIndex] = {
          ...button,
          label: result.improvedText
        }
        onUpdateButtons(updatedButtons)
        toast.success('Button improved!', {
          description: result.improvements[0] || 'Label enhanced'
        })
      }
    } catch (error) {
      console.error('[AIButtonToolbar] Error improving button:', error)
      toast.error('Failed to improve button')
    }
  }

  const nextBatchSize = getNextBatchSize(buttons.length)
  const remainingToTen = 10 - buttons.length
  const showFillRest = buttons.length > 0 && buttons.length < 10

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <TooltipProvider>
        {/* Generate Buttons (first time) */}
        {buttons.length === 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleGenerateButtons()
                }}
                onMouseDown={(e) => e.preventDefault()}
                disabled={ai.loading || !questionContext.trim()}
                className="w-full h-7 px-2 text-xs gap-1.5 border-purple-200 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-900/20"
              >
                {ai.loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600 dark:text-purple-400" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                )}
                <span className="text-purple-600 dark:text-purple-400 font-medium">
                  Generate Buttons
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>AI will generate 3 button options</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Add More (following 3-3-3-1 pattern) */}
        {buttons.length > 0 && buttons.length < 10 && nextBatchSize > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleGenerateButtons()
                }}
                onMouseDown={(e) => e.preventDefault()}
                disabled={ai.loading}
                className="w-full h-7 px-2 text-xs gap-1.5 border-purple-200 dark:border-purple-800 hover:bg-purple-50 dark:hover:bg-purple-900/20"
              >
                {ai.loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600 dark:text-purple-400" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                )}
                <span className="text-purple-600 dark:text-purple-400 font-medium">
                  Add More ({buttons.length + nextBatchSize}/10)
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Generate {nextBatchSize} more button{nextBatchSize > 1 ? 's' : ''} (following 3-3-3-1 pattern)</p>
            </TooltipContent>
          </Tooltip>
        )}
      </TooltipProvider>
    </div>
  )
}

/**
 * Individual Button AI Actions
 * Shows AI options for a single button
 */
interface AIButtonActionsProps {
  label: string
  onImprove: () => Promise<void>
  maxLength?: number
  disabled?: boolean
}

export function AIButtonActions({
  label,
  onImprove,
  maxLength,
  disabled = false
}: AIButtonActionsProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onImprove()
            }}
            onMouseDown={(e) => e.preventDefault()}
            disabled={disabled || !label.trim()}
            className="h-5 w-5 p-0 hover:bg-purple-50 dark:hover:bg-purple-900/20"
          >
            <Sparkles className="w-3 h-3 text-purple-500" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Improve this button with AI</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

