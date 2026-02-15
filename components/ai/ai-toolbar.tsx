"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Sparkles, Minimize2, Loader2 } from 'lucide-react'
import { useAITextImprover } from '@/hooks/use-node-ai'
import type { Platform } from '@/types'
import { toast } from 'sonner'

interface AIToolbarProps {
  value: string
  onChange: (value: string) => void
  nodeType: string
  platform: Platform
  field: string
  maxLength?: number
  className?: string
}

/**
 * AI Toolbar Component
 * Shows AI action buttons for text fields
 */
export function AIToolbar({
  value,
  onChange,
  nodeType,
  platform,
  field,
  maxLength,
  className = ''
}: AIToolbarProps) {

  console.log('[AIToolbar] AIToolbar props:', { value, nodeType, platform, field, maxLength, className })
  const ai = useAITextImprover(nodeType, platform)
  const [isImproving, setIsImproving] = useState(false)
  const [isShortening, setIsShortening] = useState(false)

  const handleImprove = async () => {
    console.log('[AIToolbar] Handling improve')
    if (!value.trim()) {
      toast.error('Please enter some text first')
      return
    }

    console.log('[AIToolbar] Improving text:', { value, field, maxLength })
    setIsImproving(true)
    
    try {
      const result = await ai.improveCopy(value, field, { maxLength })
      console.log('[AIToolbar] Improve result:', result)
      
      if (result) {
        onChange(result.improvedText)
        toast.success('Text improved!', {
          description: result.improvements.join(', ')
        })
      } else {
        console.error('[AIToolbar] No result returned')
        toast.error('No result from AI')
      }
    } catch (error) {
      console.error('[AIToolbar] Error improving text:', error)
      toast.error('Failed to improve text: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setIsImproving(false)
    }
  }

  const handleShorten = async () => {
    if (!value.trim()) {
      toast.error('Please enter some text first')
      return
    }

    if (!maxLength) {
      toast.error('No character limit set')
      return
    }

    if (value.length <= maxLength) {
      toast.info('Text is already within limit')
      return
    }

    setIsShortening(true)
    try {
      const result = await ai.shortenText(value, maxLength)
      if (result) {
        onChange(result.shortenedText)
        toast.success('Text shortened!', {
          description: `Reduced by ${result.reduction} characters`
        })
      }
    } catch (error) {
      toast.error('Failed to shorten text')
    } finally {
      setIsShortening(false)
    }
  }

  const isOverLimit = maxLength && value.length > maxLength

  return (
    <div className={`flex items-center gap-0.5 ${className}`}>
      <TooltipProvider>
        {/* Improve Button - Icon only, expands on hover */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                console.log('[AIToolbar] Button clicked!')
                handleImprove()
              }}
              onMouseDown={(e) => {
                // Prevent textarea blur when clicking this button
                e.preventDefault()
              }}
              disabled={isImproving || isShortening || !value.trim()}
              className="h-6 px-1.5 text-xs gap-0 group hover:gap-1 hover:px-2 transition-all hover:bg-blue-50 dark:hover:bg-blue-900/20"
            >
              {isImproving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2872F4]" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 text-[#2872F4]" />
              )}
              <span className="bg-gradient-to-r from-[#052762] to-[#2872F4] bg-clip-text text-transparent max-w-0 overflow-hidden group-hover:max-w-[60px] transition-all duration-200 whitespace-nowrap font-medium">
                Improve
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Improve text with AI</p>
          </TooltipContent>
        </Tooltip>

        {/* Shorten Button - Icon only, expands on hover */}
        {maxLength && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  console.log('[AIToolbar] Shorten button clicked!')
                  handleShorten()
                }}
                onMouseDown={(e) => {
                  // Prevent textarea blur when clicking this button
                  e.preventDefault()
                }}
                disabled={isImproving || isShortening || !value.trim()}
                className={`h-6 px-1.5 text-xs gap-0 group hover:gap-1 hover:px-2 transition-all ${
                  isOverLimit 
                    ? 'hover:bg-orange-50 dark:hover:bg-orange-900/20' 
                    : 'hover:bg-blue-50 dark:hover:bg-blue-900/20'
                }`}
              >
                {isShortening ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Minimize2 className={`w-3.5 h-3.5 ${
                    isOverLimit 
                      ? 'text-orange-500' 
                      : 'text-blue-500'
                  }`} />
                )}
                <span className={`max-w-0 overflow-hidden group-hover:max-w-[60px] transition-all duration-200 whitespace-nowrap ${
                  isOverLimit 
                    ? 'text-orange-600 dark:text-orange-400' 
                    : 'text-blue-600 dark:text-blue-400'
                }`}>
                  Shorten
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Shorten to fit {maxLength} character limit</p>
              {isOverLimit && (
                <p className="text-orange-500 text-xs">
                  Currently over by {value.length - maxLength} chars
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        )}
      </TooltipProvider>
    </div>
  )
}

