"use client"

import React, { useState, useCallback, useEffect, useRef } from "react"
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  BackgroundVariant,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type Edge,
  type Connection,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { nodeTypes } from "@/constants/node-types-registry"
import { NODE_TEMPLATES, getNodesByCategory } from "@/constants/node-categories"
import { DEFAULT_EDGE_STYLE } from "@/constants/edge-styles"
import { createNode, createCommentNode } from "@/utils"
import { injectNodeCallbacks } from "@/utils/node-data-injection"
import type { Platform, NodeData, TemplateAIMetadata } from "@/types"
import { Layers, Save, X, Plus, GripVertical, ChevronDown, ChevronUp, Bot } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"

interface TemplateEditorModalProps {
  isOpen: boolean
  onClose: () => void
  nodeId: string
  internalNodes: Node[]
  internalEdges: Edge[]
  templateName: string
  platform: Platform
  aiMetadata?: TemplateAIMetadata
  onSave: (nodeId: string, nodes: Node[], edges: Edge[], aiMetadata?: TemplateAIMetadata) => void
}

function TemplateEditorInner({
  nodeId,
  internalNodes: initialNodes,
  internalEdges: initialEdges,
  templateName,
  platform,
  aiMetadata: initialAIMetadata,
  onSave,
  onClose,
}: Omit<TemplateEditorModalProps, "isOpen">) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const { screenToFlowPosition } = useReactFlow()

  // AI Settings state
  const [showAISettings, setShowAISettings] = useState(false)
  const [aiDescription, setAiDescription] = useState(initialAIMetadata?.description || "")
  const [aiWhenToUse, setAiWhenToUse] = useState(initialAIMetadata?.whenToUse || "")
  const [aiSelectionRule, setAiSelectionRule] = useState(initialAIMetadata?.selectionRule || "")

  // Reset when reopened with different data
  useEffect(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
    setAiDescription(initialAIMetadata?.description || "")
    setAiWhenToUse(initialAIMetadata?.whenToUse || "")
    setAiSelectionRule(initialAIMetadata?.selectionRule || "")
  }, [nodeId, initialNodes, initialEdges, initialAIMetadata])

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return
      const existingConnection = edges.find(
        (e) => e.source === params.source && e.sourceHandle === params.sourceHandle
      )
      if (existingConnection) return

      setEdges((eds) =>
        addEdge(
          { ...params, type: "default", style: DEFAULT_EDGE_STYLE },
          eds
        )
      )
    },
    [edges, setEdges]
  )

  const deleteNode = useCallback(
    (id: string) => {
      // Prevent deleting the Start node
      const node = nodes.find((n) => n.id === id)
      if (node?.type === "start") return
      setNodes((nds) => nds.filter((n) => n.id !== id))
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id))
    },
    [nodes, setNodes, setEdges]
  )

  const updateNodeData = useCallback(
    (nodeId: string, updates: any) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, ...updates } } : n
        )
      )
    },
    [setNodes]
  )

  const addButtonToNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== nodeId) return n
          const data = n.data as any
          if (data.buttons) {
            return {
              ...n,
              data: {
                ...data,
                buttons: [
                  ...data.buttons,
                  { text: `Option ${data.buttons.length + 1}`, id: `btn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
                ],
              },
            }
          }
          if (data.options) {
            return {
              ...n,
              data: {
                ...data,
                options: [
                  ...data.options,
                  { text: `Option ${data.options.length + 1}`, id: `opt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
                ],
              },
            }
          }
          return n
        })
      )
    },
    [setNodes]
  )

  const handleSave = useCallback(() => {
    // Strip callback functions from node data before saving
    const cleanNodes = nodes.map((n) => {
      const { onNodeUpdate, onAddButton, onAddOption, onAddConnection, onDelete, onConvert, flowVariables, id: dataId, ...cleanData } = n.data as any
      return { ...n, data: cleanData }
    })
    // Build AI metadata if any fields are filled
    const aiMetadata: TemplateAIMetadata | undefined =
      (aiDescription.trim() || aiWhenToUse.trim() || aiSelectionRule.trim())
        ? {
            description: aiDescription.trim(),
            whenToUse: aiWhenToUse.trim(),
            ...(aiSelectionRule.trim() ? { selectionRule: aiSelectionRule.trim() } : {}),
          }
        : undefined
    onSave(nodeId, cleanNodes, edges, aiMetadata)
    toast.success("Template saved")
    onClose()
  }, [nodes, edges, nodeId, onSave, onClose, aiDescription, aiWhenToUse, aiSelectionRule])

  // Quick add node toolbar
  const addNodeToCanvas = useCallback(
    (nodeType: string) => {
      const position = { x: 200 + Math.random() * 200, y: 100 + Math.random() * 200 }
      const newNodeId = `${nodeType}-${Date.now()}`
      try {
        const newNode = createNode(nodeType, platform, position, newNodeId)
        setNodes((nds) => [...nds, newNode])
      } catch (err) {
        console.error("Failed to add node:", err)
      }
    },
    [platform, setNodes]
  )

  // Get available node types for the mini toolbar (interaction nodes only for templates)
  const interactionNodes = getNodesByCategory("interaction", platform)
  const logicNodes = getNodesByCategory("logic", platform)
  const actionNodes = getNodesByCategory("action", platform)
  const availableNodes = [...interactionNodes, ...logicNodes, ...actionNodes]

  // Inject callbacks for rendering
  const processedNodes = nodes
    .filter((node) => node && node.id && node.type && node.position && node.data)
    .map((node) =>
      injectNodeCallbacks(
        node,
        {
          updateNodeData,
          addButtonToNode,
          addConnectedNode: () => {},
          deleteNode,
          convertNode: () => {},
        },
        undefined,
        nodes
      )
    )

  return (
    <div className="flex flex-col h-full">
      {/* Mini toolbar for adding nodes */}
      <div className="flex items-center gap-2 p-2 border-b border-border bg-muted/30 overflow-x-auto">
        <span className="text-xs text-muted-foreground shrink-0">Add node:</span>
        {availableNodes.slice(0, 8).map((template) => {
          const Icon = template.icon
          return (
            <Button
              key={template.type}
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1 shrink-0"
              onClick={() => addNodeToCanvas(template.type)}
            >
              <Icon className="w-3 h-3" />
              {template.label}
            </Button>
          )
        })}
      </div>

      {/* AI Settings collapsible panel */}
      <div className="border-b border-border">
        <button
          onClick={() => setShowAISettings(!showAISettings)}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors cursor-pointer"
        >
          <Bot className="w-3.5 h-3.5" />
          AI Settings
          {showAISettings ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
        </button>
        {showAISettings && (
          <div className="px-3 pb-3 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Textarea
                value={aiDescription}
                onChange={(e) => setAiDescription(e.target.value)}
                placeholder="What does this template do? (shown to AI)"
                rows={2}
                className="resize-none text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">When to Use</Label>
              <Textarea
                value={aiWhenToUse}
                onChange={(e) => setAiWhenToUse(e.target.value)}
                placeholder="When should AI use this template?"
                rows={2}
                className="resize-none text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Selection Rule <span className="text-muted-foreground">(optional, advanced)</span></Label>
              <Input
                value={aiSelectionRule}
                onChange={(e) => setAiSelectionRule(e.target.value)}
                placeholder="Short imperative hint for AI, e.g. 'Always use for name collection'"
                className="text-xs h-8"
              />
            </div>
          </div>
        )}
      </div>

      {/* ReactFlow canvas */}
      <div className="flex-1">
        <ReactFlow
          nodes={processedNodes}
          edges={edges.map((edge) => ({
            ...edge,
            style: { ...edge.style, ...DEFAULT_EDGE_STYLE },
          }))}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          className="bg-background"
          connectionLineStyle={DEFAULT_EDGE_STYLE}
          defaultEdgeOptions={{
            type: "default",
            style: DEFAULT_EDGE_STYLE,
          }}
          deleteKeyCode={["Backspace", "Delete"]}
          onBeforeDelete={async ({ nodes: toDelete }) => ({
            nodes: toDelete.filter((n) => n.type !== "start"),
            edges: [],
          })}
        >
          <Controls className="bg-card border-border shadow-lg" />
          <MiniMap className="bg-card border-border shadow-lg" />
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(var(--border))" />
        </ReactFlow>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between p-3 border-t border-border bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Layers className="w-4 h-4" />
          {nodes.length} node{nodes.length !== 1 ? "s" : ""}, {edges.length} edge{edges.length !== 1 ? "s" : ""}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            <X className="w-4 h-4 mr-1" />
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>
            <Save className="w-4 h-4 mr-1" />
            Save Template
          </Button>
        </div>
      </div>
    </div>
  )
}

export function TemplateEditorModal({
  isOpen,
  onClose,
  nodeId,
  internalNodes,
  internalEdges,
  templateName,
  platform,
  aiMetadata,
  onSave,
}: TemplateEditorModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[90vw] w-[90vw] h-[85vh] max-h-[85vh] p-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <div className="w-6 h-6 bg-primary rounded-md flex items-center justify-center">
              <Layers className="w-4 h-4 text-white" />
            </div>
            Edit Template: {templateName}
            <Badge variant="secondary" className="text-xs">Flow Template</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {isOpen && (
            <ReactFlowProvider>
              <TemplateEditorInner
                nodeId={nodeId}
                internalNodes={internalNodes}
                internalEdges={internalEdges}
                templateName={templateName}
                platform={platform}
                aiMetadata={aiMetadata}
                onSave={onSave}
                onClose={onClose}
              />
            </ReactFlowProvider>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
