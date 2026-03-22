"use client"

import { useEffect } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  PASTE_COMMAND,
  COMMAND_PRIORITY_HIGH,
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  $createTextNode,
} from "lexical"
import { $parseLineToNodes } from "../serialization"
import type { FlowVariable } from "@/utils/flow-variables"

interface PasteHandlerPluginProps {
  flowVariables: FlowVariable[]
}

export function PasteHandlerPlugin({ flowVariables }: PasteHandlerPluginProps) {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerCommand(
      PASTE_COMMAND,
      (event: ClipboardEvent) => {
        const clipboardData = event.clipboardData
        if (!clipboardData) return false

        const text = clipboardData.getData("text/plain")
        if (!text || !text.includes("{{")) return false // no variables, let default handle it

        event.preventDefault()

        const selection = $getSelection()
        if (!$isRangeSelection(selection)) return true

        const lines = text.split("\n")

        if (lines.length === 1) {
          // Single line: insert nodes inline at cursor
          const nodes = $parseLineToNodes(lines[0], flowVariables)
          if (nodes.length > 0) {
            selection.insertNodes(nodes)
          }
        } else {
          // Multi-line: first line inserts at cursor, rest as new paragraphs
          const firstLineNodes = $parseLineToNodes(lines[0], flowVariables)
          if (firstLineNodes.length > 0) {
            selection.insertNodes(firstLineNodes)
          }

          for (let i = 1; i < lines.length; i++) {
            selection.insertParagraph()
            const newSelection = $getSelection()
            if ($isRangeSelection(newSelection)) {
              const lineNodes = $parseLineToNodes(lines[i], flowVariables)
              if (lineNodes.length > 0) {
                newSelection.insertNodes(lineNodes)
              }
            }
          }
        }

        return true
      },
      COMMAND_PRIORITY_HIGH
    )
  }, [editor, flowVariables])

  return null
}
