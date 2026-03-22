"use client"

import { useEffect, useRef } from "react"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { $buildEditorContent } from "../serialization"
import type { FlowVariable } from "@/utils/flow-variables"

interface ExternalValueSyncPluginProps {
  value: string
  flowVariables: FlowVariable[]
  lastEmittedRef: React.MutableRefObject<string>
}

export function ExternalValueSyncPlugin({
  value,
  flowVariables,
  lastEmittedRef,
}: ExternalValueSyncPluginProps) {
  const [editor] = useLexicalComposerContext()
  const isFirstMount = useRef(true)

  useEffect(() => {
    // Skip the first mount — initial content is set via initialConfig
    if (isFirstMount.current) {
      isFirstMount.current = false
      return
    }

    // If this value matches what we last emitted, it's a feedback loop → skip
    if (value === lastEmittedRef.current) return

    // External change (e.g., AI toolbar rewrite) → rebuild editor content
    editor.update(() => {
      $buildEditorContent(value, flowVariables)
    })
  }, [value, editor, flowVariables, lastEmittedRef])

  return null
}
