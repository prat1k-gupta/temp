"use client"

import { useEffect, useRef } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $getSelection, $isRangeSelection, $isTextNode } from "lexical"

interface VariableTriggerPluginProps {
  onTrigger: (position: { top: number; left: number }) => void
  onQueryChange: (query: string) => void
  pickerOpen: boolean
  onClosePicker: () => void
}

export function VariableTriggerPlugin({
  onTrigger,
  onQueryChange,
  pickerOpen,
  onClosePicker,
}: VariableTriggerPluginProps) {
  const [editor] = useLexicalComposerContext()
  const triggerNodeKeyRef = useRef<string | null>(null)
  const triggerOffsetRef = useRef<number | null>(null)
  const pickerOpenRef = useRef(pickerOpen)
  // Reset trigger state when picker closes
  if (!pickerOpen && pickerOpenRef.current) {
    triggerNodeKeyRef.current = null
    triggerOffsetRef.current = null
  }
  pickerOpenRef.current = pickerOpen

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) return

        const anchor = selection.anchor
        const node = anchor.getNode()
        if (!$isTextNode(node)) return

        const text = node.getTextContent()
        const cursorOffset = anchor.offset

        if (pickerOpenRef.current && triggerOffsetRef.current !== null) {
          // Picker is open — track search query
          if (anchor.key !== triggerNodeKeyRef.current) {
            onClosePicker()
            return
          }
          if (cursorOffset < triggerOffsetRef.current) {
            onClosePicker()
            return
          }
          const typed = text.slice(triggerOffsetRef.current, cursorOffset)
          if (typed.includes("}}") || typed.includes("\n")) {
            onClosePicker()
            return
          }
          onQueryChange(typed)
          return
        }

        // Check for {{ trigger
        if (cursorOffset >= 2 && text.slice(cursorOffset - 2, cursorOffset) === "{{") {
          // Remove the {{ from the text node
          const before = text.slice(0, cursorOffset - 2)
          const after = text.slice(cursorOffset)

          triggerOffsetRef.current = before.length

          // Modify the node in a separate update to avoid read-mode errors
          editor.update(() => {
            const freshSelection = $getSelection()
            if (!$isRangeSelection(freshSelection)) return
            const freshNode = freshSelection.anchor.getNode()
            if (!$isTextNode(freshNode)) return

            freshNode.setTextContent(before + after)
            freshSelection.anchor.set(freshNode.getKey(), before.length, "text")
            freshSelection.focus.set(freshNode.getKey(), before.length, "text")

            // Update node key ref after mutation (node may have been replaced)
            triggerNodeKeyRef.current = freshNode.getKey()
          })

          // Get cursor position for picker placement after DOM update
          setTimeout(() => {
            let top = 0
            let left = 0

            const domSelection = window.getSelection()
            if (domSelection && domSelection.rangeCount > 0) {
              const range = domSelection.getRangeAt(0)
              const rect = range.getBoundingClientRect()
              // Collapsed ranges in empty nodes return a zero rect
              if (rect.top !== 0 || rect.left !== 0 || rect.width !== 0) {
                top = rect.bottom + 4
                left = rect.left
              }
            }

            // Fallback: use the editor root element's position
            if (top === 0 && left === 0) {
              const rootEl = editor.getRootElement()
              if (rootEl) {
                const editorRect = rootEl.getBoundingClientRect()
                top = editorRect.top + 24
                left = editorRect.left + 8
              }
            }

            onTrigger({
              top,
              left: Math.min(left, window.innerWidth - 260),
            })
          }, 0)
        }
      })
    })
  }, [editor, onTrigger, onQueryChange, onClosePicker])

  return null
}
