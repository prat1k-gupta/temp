"use client"

import { Textarea } from '@/components/ui/textarea'
import { AIToolbar } from './ai-toolbar'
import type { Platform } from '@/types'

interface AITextFieldProps {
  value: string
  onChange: (value: string) => void
  nodeType: string
  platform: Platform
  field: string
  maxLength?: number
  placeholder?: string
  rows?: number
  className?: string
}

/**
 * AI-Enhanced Text Field
 * Combines a textarea with AI toolbar for easy integration
 * 
 * @example
 * <AITextField
 *   value={question}
 *   onChange={setQuestion}
 *   nodeType="question"
 *   platform="whatsapp"
 *   field="question"
 *   maxLength={500}
 *   placeholder="Enter your question..."
 * />
 */
export function AITextField({
  value,
  onChange,
  nodeType,
  platform,
  field,
  maxLength,
  placeholder,
  rows = 3,
  className = ''
}: AITextFieldProps) {
  return (
    <div className="space-y-2">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        className={className}
      />
      
      <AIToolbar
        value={value}
        onChange={onChange}
        nodeType={nodeType}
        platform={platform}
        field={field}
        maxLength={maxLength}
      />
    </div>
  )
}

