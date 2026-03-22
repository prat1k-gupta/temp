"use client"

import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { BLUR_COMMAND, COMMAND_PRIORITY_LOW } from "lexical"

interface FocusBlurPluginProps {
  autoFocus?: boolean
  pickerOpen: boolean
  suppressBlurRef: React.MutableRefObject<boolean>
  containerRef: React.RefObject<HTMLDivElement | null>
  onBlur?: (event: FocusEvent) => void
}

export function FocusBlurPlugin({
  autoFocus,
  pickerOpen,
  suppressBlurRef,
  containerRef,
  onBlur,
}: FocusBlurPluginProps) {
  const [editor] = useLexicalComposerContext()

  // Auto-focus on mount
  useEffect(() => {
    if (autoFocus) {
      editor.focus()
    }
  }, [editor, autoFocus])

  // Blur handling
  useEffect(() => {
    return editor.registerCommand(
      BLUR_COMMAND,
      (event: FocusEvent) => {
        if (pickerOpen) return true // suppress
        if (suppressBlurRef.current) {
          suppressBlurRef.current = false
          return true // suppress
        }
        // Check if focus is moving to something inside our container
        const relatedTarget = event.relatedTarget as Node | null
        if (relatedTarget && containerRef.current?.contains(relatedTarget)) {
          return true // suppress
        }
        onBlur?.(event)
        return false
      },
      COMMAND_PRIORITY_LOW
    )
  }, [editor, pickerOpen, suppressBlurRef, containerRef, onBlur])

  return null
}
