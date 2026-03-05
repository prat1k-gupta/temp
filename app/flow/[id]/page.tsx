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
import { ExportModal } from "@/components/export-modal"
import { ScreenshotModal } from "@/components/screenshot-modal"
import { VersionHistoryModal } from "@/components/version-history-modal"
import { ChangesModal } from "@/components/changes-modal"
import { FlowSetupModal } from "@/components/flow-setup-modal"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Loader2, Sparkles } from "lucide-react"
import { Toaster } from "@/components/ui/sonner"
import { useSearchParams, useParams, useRouter } from "next/navigation"
import { toast } from "sonner"

// Refactored imports
import { nodeTypes, initialNodes, initialEdges } from "@/constants/node-types-registry"
import { injectNodeCallbacks } from "@/utils/node-data-injection"
import { useVersionManager } from "@/hooks/use-version-manager"
import { useFlowPersistence } from "@/hooks/use-flow-persistence"
import { useNodeOperations } from "@/hooks/use-node-operations"
import { useClipboard } from "@/hooks/use-clipboard"
import { useFlowAI } from "@/hooks/use-flow-ai"
import { useFlowInteractions } from "@/hooks/use-flow-interactions"
import { FlowHeader } from "@/components/flow/flow-header"
import { PaneContextMenu } from "@/components/flow/pane-context-menu"
import { NodeContextMenu } from "@/components/flow/node-context-menu"
import { PropertiesPanelWrapper } from "@/components/flow/properties-panel-wrapper"
import { changeTracker } from "@/utils/change-tracker"
import { publishVersion } from "@/utils/version-storage"

function MagicFlowInner() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const flowId = params?.id as string
  const isNewFlow = flowId === "new"
  const isSetupMode = searchParams?.get("setup") === "true" || isNewFlow
  const loadFromDb = searchParams?.get("loadFrom") === "db"

  // Core ReactFlow state
  const [nodes, setNodes, onNodesChangeOriginal] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChangeOriginal] = useEdgesState(initialEdges)
  const [platform, setPlatform] = useState<Platform>("web")

  // Modal open/close booleans
  const [showSetupModal, setShowSetupModal] = useState(isSetupMode)
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [isVersionHistoryModalOpen, setIsVersionHistoryModalOpen] = useState(false)
  const [isScreenshotModalOpen, setIsScreenshotModalOpen] = useState(false)
  const [isChangesModalOpen, setIsChangesModalOpen] = useState(false)

  // Version loading state
  const [draftStateLoaded, setDraftStateLoaded] = useState(false)
  const [isLoadingVersion, setIsLoadingVersion] = useState(false)
  const [isAutoEnteringEditMode, setIsAutoEnteringEditMode] = useState(false)

  const flowElementRef = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()

  // --- Hook Instantiation ---

  const versionManager = useVersionManager(flowId)
  const {
    editModeState,
    toggleEditMode,
    toggleViewDraft,
    autoEnterEditMode,
    createNewVersion,
    createAndPublishVersion,
    publishCurrentVersion,
    loadVersion,
    getAllVersions,
    resetToPublished,
    updateDraftChanges,
    hasActualChanges,
    getChangesSummary,
    getChangesCount,
    loadDraftState,
    saveCurrentStateAsDraft,
    isEditMode,
    currentVersion,
    draftChanges,
  } = versionManager

  const persistence = useFlowPersistence({
    flowId,
    isNewFlow,
    isSetupMode,
    loadFromDb,
    nodes,
    edges,
    platform,
    setNodes,
    setEdges,
    setPlatform,
  })

  const nodeOps = useNodeOperations({
    flowId,
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
    flowId,
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

  // --- Callbacks that stay in page.tsx ---

  const handleModeToggle = useCallback(() => {
    const publishedVersion = getAllVersions().find((v) => v.isPublished)
    if (publishedVersion) {
      toggleViewDraft(setNodes, setEdges, setPlatform)
    } else {
      toggleEditMode(setNodes, setEdges, setPlatform)
    }
    setDraftStateLoaded(false)
  }, [getAllVersions, toggleViewDraft, toggleEditMode, setNodes, setEdges, setPlatform])

  const importFlow = useCallback(
    (importedNodes: Node[], importedEdges: Edge[], importedPlatform: Platform) => {
      if (!isEditMode) {
        autoEnterEditMode(setNodes, setEdges, setPlatform, nodes, edges, platform)
      }
      changeTracker.trackFlowImport(importedNodes, importedEdges, importedPlatform)
      updateDraftChanges()

      setNodes([])
      setEdges([])
      nodeOps.setSelectedNode(null)
      clipboard.setSelectedNodes([])
      nodeOps.setIsPropertiesPanelOpen(false)

      setNodes(importedNodes)
      setEdges(importedEdges)
      setPlatform(importedPlatform)

      toast.success(`Flow imported successfully! ${importedNodes.length} nodes, ${importedEdges.length} edges`)
    },
    [setNodes, setEdges, setPlatform, isEditMode, updateDraftChanges, autoEnterEditMode, nodes, edges, platform, nodeOps, clipboard]
  )

  // --- Version initialization effects ---

  useEffect(() => {
    if (isAutoEnteringEditMode && editModeState.isEditMode) {
      setIsAutoEnteringEditMode(false)
    }
  }, [editModeState.isEditMode, isAutoEnteringEditMode])

  // Load published version on startup or draft state
  useEffect(() => {
    if (editModeState.isEditMode !== undefined) {
      if (!isEditMode && currentVersion) {
        const formattedNodes = currentVersion.nodes.map((node) => ({
          ...node,
          data: node.data || {},
        }))
        const formattedEdges = currentVersion.edges.map((edge) => ({
          ...edge,
          style: edge.style || { stroke: "#6366f1", strokeWidth: 2 },
        }))
        setNodes(formattedNodes)
        setEdges(formattedEdges)
        setPlatform(currentVersion.platform)
      } else if (isEditMode && !isAutoEnteringEditMode) {
        const draftLoaded = loadDraftState(setNodes, setEdges, setPlatform)
        if (!draftLoaded && currentVersion) {
          const formattedNodes = currentVersion.nodes.map((node) => ({
            ...node,
            data: node.data || {},
          }))
          const formattedEdges = currentVersion.edges.map((edge) => ({
            ...edge,
            style: edge.style || { stroke: "#6366f1", strokeWidth: 2 },
          }))
          setNodes(formattedNodes)
          setEdges(formattedEdges)
          setPlatform(currentVersion.platform)
        } else if (draftLoaded) {
          setDraftStateLoaded(true)
        }
      }
    }
  }, [editModeState.isEditMode, isEditMode, currentVersion, loadDraftState])

  // Load version when currentVersion changes
  useEffect(() => {
    if (currentVersion && (!isEditMode || isLoadingVersion)) {
      const formattedNodes = currentVersion.nodes.map((node) => ({
        ...node,
        data: node.data || {},
      }))
      const formattedEdges = currentVersion.edges.map((edge) => ({
        ...edge,
        style: edge.style || { stroke: "#6366f1", strokeWidth: 2 },
      }))
      setNodes(formattedNodes)
      setEdges(formattedEdges)
      setPlatform(currentVersion.platform)
      setDraftStateLoaded(false)
      setIsLoadingVersion(false)
    }
  }, [currentVersion, isEditMode, draftStateLoaded, isLoadingVersion])

  // Save draft state
  useEffect(() => {
    if (isEditMode && (nodes.length > 0 || edges.length > 0)) {
      const timeoutId = setTimeout(() => {
        saveCurrentStateAsDraft(nodes, edges, platform)
      }, 100)
      return () => clearTimeout(timeoutId)
    }
  }, [nodes, edges, platform, isEditMode, saveCurrentStateAsDraft])

  // Backfill waPhoneNumber for flows published before account selector was added
  useEffect(() => {
    const flow = persistence.currentFlow
    if (flow && flow.platform === "whatsapp" && flow.publishedFlowId && !flow.waPhoneNumber) {
      // Fetch accounts, find default, then get phone number via test-connection
      fetch("/api/accounts")
        .then((res) => res.json())
        .then(async (data) => {
          const list = Array.isArray(data) ? data : data.accounts || []
          const acc = flow.waAccountId
            ? list.find((a: any) => a.id === flow.waAccountId)
            : list.find((a: any) => a.is_default_outgoing) || list[0]
          if (!acc) return
          const tcRes = await fetch(`/api/accounts/${acc.id}/test`, { method: "POST" })
          if (!tcRes.ok) return
          const tcData = await tcRes.json()
          if (tcData.display_phone_number) {
            const phone = tcData.display_phone_number.replace(/[^0-9]/g, "")
            persistence.setCurrentFlow((prev) => prev ? { ...prev, waPhoneNumber: phone, waAccountId: acc.id } : null)
            persistence.saveFlowFields({ waPhoneNumber: phone, waAccountId: acc.id })
          }
        })
        .catch(() => {})
    }
  }, [persistence.currentFlow?.publishedFlowId, persistence.currentFlow?.waPhoneNumber])

  // --- JSX ---

  return (
    <div className="h-screen flex bg-background">
      <FlowSetupModal
        open={showSetupModal}
        onClose={() => {
          setShowSetupModal(false)
          router.push("/flows")
        }}
        onComplete={async (data) => {
          await persistence.handleFlowSetupComplete(data)
          setShowSetupModal(false)
        }}
      />

      {persistence.isLoadingFromDb && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <Loader2 className="w-12 h-12 animate-spin text-[#2872F4]" />
              <Sparkles className="absolute -top-1 -right-1 w-5 h-5 text-[#052762] animate-pulse" />
            </div>
            <div className="flex flex-col items-center gap-2">
              <h2 className="text-xl font-semibold bg-gradient-to-r from-[#052762] to-[#2872F4] bg-clip-text text-transparent">
                Getting your flow...
              </h2>
              <p className="text-sm text-muted-foreground">
                Freestand AI is loading your conversation flow
              </p>
            </div>
          </div>
        </div>
      )}

      {!persistence.isLoadingFromDb && (
        <NodeSidebar onNodeDragStart={interactions.onNodeDragStart} platform={platform} />
      )}

      <div className="flex-1 relative">
        <FlowHeader
          currentFlow={persistence.currentFlow}
          isEditingFlowName={persistence.isEditingFlowName}
          editingFlowNameValue={persistence.editingFlowNameValue}
          setEditingFlowNameValue={persistence.setEditingFlowNameValue}
          setIsEditingFlowName={persistence.setIsEditingFlowName}
          handleFlowNameBlur={persistence.handleFlowNameBlur}
          currentVersion={currentVersion}
          isEditMode={isEditMode}
          editModeState={editModeState}
          draftChanges={draftChanges}
          platform={platform}
          nodes={nodes}
          edges={edges}
          loadFromDb={loadFromDb}
          flowId={flowId}
          handleBackClick={persistence.handleBackClick}
          handleModeToggle={handleModeToggle}
          handlePlatformChange={nodeOps.handlePlatformChange}
          hasActualChanges={hasActualChanges}
          getChangesCount={getChangesCount}
          getChangesSummary={getChangesSummary}
          getAllVersions={getAllVersions}
          resetToPublished={resetToPublished}
          setNodes={setNodes}
          setEdges={setEdges}
          setPlatform={setPlatform}
          setSelectedNode={nodeOps.setSelectedNode}
          setSelectedNodes={clipboard.setSelectedNodes}
          setIsPropertiesPanelOpen={nodeOps.setIsPropertiesPanelOpen}
          setIsChangesModalOpen={setIsChangesModalOpen}
          setIsExportModalOpen={setIsExportModalOpen}
          setIsVersionHistoryModalOpen={setIsVersionHistoryModalOpen}
          setIsScreenshotModalOpen={setIsScreenshotModalOpen}
          setShowDeleteDialog={persistence.setShowDeleteDialog}
          flowName={persistence.currentFlow?.name}
          flowDescription={persistence.currentFlow?.description}
          triggerIds={persistence.currentFlow?.triggerIds}
          triggerKeywords={
            (() => {
              const nodeKw = nodes.find(n => n.type === "start")?.data?.triggerKeywords as string[] | undefined
              return nodeKw?.length ? nodeKw : persistence.currentFlow?.triggerKeywords
            })()
          }
          publishedFlowId={persistence.currentFlow?.publishedFlowId}
          waAccountId={persistence.currentFlow?.waAccountId}
          waPhoneNumber={persistence.currentFlow?.waPhoneNumber}
          onPublished={(flowId, waPhoneNumber) => {
            persistence.setCurrentFlow((prev) =>
              prev ? { ...prev, publishedFlowId: flowId, ...(waPhoneNumber ? { waPhoneNumber } : {}) } : null
            )
            persistence.saveFlowFields({ publishedFlowId: flowId, ...(waPhoneNumber ? { waPhoneNumber } : {}) })
          }}
          onCreateVersion={async (name, description) => {
            setIsLoadingVersion(true)
            const published = createAndPublishVersion(nodes, edges, platform, name, description)
            if (published && loadFromDb && persistence.currentFlow) {
              try {
                const response = await fetch(`/api/flows/${flowId}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    nodes, edges, platform,
                    name: persistence.currentFlow.name,
                    description: persistence.currentFlow.description,
                    triggerId: persistence.currentFlow.triggerId,
                    triggerIds: persistence.currentFlow.triggerIds,
                  }),
                })
                if (response.ok) {
                  const updatedFlow = await response.json()
                  persistence.setCurrentFlow(updatedFlow)
                }
              } catch (error) {
                console.error("[App] Error saving flow to database after publishing:", error)
              }
            }
          }}
          onPublishVersion={async (_versionId, versionName, description) => {
            setIsLoadingVersion(true)
            const published = publishCurrentVersion(nodes, edges, platform, versionName, description)
            if (published && loadFromDb && persistence.currentFlow) {
              try {
                const response = await fetch(`/api/flows/${flowId}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    nodes, edges, platform,
                    name: persistence.currentFlow.name,
                    description: persistence.currentFlow.description,
                    triggerId: persistence.currentFlow.triggerId,
                    triggerIds: persistence.currentFlow.triggerIds,
                  }),
                })
                if (response.ok) {
                  const updatedFlow = await response.json()
                  persistence.setCurrentFlow(updatedFlow)
                }
              } catch (error) {
                console.error("[App] Error saving flow to database after publishing:", error)
              }
            }
          }}
        />

        {/* Modals */}
        <ExportModal
          flowData={{
            nodes: nodes.map(({ data, ...node }) => ({ ...node, data })),
            edges: edges.map(({ style, ...edge }) => edge),
            platform,
            timestamp: new Date().toISOString(),
          }}
          onImportFlow={importFlow}
          open={isExportModalOpen}
          onOpenChange={setIsExportModalOpen}
          flowName={persistence.currentFlow?.name}
          flowDescription={persistence.currentFlow?.description}
          triggerIds={persistence.currentFlow?.triggerIds}
          triggerKeywords={
            (() => {
              const nodeKw = nodes.find(n => n.type === "start")?.data?.triggerKeywords as string[] | undefined
              return nodeKw?.length ? nodeKw : persistence.currentFlow?.triggerKeywords
            })()
          }
          publishedFlowId={persistence.currentFlow?.publishedFlowId}
          onPublished={(flowId) => {
            persistence.setCurrentFlow((prev) =>
              prev ? { ...prev, publishedFlowId: flowId } : null
            )
            persistence.saveFlowFields({ publishedFlowId: flowId })
          }}
          onDisconnect={() => {
            persistence.setCurrentFlow((prev) =>
              prev ? { ...prev, publishedFlowId: undefined } : null
            )
            persistence.saveFlowFields({ publishedFlowId: null })
          }}
        />

        <VersionHistoryModal
          versions={getAllVersions()}
          currentVersion={currentVersion}
          onLoadVersion={(version) => {
            setIsLoadingVersion(true)
            loadVersion(version, setNodes, setEdges, setPlatform)
            nodeOps.setSelectedNode(null)
            clipboard.setSelectedNodes([])
            nodeOps.setIsPropertiesPanelOpen(false)
          }}
          onDeleteVersion={(versionId) => {
            console.log("Delete version:", versionId)
          }}
          onCreateVersion={async (name, description) => {
            createNewVersion(nodes, edges, platform, name, description)
          }}
          onPublishVersion={async (versionId) => {
            publishVersion(flowId, versionId)
          }}
          isEditMode={isEditMode}
          hasChanges={hasActualChanges(nodes, edges, platform)}
          open={isVersionHistoryModalOpen}
          onOpenChange={setIsVersionHistoryModalOpen}
        />

        <ScreenshotModal
          flowElementRef={flowElementRef}
          open={isScreenshotModalOpen}
          onOpenChange={setIsScreenshotModalOpen}
        />

        <ChangesModal
          changes={draftChanges}
          open={isChangesModalOpen}
          onOpenChange={setIsChangesModalOpen}
        />

        <AlertDialog open={persistence.showDeleteDialog} onOpenChange={persistence.setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete this shared flow and all its data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={persistence.handleDeleteSharedFlow}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="h-full pt-20">
          <ReactFlow
            ref={flowElementRef}
            key={`flow-${currentVersion?.id || "default"}`}
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
                  flowId,
                  currentFlow: persistence.currentFlow,
                  setCurrentFlow: persistence.setCurrentFlow,
                  saveFlowFields: persistence.saveFlowFields,
                }, nodes)
              )}
            edges={edges
              .filter((edge) => edge && edge.id && edge.source && edge.target)
              .map((edge) => ({
                ...edge,
                style: { ...edge.style, strokeWidth: 2, stroke: "#6366f1" },
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
            connectionLineStyle={{ stroke: "#6366f1", strokeWidth: 2 }}
            defaultEdgeOptions={{
              type: "default",
              style: { stroke: "#6366f1", strokeWidth: 2 },
            }}
            onError={(error) => {
              console.error("[v0] React Flow error:", error)
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
                    return "hsl(var(--chart-2))"
                  case "question":
                    return "hsl(var(--accent))"
                  case "quickReply":
                    return "hsl(var(--chart-1))"
                  case "interactiveList":
                  case "whatsappInteractiveList":
                    return "hsl(var(--chart-4))"
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

export default function MagicFlow() {
  return (
    <ReactFlowProvider>
      <MagicFlowInner />
    </ReactFlowProvider>
  )
}
