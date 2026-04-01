"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
  Panel,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import type { Platform } from "@/types"
import { NodeSidebar } from "@/components/node-sidebar"
import { AISuggestionsPanel, AIAssistant } from "@/components/ai"
import { ConnectionMenu } from "@/components/connection-menu"
import { Toaster } from "@/components/ui/sonner"
import { useParams } from "next/navigation"
import { toast } from "sonner"

import { nodeTypes } from "@/constants/node-types-registry"
import { injectNodeCallbacks } from "@/utils/node-data-injection"
import { useTemplatePersistence } from "@/hooks/use-template-persistence"
import { useNodeOperations } from "@/hooks/use-node-operations"
import { useClipboard } from "@/hooks/use-clipboard"
import { useFlowAI } from "@/hooks/use-flow-ai"
import { useFlowInteractions } from "@/hooks/use-flow-interactions"
import { TemplateEditorModal } from "@/components/template-editor-modal"
import { TemplateHeader } from "@/components/flow/template-header"
import { FlowGraphPanel } from "@/components/flow/flow-graph-panel"
import { PaneContextMenu } from "@/components/flow/pane-context-menu"
import { NodeContextMenu } from "@/components/flow/node-context-menu"
import { PropertiesPanelWrapper } from "@/components/flow/properties-panel-wrapper"
import { DEFAULT_EDGE_STYLE } from "@/constants/edge-styles"

// No-ops for version-related params (templates don't have versioning)
const noop = () => {}

function TemplateEditorInner() {
  const params = useParams()
  const templateId = params?.id as string

  // Core ReactFlow state
  const [nodes, setNodes, onNodesChangeOriginal] = useNodesState([] as Node[])
  const [edges, setEdges, onEdgesChangeOriginal] = useEdgesState([] as Edge[])
  const [platform, setPlatform] = useState<Platform>("whatsapp")

  // Panel state
  const [isFlowGraphPanelOpen, setIsFlowGraphPanelOpen] = useState(false)
  const [templateEditorNodeId, setTemplateEditorNodeId] = useState<string | null>(null)

  const flowElementRef = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()

  // --- Hook Instantiation ---

  const persistence = useTemplatePersistence({
    templateId,
    nodes,
    edges,
    platform,
    setNodes,
    setEdges,
    setPlatform,
  })

  // Templates are always in edit mode
  const isEditMode = true
  const autoEnterEditMode = noop as any
  const updateDraftChanges = noop

  const nodeOps = useNodeOperations({
    flowId: templateId,
    nodes,
    edges,
    platform,
    setNodes,
    setEdges,
    setPlatform,
    onNodesChangeOriginal,
    onEdgesChangeOriginal,
    isEditMode,
    autoEnterEditMode,
    updateDraftChanges,
    currentFlow: persistence.currentFlow,
    setCurrentFlow: persistence.setCurrentFlow,
    flowLoaded: persistence.flowLoaded,
    setFlowLoaded: persistence.setFlowLoaded,
  })

  const clipboard = useClipboard({
    nodes,
    edges,
    platform,
    setNodes,
    setEdges,
    setPlatform,
    deleteNode: nodeOps.deleteNode,
    setSelectedNode: nodeOps.setSelectedNode,
    setIsPropertiesPanelOpen: nodeOps.setIsPropertiesPanelOpen,
    setNodeToFocus: nodeOps.setNodeToFocus,
    isEditMode,
    autoEnterEditMode,
    updateDraftChanges,
  })

  const flowAI = useFlowAI({
    flowId: templateId,
    nodes,
    edges,
    platform,
    setNodes,
    setEdges,
    setPlatform,
    selectedNode: nodeOps.selectedNode,
    deleteNode: nodeOps.deleteNode,
    setNodeToFocus: nodeOps.setNodeToFocus,
    isEditMode,
    autoEnterEditMode,
    updateDraftChanges,
    currentFlow: persistence.currentFlow,
    setCurrentFlow: persistence.setCurrentFlow,
  })

  const interactions = useFlowInteractions({
    nodes,
    edges,
    platform,
    setNodes,
    setEdges,
    setPlatform,
    selectedNode: nodeOps.selectedNode,
    setSelectedNode: nodeOps.setSelectedNode,
    selectedNodes: clipboard.selectedNodes,
    setSelectedNodes: clipboard.setSelectedNodes,
    setIsPropertiesPanelOpen: nodeOps.setIsPropertiesPanelOpen,
    setNodeToFocus: nodeOps.setNodeToFocus,
    deleteNode: nodeOps.deleteNode,
    updateNodeData: nodeOps.updateNodeData,
    convertNode: nodeOps.convertNode,
    isEditMode,
    autoEnterEditMode,
    updateDraftChanges,
    copyNodes: clipboard.copyNodes,
    pasteNodes: clipboard.pasteNodes,
    selectAllNodes: clipboard.selectAllNodes,
  })

  // Wire template editor double-click handler (for nested templates)
  useEffect(() => {
    (window as any).__openTemplateEditor = (nodeId: string) => {
      setTemplateEditorNodeId(nodeId)
    }
    return () => {
      delete (window as any).__openTemplateEditor
    }
  }, [])

  // Template editor save handler
  const handleTemplateEditorSave = useCallback(
    (nodeId: string, internalNodes: Node[], internalEdges: Edge[], aiMetadata?: import("@/types").TemplateAIMetadata) => {
      nodeOps.updateNodeData(nodeId, {
        internalNodes,
        internalEdges,
        nodeCount: internalNodes.length,
        ...(aiMetadata ? { aiMetadata } : {}),
      })
      const templateNode = nodes.find((n) => n.id === nodeId)
      const sourceTemplateId = (templateNode?.data as any)?.sourceTemplateId
      if (sourceTemplateId && aiMetadata) {
        import("@/utils/flow-storage").then(({ updateTemplateMetadata }) => {
          updateTemplateMetadata(sourceTemplateId, aiMetadata)
        })
      }
    },
    [nodeOps, nodes]
  )

  const templateEditorNode = templateEditorNodeId
    ? nodes.find((n) => n.id === templateEditorNodeId)
    : null

  // --- JSX ---

  return (
    <div className="h-screen flex bg-background">
      <NodeSidebar onNodeDragStart={interactions.onNodeDragStart} platform={platform} />

      <div className="flex-1 relative">
        <TemplateHeader
          currentFlow={persistence.currentFlow}
          isEditingFlowName={persistence.isEditingFlowName}
          editingFlowNameValue={persistence.editingFlowNameValue}
          setEditingFlowNameValue={persistence.setEditingFlowNameValue}
          setIsEditingFlowName={persistence.setIsEditingFlowName}
          handleFlowNameBlur={persistence.handleFlowNameBlur}
          platform={platform}
          nodes={nodes}
          edges={edges}
          handleBackClick={persistence.handleBackClick}
          isFlowGraphPanelOpen={isFlowGraphPanelOpen}
          onToggleFlowGraph={() => setIsFlowGraphPanelOpen((prev) => !prev)}
          aiMetadata={persistence.currentFlow?.aiMetadata}
          onSaveAIMetadata={persistence.saveAIMetadata}
          description={persistence.currentFlow?.description}
          onSaveDescription={persistence.saveDescription}
        />

        {/* Template Editor Modal (for nested templates) */}
        <TemplateEditorModal
          isOpen={!!templateEditorNodeId && !!templateEditorNode}
          onClose={() => setTemplateEditorNodeId(null)}
          nodeId={templateEditorNodeId || ""}
          internalNodes={(templateEditorNode?.data as any)?.internalNodes || []}
          internalEdges={(templateEditorNode?.data as any)?.internalEdges || []}
          templateName={(templateEditorNode?.data as any)?.templateName || "Template"}
          platform={platform}
          aiMetadata={(templateEditorNode?.data as any)?.aiMetadata}
          onSave={handleTemplateEditorSave}
        />

        <div className="h-full flex flex-col pt-20">
          <div className="flex-1 relative">
            <ReactFlow
              ref={flowElementRef}
              nodes={nodes
                .filter((node) => node && node.id && node.type && node.position && node.data)
                .map((node) =>
                  injectNodeCallbacks(node, {
                    updateNodeData: nodeOps.updateNodeData,
                    addButtonToNode: nodeOps.addButtonToNode,
                    addConnectedNode: nodeOps.addConnectedNode,
                    deleteNode: nodeOps.deleteNode,
                    convertNode: nodeOps.convertNode,
                  }, {
                    flowId: templateId,
                    currentFlow: persistence.currentFlow,
                    setCurrentFlow: persistence.setCurrentFlow,
                    saveFlowFields: persistence.saveFlowFields,
                  }, nodes)
                )}
              edges={edges
                .filter((edge) => edge && edge.id && edge.source && edge.target)
                .map((edge) => ({
                  ...edge,
                  style: { ...edge.style, ...DEFAULT_EDGE_STYLE },
                  zIndex: 1,
                }))}
              onNodesChange={nodeOps.onNodesChange}
              onEdgesChange={nodeOps.onEdgesChange}
              onConnect={interactions.onConnect}
              onNodeClick={interactions.onNodeClick}
              onNodeDoubleClick={interactions.onNodeDoubleClick}
              onNodeContextMenu={interactions.onNodeContextMenu}
              onPaneClick={interactions.onPaneClick}
              onPaneContextMenu={interactions.onPaneContextMenu}
              onDragOver={interactions.onDragOver}
              onDrop={interactions.onDrop}
              onSelectionChange={interactions.onSelectionChange}
              nodeTypes={nodeTypes}
              fitView
              className="bg-background"
              connectionLineStyle={DEFAULT_EDGE_STYLE}
              defaultEdgeOptions={{
                type: "default",
                style: DEFAULT_EDGE_STYLE,
              }}
              onError={(error) => {
                console.error("[Template] React Flow error:", error)
              }}
              onConnectStart={interactions.onConnectStart}
              onConnectEnd={interactions.onConnectEnd}
              elevateEdgesOnSelect
              deleteKeyCode={["Backspace", "Delete"]}
              multiSelectionKeyCode={["Control", "Meta"]}
            >
              <Controls className="bg-card border-border shadow-lg" />
              <MiniMap
                className="bg-card border-border shadow-lg"
                nodeColor={(node) => {
                  switch (node.type) {
                    case "start":
                      return "var(--chart-2)"
                    case "question":
                      return "var(--primary)"
                    case "quickReply":
                      return "var(--chart-1)"
                    case "interactiveList":
                    case "whatsappInteractiveList":
                      return "var(--chart-4)"
                    case "comment":
                      return "#fbbf24"
                    default:
                      return "hsl(var(--muted))"
                  }
                }}
              />
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(var(--border))" />

              <Panel position="bottom-center" className="mb-4">
                <AIAssistant
                  platform={platform}
                  flowContext={persistence.currentFlow?.description}
                  existingFlow={{ nodes, edges }}
                  selectedNode={nodeOps.selectedNode}
                  onApplyFlow={flowAI.handleApplyFlow}
                  onUpdateFlow={flowAI.handleUpdateFlow}
                />
              </Panel>
            </ReactFlow>
          </div>
          {isFlowGraphPanelOpen && (
            <FlowGraphPanel
              nodes={nodes}
              edges={edges}
              isOpen={isFlowGraphPanelOpen}
              onClose={() => setIsFlowGraphPanelOpen(false)}
            />
          )}
        </div>

        <PaneContextMenu
          contextMenu={interactions.contextMenu}
          platform={platform}
          selectedNodes={clipboard.selectedNodes}
          clipboard={clipboard.clipboard}
          closeContextMenu={interactions.closeContextMenu}
          addNodeAtPosition={interactions.addNodeAtPosition}
          copyNodes={clipboard.copyNodes}
          pasteNodes={clipboard.pasteNodes}
          selectAllNodes={clipboard.selectAllNodes}
          screenToFlowPosition={screenToFlowPosition}
        />

        <NodeContextMenu
          nodeContextMenu={interactions.nodeContextMenu}
          nodes={nodes}
          clipboard={clipboard.clipboard}
          closeNodeContextMenu={interactions.closeNodeContextMenu}
          setSelectedNodes={clipboard.setSelectedNodes}
          copyNodes={clipboard.copyNodes}
          pasteNodes={clipboard.pasteNodes}
          deleteNode={nodeOps.deleteNode}
          screenToFlowPosition={screenToFlowPosition}
        />

        {interactions.connectionMenu.isOpen && (
          <ConnectionMenu
            isOpen={interactions.connectionMenu.isOpen}
            position={{ x: interactions.connectionMenu.x, y: interactions.connectionMenu.y }}
            onClose={interactions.closeConnectionMenu}
            onSelectNodeType={interactions.handleNodeTypeSelection}
            platform={platform}
          />
        )}
      </div>

      {/* AI Suggestions Panel */}
      <div
        className={`transition-all duration-300 ease-in-out ${
          flowAI.isAISuggestionsPanelOpen ? "w-80" : "w-0"
        } overflow-hidden bg-background border-r border-border`}
      >
        <AISuggestionsPanel
          selectedNode={nodeOps.selectedNode}
          suggestions={flowAI.suggestions}
          loading={flowAI.suggestionsLoading}
          platform={platform}
          isOpen={flowAI.isAISuggestionsPanelOpen}
          onClose={() => flowAI.setIsAISuggestionsPanelOpen(false)}
          onAccept={flowAI.onAcceptAISuggestion}
          onReject={(suggestion) => {
            flowAI.clearSuggestions()
            toast.info(`Dismissed ${suggestion.label} suggestion`)
          }}
        />
      </div>

      <PropertiesPanelWrapper
        selectedNode={nodeOps.selectedNode}
        selectedNodes={clipboard.selectedNodes}
        isOpen={nodeOps.isPropertiesPanelOpen}
        platform={platform}
        nodes={nodes}
        clipboard={clipboard.clipboard}
        onClose={() => nodeOps.setIsPropertiesPanelOpen(false)}
        onNodeUpdate={nodeOps.updateNodeData}
        onAddButton={nodeOps.addButtonToNode}
        onRemoveButton={nodeOps.removeButtonFromNode}
        copyNodes={clipboard.copyNodes}
        pasteNodes={clipboard.pasteNodes}
        selectAllNodes={clipboard.selectAllNodes}
      />

      <Toaster position="bottom-right" />
    </div>
  )
}

export default function TemplatePage() {
  return (
    <ReactFlowProvider>
      <TemplateEditorInner />
    </ReactFlowProvider>
  )
}
