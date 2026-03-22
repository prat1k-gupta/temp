"use client"

import type { JSX } from "react"
import {
  DecoratorNode,
  type DOMConversionMap,
  type DOMExportOutput,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical"
import { VariablePill } from "./variable-pill"

export type SerializedVariableMentionNode = Spread<
  {
    variableRef: string
    displayName: string
    varType: string
  },
  SerializedLexicalNode
>

export class VariableMentionNode extends DecoratorNode<JSX.Element> {
  __variableRef: string
  __displayName: string
  __varType: string

  static getType(): string {
    return "variable-mention"
  }

  static clone(node: VariableMentionNode): VariableMentionNode {
    return new VariableMentionNode(
      node.__variableRef,
      node.__displayName,
      node.__varType,
      node.__key
    )
  }

  constructor(
    variableRef: string,
    displayName: string,
    varType: string,
    key?: NodeKey
  ) {
    super(key)
    this.__variableRef = variableRef
    this.__displayName = displayName
    this.__varType = varType
  }

  getVariableRef(): string {
    return this.__variableRef
  }

  getDisplayName(): string {
    return this.__displayName
  }

  getVarType(): string {
    return this.__varType
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const span = document.createElement("span")
    span.style.display = "inline"
    span.style.verticalAlign = "baseline"
    return span
  }

  updateDOM(): false {
    return false
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement("span")
    element.textContent = `{{${this.__variableRef}}}`
    return { element }
  }

  static importDOM(): DOMConversionMap | null {
    return null
  }

  static importJSON(
    serializedNode: SerializedVariableMentionNode
  ): VariableMentionNode {
    return $createVariableMentionNode(
      serializedNode.variableRef,
      serializedNode.displayName,
      serializedNode.varType
    )
  }

  exportJSON(): SerializedVariableMentionNode {
    return {
      ...super.exportJSON(),
      type: VariableMentionNode.getType(),
      variableRef: this.__variableRef,
      displayName: this.__displayName,
      varType: this.__varType,
    }
  }

  getTextContent(): string {
    return `{{${this.__variableRef}}}`
  }

  isInline(): boolean {
    return true
  }

  isIsolated(): boolean {
    return false
  }

  isKeyboardSelectable(): boolean {
    return true
  }

  decorate(): JSX.Element {
    return (
      <VariablePill
        displayName={this.__displayName}
        varType={this.__varType}
        nodeKey={this.__key}
      />
    )
  }
}

export function $createVariableMentionNode(
  variableRef: string,
  displayName: string,
  varType: string
): VariableMentionNode {
  return new VariableMentionNode(variableRef, displayName, varType)
}

export function $isVariableMentionNode(
  node: LexicalNode | null | undefined
): node is VariableMentionNode {
  return node instanceof VariableMentionNode
}
