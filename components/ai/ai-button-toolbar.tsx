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
  className = ''
}: AIButtonToolbarProps) {
  const ai = useNodeAI({
    nodeType,
    platform,
    capabilities: ['generate-options', 'improve-copy']
  })

  const handleGenerateButtons = async () => {
    if (!questionContext.trim()) {
      toast.error('Please add a question first')
      return
    }

    console.log('[AIButtonToolbar] Generating buttons for:', questionContext)

    try {
      const existingLabels = buttons.map(b => b.label || b.text).filter((label): label is string => !!label)
      const result = await ai.generateButtons(questionContext, maxButtons, {
        maxLength: maxButtonLength,
        existingButtons: existingLabels
      })

      if (result && result.options) {
        const newButtons: ButtonData[] = result.options.map((option, index) => ({
          id: `btn-${Date.now()}-${index}`,
          label: option.label,
          value: option.value || option.label.toLowerCase().replace(/\s+/g, '_')
        }))

        onUpdateButtons(newButtons)
        toast.success(`Generated ${newButtons.length} buttons!`, {
          description: 'Review and customize as needed'
        })
      }
    } catch (error) {
      console.error('[AIButtonToolbar] Error generating buttons:', error)
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

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <TooltipProvider>
        {/* Generate Buttons */}
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
              <p>AI will suggest {maxButtons} button options</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Regenerate if buttons exist */}
        {buttons.length > 0 && buttons.length < maxButtons && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleGenerateButtons()
                }}
                onMouseDown={(e) => e.preventDefault()}
                disabled={ai.loading}
                className="w-full h-6 px-2 text-xs gap-1"
              >
                <Sparkles className="w-3 h-3 text-purple-500" />
                <span className="text-xs text-muted-foreground">Fill remaining</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Generate {maxButtons - buttons.length} more buttons</p>
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

