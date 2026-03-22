import { $createParagraphNode, $createTextNode, $getRoot, $isParagraphNode, type LexicalEditor, type LexicalNode } from "lexical"
import { $createVariableMentionNode, $isVariableMentionNode } from "./variable-mention-node"
import type { FlowVariable } from "@/utils/flow-variables"

/**
 * Determines display name and variable type for a variable reference.
 * Same logic as variable-highlight-text.tsx.
 */
export function resolveVariableDisplay(
  ref: string,
  flowVariables: FlowVariable[]
): { displayName: string; varType: string } {
  const flowVarNames = new Set(flowVariables.map((v) => v.name))
  for (const v of flowVariables) flowVarNames.add(`${v.name}_title`)

  if (flowVarNames.has(ref)) {
    return { displayName: ref, varType: "flow" }
  }
  if (ref.startsWith("global.")) {
    return { displayName: ref.slice(7), varType: "global" }
  }
  if (ref.startsWith("flow.")) {
    const parts = ref.split(".")
    const displayName = parts.length >= 3 ? parts.slice(2).join(".") : ref
    return { displayName, varType: "cross-flow" }
  }
  // Template builder context: no flow variables provided, but bare variable
  // names like {{user_name}} are session variables — show as flow type (indigo)
  if (flowVariables.length === 0) {
    return { displayName: ref, varType: "flow" }
  }
  return { displayName: ref, varType: "unknown" }
}

/**
 * Populates the editor with text + variable mention nodes from a plain text string.
 * Must be called inside editor.update().
 */
export function $buildEditorContent(
  text: string,
  flowVariables: FlowVariable[]
): void {
  const root = $getRoot()
  root.clear()

  const lines = text.split("\n")

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx]
    const paragraph = $createParagraphNode()

    const regex = /\{\{([^}]+)\}\}/g
    let lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = regex.exec(line)) !== null) {
      // Add text before the match
      if (match.index > lastIndex) {
        paragraph.append($createTextNode(line.slice(lastIndex, match.index)))
      }

      // Add mention node
      const ref = match[1].trim()
      const { displayName, varType } = resolveVariableDisplay(ref, flowVariables)
      paragraph.append($createVariableMentionNode(ref, displayName, varType))

      lastIndex = match.index + match[0].length
    }

    // Add remaining text
    if (lastIndex < line.length) {
      paragraph.append($createTextNode(line.slice(lastIndex)))
    }

    // Empty paragraph needs at least an empty text node for cursor placement
    if (paragraph.getChildrenSize() === 0) {
      paragraph.append($createTextNode(""))
    }

    root.append(paragraph)
  }
}

/**
 * Parses a single line of text into an array of text and mention nodes.
 * Reusable by both $buildEditorContent and paste handling.
 */
export function $parseLineToNodes(
  line: string,
  flowVariables: FlowVariable[]
): LexicalNode[] {
  const nodes: LexicalNode[] = []
  const regex = /\{\{([^}]+)\}\}/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      nodes.push($createTextNode(line.slice(lastIndex, match.index)))
    }
    const ref = match[1].trim()
    const { displayName, varType } = resolveVariableDisplay(ref, flowVariables)
    nodes.push($createVariableMentionNode(ref, displayName, varType))
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < line.length) {
    nodes.push($createTextNode(line.slice(lastIndex)))
  }

  return nodes
}

/**
 * Serializes editor state back to plain text with {{variable}} syntax.
 */
export function editorStateToPlainText(editor: LexicalEditor): string {
  return editor.getEditorState().read(() => {
    const root = $getRoot()
    const paragraphs = root.getChildren()

    return paragraphs
      .map((paragraph) => {
        if (!$isParagraphNode(paragraph)) return paragraph.getTextContent()
        const children: LexicalNode[] = paragraph.getChildren()
        return children
          .map((child: LexicalNode) => {
            if ($isVariableMentionNode(child)) {
              return `{{${child.getVariableRef()}}}`
            }
            return child.getTextContent()
          })
          .join("")
      })
      .join("\n")
  })
}
