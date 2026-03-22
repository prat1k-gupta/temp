"use client"

import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  KEY_DOWN_COMMAND,
  COMMAND_PRIORITY_HIGH,
  $getSelection,
  $isRangeSelection,
  $isNodeSelection,
  $isElementNode,
  $getNodeByKey,
} from "lexical"
import { $isVariableMentionNode } from "../variable-mention-node"

interface KeyboardHandlerPluginProps {
  parentOnKeyDown?: (e: KeyboardEvent) => void
  pickerOpen: boolean
}

export function KeyboardHandlerPlugin({
  parentOnKeyDown,
  pickerOpen,
}: KeyboardHandlerPluginProps) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event: KeyboardEvent) => {
        // Don't intercept when picker is open (picker handles its own keys)
        if (pickerOpen) return false

        // Enter without Shift → save
        if (event.key === "Enter" && !event.shiftKey) {
          parentOnKeyDown?.(event)
          return true
        }

        // Escape → cancel
        if (event.key === "Escape") {
          parentOnKeyDown?.(event)
          return true
        }

        // Backspace or Delete on a NodeSelection (clicked pill) → delete it
        if (event.key === "Backspace" || event.key === "Delete") {
          const selection = $getSelection()
          if ($isNodeSelection(selection)) {
            const nodes = selection.getNodes()
            const mentionNodes = nodes.filter($isVariableMentionNode)
            if (mentionNodes.length > 0) {
              event.preventDefault()
              for (const node of mentionNodes) {
                node.remove()
              }
              return true
            }
          }
        }

        // Backspace → atomic delete of VariableMentionNode
        if (event.key === "Backspace") {
          const selection = $getSelection()
          if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false

          const anchor = selection.anchor
          const anchorNode = anchor.getNode()

          // Case 1: Cursor at offset 0 of a text node, pill is previous sibling
          if (anchor.type === "text" && anchor.offset === 0) {
            const prev = anchorNode.getPreviousSibling()
            if ($isVariableMentionNode(prev)) {
              event.preventDefault()
              prev.remove()
              return true
            }
          }

          // Case 2: Cursor is on an element node (paragraph) with anchor type "element"
          // This happens when Lexical places cursor between decorator nodes
          if (anchor.type === "element" && $isElementNode(anchorNode)) {
            const offset = anchor.offset
            if (offset > 0) {
              const child = anchorNode.getChildAtIndex(offset - 1)
              if ($isVariableMentionNode(child)) {
                event.preventDefault()
                child.remove()
                return true
              }
            }
          }

          // Case 3: Cursor is directly on a VariableMentionNode (node selection)
          if ($isVariableMentionNode(anchorNode)) {
            event.preventDefault()
            anchorNode.remove()
            return true
          }
        }

        // Delete key → atomic delete of pill after cursor
        if (event.key === "Delete") {
          const selection = $getSelection()
          if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false

          const anchor = selection.anchor
          const anchorNode = anchor.getNode()

          // Text node — check next sibling at end of text
          if (anchor.type === "text" && anchor.offset === anchorNode.getTextContentSize()) {
            const next = anchorNode.getNextSibling()
            if ($isVariableMentionNode(next)) {
              event.preventDefault()
              next.remove()
              return true
            }
          }

          // Element anchor — check child at offset
          if (anchor.type === "element" && $isElementNode(anchorNode)) {
            const child = anchorNode.getChildAtIndex(anchor.offset)
            if ($isVariableMentionNode(child)) {
              event.preventDefault()
              child.remove()
              return true
            }
          }
        }

        return false
      },
      COMMAND_PRIORITY_HIGH
    )
  }, [editor, parentOnKeyDown, pickerOpen])

  return null
}
