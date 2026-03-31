"use client"

import {
  useRef,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type TextareaHTMLAttributes,
} from "react"
import { createPortal } from "react-dom"
import { LexicalComposer } from "@lexical/react/LexicalComposer"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin"
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin"
import { PlainTextPlugin } from "@lexical/react/LexicalPlainTextPlugin"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import type { EditorState, LexicalEditor } from "lexical"
import { $getSelection, $isRangeSelection, $getNodeByKey } from "lexical"
import { VariablePicker, type CrossFlowVariable } from "@/components/variable-picker"
import { VariableMentionNode, $createVariableMentionNode, $isVariableMentionNode } from "@/lib/lexical/variable-mention-node"
import { PillClickProvider } from "@/lib/lexical/pill-click-context"
import { $buildEditorContent, editorStateToPlainText, resolveVariableDisplay } from "@/lib/lexical/serialization"
import { VariableTriggerPlugin } from "@/lib/lexical/plugins/variable-trigger-plugin"
import { KeyboardHandlerPlugin } from "@/lib/lexical/plugins/keyboard-handler-plugin"
import { ExternalValueSyncPlugin } from "@/lib/lexical/plugins/external-value-sync-plugin"
import { FocusBlurPlugin } from "@/lib/lexical/plugins/focus-blur-plugin"
import { PasteHandlerPlugin } from "@/lib/lexical/plugins/paste-handler-plugin"
import { extractVariableReferences } from "@/utils/flow-variables"
import type { FlowVariable } from "@/utils/flow-variables"
import { AlertTriangle, Braces } from "lucide-react"
import { cn } from "@/lib/utils"
import { getGlobalVariables, getChatbotFlows } from "@/lib/whatsapp-api"

interface VariablePickerTextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange"> {
  value: string
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  onValueChange?: (value: string) => void
  flowVariables?: FlowVariable[]
  excludeVariable?: string
  globalVariables?: Record<string, string>
  crossFlowVariables?: CrossFlowVariable[]
  showVariableButton?: boolean
  showUnknownWarnings?: boolean
}

// --- Module-level cache for global/cross-flow variables ---
let _cachedGlobals: Record<string, string> | null = null
let _cachedCrossFlow: CrossFlowVariable[] | null = null
let _fetchPromise: Promise<void> | null = null
let _lastFetchFailed = false
let _lastFetchTime = 0

async function fetchExternalVariables() {
  const now = Date.now()
  if (_cachedGlobals !== null && _cachedCrossFlow !== null && !_lastFetchFailed) return
  if (_lastFetchFailed && now - _lastFetchTime < 30_000) return
  if (_fetchPromise) return _fetchPromise

  _fetchPromise = (async () => {
    try {
      const [settingsResult, flowsResult] = await Promise.all([
        getGlobalVariables().catch(() => null),
        getChatbotFlows().catch(() => null),
      ])
      _cachedGlobals = settingsResult?.globalVariables || {}
      _cachedCrossFlow = (flowsResult?.flows || [])
        .filter((f: any) => f.flowSlug && f.variables?.length > 0)
        .map((f: any) => ({
          flowName: f.name,
          flowSlug: f.flowSlug,
          variables: f.variables,
        }))
      _lastFetchFailed = false
    } catch {
      _cachedGlobals = {}
      _cachedCrossFlow = []
      _lastFetchFailed = true
    }
    _lastFetchTime = Date.now()
    _fetchPromise = null
  })()

  return _fetchPromise
}

// --- Lexical theme ---
const lexicalTheme = {
  paragraph: "lexical-paragraph",
}

// --- Component ---
export function VariablePickerTextarea({
  value,
  onChange: _onChange,
  onValueChange,
  flowVariables = [],
  excludeVariable,
  globalVariables: propGlobals,
  crossFlowVariables: propCrossFlow,
  showVariableButton = true,
  showUnknownWarnings = true,
  className,
  onKeyDown: parentOnKeyDown,
  onBlur: parentOnBlur,
  autoFocus,
  placeholder,
  // Rest spread intentionally omitted — Lexical uses a contenteditable div,
  // so extra textarea HTML attributes don't apply
}: VariablePickerTextareaProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const suppressBlurRef = useRef(false)
  const parentOnKeyDownRef = useRef(parentOnKeyDown)
  parentOnKeyDownRef.current = parentOnKeyDown
  const lastEmittedRef = useRef(value)
  const editorRef = useRef<LexicalEditor | null>(null)

  // --- Picker state ---
  const [pickerOpen, setPickerOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 })
  const [replacingNodeKey, setReplacingNodeKey] = useState<string | null>(null)

  // Exclude the current node's own variable (not stored until user responds)
  const filteredFlowVariables = useMemo(
    () => excludeVariable
      ? flowVariables.filter((v) => v.name !== excludeVariable)
      : flowVariables,
    [flowVariables, excludeVariable]
  )

  // --- Lazy-loaded external data ---
  const [globals, setGlobals] = useState<Record<string, string>>(propGlobals || {})
  const [crossFlow, setCrossFlow] = useState<CrossFlowVariable[]>(propCrossFlow || [])
  const [externalLoaded, setExternalLoaded] = useState(false)

  const ensureExternalData = useCallback(async () => {
    if (externalLoaded) return
    if (propGlobals && propCrossFlow) { setExternalLoaded(true); return }
    await fetchExternalVariables()
    if (!propGlobals && _cachedGlobals) setGlobals(_cachedGlobals)
    if (!propCrossFlow && _cachedCrossFlow) setCrossFlow(_cachedCrossFlow)
    setExternalLoaded(true)
  }, [externalLoaded, propGlobals, propCrossFlow])

  useEffect(() => { if (propGlobals) setGlobals(propGlobals) }, [propGlobals])
  useEffect(() => { if (propCrossFlow) setCrossFlow(propCrossFlow) }, [propCrossFlow])

  // --- Unknown variable warnings (derived state) ---
  const unknownVars = useMemo(() => {
    if (!showUnknownWarnings || !value) return []
    const refs = extractVariableReferences(value)
    if (refs.length === 0) return []

    const known = new Set<string>()
    for (const fv of filteredFlowVariables) {
      known.add(fv.name)
      if (fv.hasTitleVariant) known.add(`${fv.name}_title`)
    }
    for (const key of Object.keys(globals)) known.add(`global.${key}`)
    for (const cf of crossFlow) {
      for (const v of cf.variables) known.add(`flow.${cf.flowSlug}.${v}`)
    }
    return refs.filter((r) =>
      !known.has(r) && !r.startsWith("global.") && !r.startsWith("flow.") && !r.startsWith("system.")
    )
  }, [value, filteredFlowVariables, globals, crossFlow, showUnknownWarnings])

  // --- Lexical initial config ---
  const initialConfig = useMemo(() => ({
    namespace: "VariablePickerTextarea",
    nodes: [VariableMentionNode],
    onError: (error: Error) => console.error("Lexical error:", error),
    theme: lexicalTheme,
    editorState: (editor: LexicalEditor) => {
      editorRef.current = editor
      $buildEditorContent(value, filteredFlowVariables)
    },
  }), []) // eslint-disable-line react-hooks/exhaustive-deps

  // --- Picker open/close ---
  const openPicker = useCallback(
    (position: { top: number; left: number }) => {
      ensureExternalData()
      setPickerPos(position)
      setSearchQuery("")
      setReplacingNodeKey(null)
      setPickerOpen(true)
    },
    [ensureExternalData]
  )

  const closePicker = useCallback(() => {
    setPickerOpen(false)
    setSearchQuery("")
    setReplacingNodeKey(null)
  }, [])

  // --- Pill click → open picker in replace mode ---
  const handlePillClick = useCallback(
    (nodeKey: string, rect: DOMRect) => {
      ensureExternalData()
      setPickerPos({
        top: rect.bottom + 4,
        left: Math.min(rect.left, window.innerWidth - 260),
      })
      setSearchQuery("")
      setReplacingNodeKey(nodeKey)
      setPickerOpen(true)
    },
    [ensureExternalData]
  )

  // --- Event handlers ---
  const handleLexicalChange = useCallback(
    (_editorState: EditorState, editor: LexicalEditor) => {
      editorRef.current = editor
      const text = editorStateToPlainText(editor)
      lastEmittedRef.current = text
      onValueChange?.(text)
    },
    [onValueChange]
  )

  const handleSelect = useCallback(
    (variableRef: string) => {
      const editor = editorRef.current
      if (!editor) return

      const { displayName, varType } = resolveVariableDisplay(variableRef, filteredFlowVariables)

      editor.update(() => {
        if (replacingNodeKey) {
          // Replace mode: swap the clicked pill with the new variable
          const existingNode = $getNodeByKey(replacingNodeKey)
          if ($isVariableMentionNode(existingNode)) {
            const newNode = $createVariableMentionNode(variableRef, displayName, varType)
            existingNode.replace(newNode)
          }
        } else {
          // Insert mode: insert at cursor
          const selection = $getSelection()
          if (!$isRangeSelection(selection)) return
          const mentionNode = $createVariableMentionNode(variableRef, displayName, varType)
          selection.insertNodes([mentionNode])
        }
      })

      closePicker()
      setTimeout(() => editor.focus(), 0)
    },
    [filteredFlowVariables, closePicker, replacingNodeKey]
  )

  const handleBracesClick = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    editor.focus()
    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
        selection.insertText("{{")
      }
    })
  }, [])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (pickerOpen && event.key === "Escape") {
        event.preventDefault()
        event.stopPropagation()
        closePicker()
        return
      }
      parentOnKeyDownRef.current?.(event as unknown as React.KeyboardEvent<HTMLTextAreaElement>)
    },
    [pickerOpen, closePicker]
  )

  const handleBlur = useCallback((event: FocusEvent) => {
    // Create a synthetic React-like event from the native FocusEvent
    // Consumers access relatedTarget for container blur checks
    const syntheticEvent = {
      ...event,
      target: event.target,
      currentTarget: event.currentTarget,
      relatedTarget: event.relatedTarget,
      preventDefault: () => event.preventDefault(),
      stopPropagation: () => event.stopPropagation(),
      nativeEvent: event,
    } as unknown as React.FocusEvent<HTMLTextAreaElement>
    parentOnBlur?.(syntheticEvent)
  }, [parentOnBlur])

  // --- Render ---
  return (
    <div ref={containerRef} className="relative">
      <LexicalComposer initialConfig={initialConfig}>
        <PillClickProvider value={handlePillClick}>
        <div className="relative group/vp">
          <PlainTextPlugin
            contentEditable={
              <ContentEditable
                className={cn(
                  "block min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 cursor-text",
                  "lexical-editor nodrag",
                  className
                )}
              />
            }
            placeholder={
              placeholder ? (
                <div className="lexical-placeholder text-sm text-muted-foreground pointer-events-none absolute top-2 left-3 right-3 select-none overflow-hidden text-ellipsis whitespace-nowrap">
                  {String(placeholder)}
                </div>
              ) : null
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <OnChangePlugin onChange={handleLexicalChange} ignoreSelectionChange />
          <VariableTriggerPlugin
            onTrigger={openPicker}
            onQueryChange={setSearchQuery}
            pickerOpen={pickerOpen}
            onClosePicker={closePicker}
          />
          <KeyboardHandlerPlugin
            parentOnKeyDown={handleKeyDown}
            pickerOpen={pickerOpen}
          />
          <ExternalValueSyncPlugin
            value={value}
            flowVariables={filteredFlowVariables}
            lastEmittedRef={lastEmittedRef}
          />
          <PasteHandlerPlugin flowVariables={filteredFlowVariables} />
          <FocusBlurPlugin
            autoFocus={!!autoFocus}
            pickerOpen={pickerOpen}
            suppressBlurRef={suppressBlurRef}
            containerRef={containerRef}
            onBlur={handleBlur}
          />
          {showVariableButton && (
            <button
              type="button"
              className="absolute top-1.5 right-1.5 p-1 rounded opacity-0 group-hover/vp:opacity-100 hover:bg-accent transition-opacity z-10"
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                suppressBlurRef.current = true
              }}
              onClick={(e) => {
                e.stopPropagation()
                handleBracesClick()
              }}
              title="Insert variable"
            >
              <Braces className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
        </PillClickProvider>
      </LexicalComposer>

      {pickerOpen && createPortal(
        <VariablePicker
          open={pickerOpen}
          onClose={closePicker}
          onSelect={handleSelect}
          flowVariables={filteredFlowVariables}
          globalVariables={globals}
          crossFlowVariables={crossFlow}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          position={pickerPos}
        />,
        document.body
      )}

      {showUnknownWarnings && unknownVars.length > 0 && (
        <div className="flex items-start gap-1.5 mt-1 px-1">
          <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
          <span className="text-[10px] text-amber-600 dark:text-amber-400">
            Unknown variable{unknownVars.length > 1 ? "s" : ""}: {unknownVars.map((v) => `{{${v}}}`).join(", ")}
          </span>
        </div>
      )}
    </div>
  )
}
