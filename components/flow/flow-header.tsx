"use client"

import type { Node, Edge } from "@xyflow/react"
import type { Platform, FlowVersion, EditModeState, FlowChange } from "@/types"
import type { FlowData } from "@/utils/flow-storage"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { WhatsAppIcon, InstagramIcon, WebIcon } from "@/components/platform-icons"
import { getPlatformDisplayName } from "@/utils/platform-labels"
import { PlatformSelector } from "@/components/platform-selector"
import { ThemeToggle } from "@/components/theme-toggle"
import { PublishModal } from "@/components/publish-modal"
import {
  Upload,
  Clock,
  MoreHorizontal,
  RotateCcw,
  Edit3,
  ExternalLink,
  Pencil,
  Eye,
  ArrowLeft,
  History,
  Camera,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"

interface FlowHeaderProps {
  currentFlow: FlowData | null
  isEditingFlowName: boolean
  editingFlowNameValue: string
  setEditingFlowNameValue: (value: string) => void
  setIsEditingFlowName: (editing: boolean) => void
  handleFlowNameBlur: () => void
  currentVersion: FlowVersion | null
  isEditMode: boolean
  editModeState: EditModeState
  draftChanges: FlowChange[]
  platform: Platform
  nodes: Node[]
  edges: Edge[]
  loadFromDb: boolean
  flowId: string
  handleBackClick: () => void
  handleModeToggle: () => void
  handlePlatformChange: (platform: Platform) => void
  hasActualChanges: (nodes: Node[], edges: Edge[], platform: Platform) => boolean
  getChangesCount: () => number
  getChangesSummary: () => string
  getAllVersions: () => FlowVersion[]
  resetToPublished: (setNodes: any, setEdges: any, setPlatform: any) => void
  setNodes: any
  setEdges: any
  setPlatform: any
  setSelectedNode: (node: Node | null) => void
  setSelectedNodes: (nodes: Node[]) => void
  setIsPropertiesPanelOpen: (open: boolean) => void
  setIsChangesModalOpen: (open: boolean) => void
  setIsExportModalOpen: (open: boolean) => void
  setIsVersionHistoryModalOpen: (open: boolean) => void
  setIsScreenshotModalOpen: (open: boolean) => void
  setShowDeleteDialog: (show: boolean) => void
  onCreateVersion: (name: string, description?: string) => Promise<void>
  onPublishVersion: (versionId?: string, versionName?: string, description?: string) => Promise<void>
}

export function FlowHeader({
  currentFlow,
  isEditingFlowName,
  editingFlowNameValue,
  setEditingFlowNameValue,
  setIsEditingFlowName,
  handleFlowNameBlur,
  currentVersion,
  isEditMode,
  editModeState,
  draftChanges,
  platform,
  nodes,
  edges,
  loadFromDb,
  flowId,
  handleBackClick,
  handleModeToggle,
  handlePlatformChange,
  hasActualChanges,
  getChangesCount,
  getChangesSummary,
  getAllVersions,
  resetToPublished,
  setNodes,
  setEdges,
  setPlatform,
  setSelectedNode,
  setSelectedNodes,
  setIsPropertiesPanelOpen,
  setIsChangesModalOpen,
  setIsExportModalOpen,
  setIsVersionHistoryModalOpen,
  setIsScreenshotModalOpen,
  setShowDeleteDialog,
  onCreateVersion,
  onPublishVersion,
}: FlowHeaderProps) {
  return (
    <div className="absolute top-0 left-0 right-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border overflow-visible">
      <div className="flex items-center justify-between px-6 py-3 gap-2">
        {/* Left Section */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Button
            variant="default"
            size="sm"
            onClick={handleBackClick}
            className="shrink-0 h-8 w-8 p-0"
            title="Back to flows"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          {currentFlow && (
            <>
              {isEditingFlowName ? (
                <Input
                  value={editingFlowNameValue}
                  onChange={(e) => setEditingFlowNameValue(e.target.value)}
                  onBlur={handleFlowNameBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.currentTarget.blur()
                    }
                    if (e.key === "Escape") {
                      setEditingFlowNameValue(currentFlow.name)
                      setIsEditingFlowName(false)
                    }
                  }}
                  className="text-lg font-semibold h-8 px-2 min-w-[200px] max-w-[400px]"
                  autoFocus
                />
              ) : (
                <div
                  className="flex items-center gap-2 group cursor-pointer hover:bg-muted/50 px-2 py-1 rounded transition-colors"
                  onClick={() => {
                    setEditingFlowNameValue(currentFlow.name)
                    setIsEditingFlowName(true)
                  }}
                >
                  <h1 className="text-lg font-semibold text-foreground truncate">
                    {currentFlow.name}
                  </h1>
                  <Edit3 className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </div>
              )}
              {currentVersion && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
                  <span className="font-medium">{currentVersion.name}</span>
                  {currentVersion.isPublished && !isEditMode ? (
                    <>
                      <Badge variant="secondary" className="text-xs px-2 py-0.5">Published</Badge>
                      {currentVersion.previewUrl && (
                        <a
                          href={currentVersion.previewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded-md text-xs font-medium transition-colors cursor-pointer shadow-sm hover:shadow-md"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Preview
                        </a>
                      )}
                    </>
                  ) : (
                    <Badge variant="outline" className="text-xs px-2 py-0.5">Draft</Badge>
                  )}
                  {!isEditMode && !currentVersion.isPublished && (
                    <Badge variant="destructive" className="text-xs px-2 py-0.5">Previous</Badge>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Center Section */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-2 bg-muted rounded-md p-1">
            <button
              onClick={handleModeToggle}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer ${
                isEditMode
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Pencil className="w-4 h-4" />
              <span>Edit Mode</span>
            </button>
            <button
              onClick={handleModeToggle}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer ${
                !isEditMode
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Eye className="w-4 h-4" />
              <span>View Mode</span>
            </button>
          </div>
          <PublishModal
            changes={draftChanges}
            hasUnsavedChanges={editModeState.hasUnsavedChanges}
            onCreateVersion={onCreateVersion}
            onPublishVersion={onPublishVersion}
            currentVersion={currentVersion}
          >
            <Button
              variant="default"
              size="sm"
              disabled={(() => {
                const hasChanges = hasActualChanges(nodes, edges, platform)
                const changesCount = getChangesCount()
                return !isEditMode || !hasChanges || changesCount === 0
              })()}
              className="h-9 px-4 gap-2"
            >
              <Upload className="w-4 h-4" />
              Publish
            </Button>
          </PublishModal>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md border-2 transition-all cursor-pointer hover:shadow-md ${
              platform === "web"
                ? "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-950/50"
                : platform === "whatsapp"
                  ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-950/50"
                  : "bg-pink-50 dark:bg-pink-950/30 border-pink-200 dark:border-pink-800 hover:bg-pink-100 dark:hover:bg-pink-950/50"
            }`}
            onClick={() => {
              const platforms: Platform[] = ["web", "whatsapp", "instagram"]
              const currentIndex = platforms.indexOf(platform)
              const nextIndex = (currentIndex + 1) % platforms.length
              handlePlatformChange(platforms[nextIndex])
            }}
            title={`Click to switch platform. Current: ${getPlatformDisplayName(platform)}`}
          >
            {platform === "web" && <WebIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
            {platform === "whatsapp" && <WhatsAppIcon className="w-4 h-4 text-green-600 dark:text-green-400" />}
            {platform === "instagram" && <InstagramIcon className="w-4 h-4 text-pink-600 dark:text-pink-400" />}
            <span
              className={`text-sm font-semibold ${
                platform === "web"
                  ? "text-blue-700 dark:text-blue-300"
                  : platform === "whatsapp"
                    ? "text-green-700 dark:text-green-300"
                    : "text-pink-700 dark:text-pink-300"
              }`}
            >
              {getPlatformDisplayName(platform)}
            </span>
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-primary hover:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 transition-colors cursor-pointer"
              >
                <MoreHorizontal className="w-4 h-4" />
                <span className="sr-only">More options</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Flow Options</DropdownMenuLabel>
              <DropdownMenuSeparator />

              {isEditMode && hasActualChanges(nodes, edges, platform) && (
                <DropdownMenuItem onSelect={() => setIsChangesModalOpen(true)}>
                  <Clock className="w-4 h-4 mr-2" />
                  {getChangesSummary()}
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onSelect={() => {
                  if (
                    window.confirm(
                      getAllVersions().find((v) => v.isPublished)
                        ? "Reset to last published version? All unsaved changes will be lost."
                        : "No published version exists. Clear everything?"
                    )
                  ) {
                    resetToPublished(setNodes, setEdges, setPlatform)
                    setSelectedNode(null)
                    setSelectedNodes([])
                    setIsPropertiesPanelOpen(false)
                    toast.success(
                      getAllVersions().find((v) => v.isPublished)
                        ? "Reset to published version"
                        : "Flow cleared"
                    )
                  }
                }}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset to Published
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem onSelect={() => setIsExportModalOpen(true)}>
                <Eye className="w-4 h-4 mr-2" />
                Export/Import Flow
              </DropdownMenuItem>

              <DropdownMenuItem onSelect={() => setIsVersionHistoryModalOpen(true)}>
                <History className="w-4 h-4 mr-2" />
                Version History
              </DropdownMenuItem>

              <DropdownMenuItem onSelect={() => setIsScreenshotModalOpen(true)}>
                <Camera className="w-4 h-4 mr-2" />
                Take Screenshot
              </DropdownMenuItem>

              {loadFromDb && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => setShowDeleteDialog(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete Flow
                  </DropdownMenuItem>
                </>
              )}

              <DropdownMenuSeparator />

              <DropdownMenuLabel>Platform</DropdownMenuLabel>
              <div className="px-2 py-1.5">
                <PlatformSelector platform={platform} onPlatformChange={handlePlatformChange} />
              </div>

              <DropdownMenuSeparator />

              <div className="px-2 py-1.5">
                <ThemeToggle />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}
