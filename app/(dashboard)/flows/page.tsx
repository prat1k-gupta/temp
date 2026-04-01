"use client"

import { useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Plus, Trash2, Copy, Loader2, Search, LayoutGrid, List, Zap, Link2, GitBranch, MoreHorizontal } from "lucide-react"
import { WhatsAppIcon, InstagramIcon, WebIcon } from "@/components/platform-icons"
import { cn } from "@/lib/utils"
import { useFlows, useDeleteFlow, useDuplicateFlow } from "@/hooks/queries"
import type { FlowMetadata } from "@/utils/flow-storage"
import { getPlatformDisplayName } from "@/utils/platform-labels"
import type { Platform } from "@/types"
import { toast } from "sonner"

type SortOption = "last-updated" | "name-asc" | "name-desc" | "newest" | "oldest"
type PlatformFilter = "all" | Platform
type ViewMode = "cards" | "table"

function getPlatformIconBg(platform: Platform) {
  switch (platform) {
    case "whatsapp": return "bg-[#25D366]/10 text-[#25D366]"
    case "instagram": return "bg-pink-500/10 text-pink-500"
    case "web": return "bg-blue-500/10 text-blue-500"
    default: return "bg-muted text-muted-foreground"
  }
}

export default function FlowsPage() {
  const router = useRouter()
  const { data: flows = [], isLoading: loading } = useFlows()
  const deleteFlowMutation = useDeleteFlow()
  const duplicateFlowMutation = useDuplicateFlow()
  const [flowToDelete, setFlowToDelete] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<ViewMode>("cards")
  const [sortOption, setSortOption] = useState<SortOption>("last-updated")
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all")

  const handleCreateFlow = () => {
    router.push("/flow/new")
  }

  const handleDeleteFlow = async (flowId: string) => {
    deleteFlowMutation.mutate(flowId, {
      onSuccess: (success) => {
        if (success) {
          toast.success("Flow deleted")
        } else {
          toast.error("Failed to delete flow")
        }
      },
      onError: () => {
        toast.error("Failed to delete flow")
      },
    })
    setFlowToDelete(null)
  }

  const handleDuplicateFlow = (flowId: string, flowName: string) => {
    duplicateFlowMutation.mutate(
      { flowId },
      {
        onSuccess: (duplicated) => {
          if (duplicated) {
            toast.success(`Flow "${flowName}" duplicated!`)
          } else {
            toast.error("Failed to duplicate flow")
          }
        },
        onError: () => {
          toast.error("Failed to duplicate flow")
        },
      },
    )
  }

  const getPlatformIcon = (platform: Platform) => {
    switch (platform) {
      case "web":
        return <WebIcon className="w-4 h-4" />
      case "whatsapp":
        return <WhatsAppIcon className="w-4 h-4" />
      case "instagram":
        return <InstagramIcon className="w-4 h-4" />
      default:
        return <WebIcon className="w-4 h-4" />
    }
  }

  const getPlatformColor = (platform: Platform) => {
    switch (platform) {
      case "web":
        return "bg-blue-500"
      case "whatsapp":
        return "bg-green-500"
      case "instagram":
        return "bg-pink-500"
      default:
        return "bg-gray-500"
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  // Filtered and sorted flows
  const filteredFlows = useMemo(() => {
    let result = flows

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      result = result.filter((flow) => flow.name.toLowerCase().includes(query))
    }

    // Platform filter
    if (platformFilter !== "all") {
      result = result.filter((flow) => flow.platform === platformFilter)
    }

    // Sort
    result = [...result].sort((a, b) => {
      switch (sortOption) {
        case "last-updated": {
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        }
        case "name-asc":
          return a.name.localeCompare(b.name)
        case "name-desc":
          return b.name.localeCompare(a.name)
        case "newest":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        case "oldest":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        default:
          return 0
      }
    })

    return result
  }, [flows, searchQuery, platformFilter, sortOption])

  const isDuplicating = duplicateFlowMutation.isPending
  const isDeleting = deleteFlowMutation.isPending

  // FlowCard component — v0 design
  const FlowCard = ({
    flow,
    onDuplicate,
    onDelete,
    onEdit,
  }: {
    flow: FlowMetadata
    onDuplicate: () => void
    onDelete: () => void
    onEdit: () => void
    showActions?: boolean
  }) => {
    const isLive = flow.hasPublished

    return (
      <div
        className={cn(
          "group relative overflow-hidden rounded-xl border border-border bg-card transition-all duration-300 cursor-pointer",
          "hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
        )}
        onClick={onEdit}
      >
        {/* Top accent line */}
        <div className={cn(
          "absolute top-0 left-0 right-0 h-[2px] transition-all duration-300",
          isLive ? "bg-primary" : "bg-muted-foreground/30"
        )} />

        <div className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg transition-colors", getPlatformIconBg(flow.platform))}>
                {getPlatformIcon(flow.platform)}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-semibold text-foreground">{flow.name}</h3>
                <p className="truncate text-sm text-muted-foreground">
                  {flow.description || "No description"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {formatDate(flow.updatedAt)}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100 cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem
                    className="cursor-pointer"
                    disabled={isDuplicating}
                    onClick={(e) => { e.stopPropagation(); onDuplicate() }}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive cursor-pointer"
                    onClick={(e) => { e.stopPropagation(); onDelete() }}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Status badges */}
          <div className="mt-4 flex items-center gap-2">
            <span className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
              isLive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            )}>
              <span className={cn(
                "h-1.5 w-1.5 rounded-full",
                isLive ? "bg-primary animate-pulse" : "bg-muted-foreground"
              )} />
              {isLive ? "Live" : "Draft"}
            </span>
            {flow.hasDraft && isLive && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-500">
                Has changes
              </span>
            )}
          </div>

          {/* Stats */}
          <div className="mt-4 flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <GitBranch className="h-3.5 w-3.5" />
              <span>{flow.nodeCount} nodes</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-px w-3 bg-muted-foreground/50" />
              <span>{flow.edgeCount} edges</span>
            </div>
          </div>

          {/* Divider + Trigger & Slug */}
          {((flow.triggerKeywords && flow.triggerKeywords.length > 0) || flow.flowSlug) && (
            <>
              <div className="my-4 h-px bg-border" />
              <div className="space-y-2.5">
                {flow.triggerKeywords && flow.triggerKeywords.length > 0 && (
                  <div className="flex items-start gap-2">
                    <Zap className="mt-0.5 h-3.5 w-3.5 text-primary" />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">Triggers:</span>
                      {flow.triggerKeywords.map((kw) => (
                        <span key={kw} className="rounded-md bg-secondary px-2 py-0.5 font-mono text-xs text-secondary-foreground">{kw}</span>
                      ))}
                    </div>
                  </div>
                )}
                {flow.flowSlug && (
                  <div className="flex items-center gap-2">
                    <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Slug:</span>
                    <code className="rounded-md bg-secondary px-2 py-0.5 font-mono text-xs text-secondary-foreground">{flow.flowSlug}</code>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  // Table view component — matches v0 design
  const FlowTable = () => (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="text-left font-medium text-muted-foreground px-4 py-3">Name</th>
            <th className="text-left font-medium text-muted-foreground px-4 py-3">Status</th>
            <th className="text-left font-medium text-muted-foreground px-4 py-3">Structure</th>
            <th className="text-left font-medium text-muted-foreground px-4 py-3">Triggers</th>
            <th className="text-left font-medium text-muted-foreground px-4 py-3">Slug</th>
            <th className="text-left font-medium text-muted-foreground px-4 py-3">Updated</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody>
          {filteredFlows.map((flow) => (
            <tr
              key={flow.id}
              className="group border-b last:border-b-0 hover:bg-muted/30 cursor-pointer transition-colors"
              onClick={() => router.push(`/flow/${flow.id}`)}
            >
              {/* Name + description */}
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg shrink-0", getPlatformIconBg(flow.platform))}>
                    {getPlatformIcon(flow.platform)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium truncate max-w-[200px]">{flow.name}</p>
                    {flow.description && (
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">{flow.description}</p>
                    )}
                  </div>
                </div>
              </td>
              {/* Status */}
              <td className="px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                    flow.hasPublished ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  )}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", flow.hasPublished ? "bg-primary" : "bg-muted-foreground")} />
                    {flow.hasPublished ? "Live" : "Draft"}
                  </span>
                  {flow.hasDraft && flow.hasPublished && (
                    <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-500">
                      Changes
                    </span>
                  )}
                </div>
              </td>
              {/* Structure */}
              <td className="px-4 py-3">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <GitBranch className="h-3.5 w-3.5" />
                  <span>{flow.nodeCount}</span>
                  <span className="text-border">|</span>
                  <span>{flow.edgeCount} edges</span>
                </div>
              </td>
              {/* Triggers */}
              <td className="px-4 py-3">
                {flow.triggerKeywords && flow.triggerKeywords.length > 0 ? (
                  <div className="flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-primary shrink-0" />
                    <div className="flex gap-1 flex-wrap">
                      {flow.triggerKeywords.slice(0, 2).map((kw) => (
                        <span key={kw} className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-xs">{kw}</span>
                      ))}
                      {flow.triggerKeywords.length > 2 && (
                        <span className="text-xs text-muted-foreground">+{flow.triggerKeywords.length - 2}</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </td>
              {/* Slug */}
              <td className="px-4 py-3">
                {flow.flowSlug ? (
                  <div className="flex items-center gap-1.5">
                    <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <code className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-xs">{flow.flowSlug}</code>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </td>
              {/* Updated */}
              <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                {formatDate(flow.updatedAt)}
              </td>
              {/* Actions */}
              <td className="px-2 py-3">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100 cursor-pointer transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem
                      className="cursor-pointer"
                      disabled={isDuplicating}
                      onClick={(e) => { e.stopPropagation(); handleDuplicateFlow(flow.id, flow.name) }}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive cursor-pointer"
                      onClick={(e) => { e.stopPropagation(); setFlowToDelete(flow.id) }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  const platformFilters: { value: PlatformFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "whatsapp", label: "WhatsApp" },
    { value: "instagram", label: "Instagram" },
    { value: "web", label: "Web" },
  ]

  return (
    <div className="p-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Flows</h1>
        <Button onClick={handleCreateFlow} className="gap-2 cursor-pointer">
          <Plus className="w-4 h-4" />
          New Flow
        </Button>
      </div>

      <div>
        {loading ? (
          <div className="flex items-center justify-center min-h-[70vh]">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : flows.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[50vh]">
            <h2 className="text-3xl font-bold text-foreground mb-3">Start Your Journey</h2>
            <p className="text-muted-foreground mb-8 max-w-md text-center leading-relaxed">
              Create your first flow and bring your conversational experiences to life across WhatsApp, Instagram, and Web.
            </p>

            <Button
              onClick={handleCreateFlow}
              size="lg"
              className="gap-2 h-12 px-8 text-base shadow-lg hover:shadow-xl transition-all bg-[#052762] hover:bg-[#0A49B7] text-white"
            >
              <Plus className="w-5 h-5" />
              Create Your First Flow
            </Button>

            {/* Feature highlights */}
            <div className="mt-16 grid grid-cols-3 gap-8 max-w-2xl">
              <div className="text-center">
                <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center mx-auto mb-3">
                  <WhatsAppIcon className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <p className="text-sm font-medium text-foreground">WhatsApp</p>
                <p className="text-xs text-muted-foreground mt-1">Business messaging</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 rounded-xl bg-pink-500/10 flex items-center justify-center mx-auto mb-3">
                  <InstagramIcon className="w-6 h-6 text-pink-600 dark:text-pink-400" />
                </div>
                <p className="text-sm font-medium text-foreground">Instagram</p>
                <p className="text-xs text-muted-foreground mt-1">Social engagement</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mx-auto mb-3">
                  <WebIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <p className="text-sm font-medium text-foreground">Web</p>
                <p className="text-xs text-muted-foreground mt-1">Website integration</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Toolbar: search + filters + sort + view toggle */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              {/* Left side: search + platform filter */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search flows..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 w-full sm:w-[260px]"
                  />
                </div>

                {/* Platform filter */}
                <div className="flex items-center gap-1">
                  {platformFilters.map((pf) => (
                    <Button
                      key={pf.value}
                      variant={platformFilter === pf.value ? "default" : "outline"}
                      size="sm"
                      className={`cursor-pointer text-xs h-8 ${
                        platformFilter === pf.value
                          ? "bg-[#052762] text-white hover:bg-[#0A49B7]"
                          : ""
                      }`}
                      onClick={() => setPlatformFilter(pf.value)}
                    >
                      {pf.value !== "all" && (
                        <span className="mr-1">{getPlatformIcon(pf.value as Platform)}</span>
                      )}
                      {pf.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Right side: sort + view toggle */}
              <div className="flex items-center gap-2">
                <Select value={sortOption} onValueChange={(v) => setSortOption(v as SortOption)}>
                  <SelectTrigger className="w-[160px] h-8 text-xs cursor-pointer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="last-updated">Last updated</SelectItem>
                    <SelectItem value="name-asc">Name A-Z</SelectItem>
                    <SelectItem value="name-desc">Name Z-A</SelectItem>
                    <SelectItem value="newest">Newest</SelectItem>
                    <SelectItem value="oldest">Oldest</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex items-center border rounded-md">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-8 w-8 p-0 rounded-r-none cursor-pointer ${viewMode === "cards" ? "bg-muted" : ""}`}
                    onClick={() => setViewMode("cards")}
                    title="Card view"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-8 w-8 p-0 rounded-l-none cursor-pointer ${viewMode === "table" ? "bg-muted" : ""}`}
                    onClick={() => setViewMode("table")}
                    title="Table view"
                  >
                    <List className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Content: cards or table */}
            {filteredFlows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Search className="w-10 h-10 text-muted-foreground/40 mb-4" />
                <p className="text-lg font-medium text-foreground mb-1">No flows found</p>
                <p className="text-sm text-muted-foreground">
                  Try adjusting your search or filters
                </p>
              </div>
            ) : viewMode === "cards" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredFlows.map((flow) => (
                  <FlowCard
                    key={flow.id}
                    flow={flow}
                    onDuplicate={() => handleDuplicateFlow(flow.id, flow.name)}
                    onDelete={() => setFlowToDelete(flow.id)}
                    onEdit={() => router.push(`/flow/${flow.id}`)}
                    showActions={true}
                  />
                ))}
              </div>
            ) : (
              <FlowTable />
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!flowToDelete} onOpenChange={(open) => {
        if (!open) {
          setFlowToDelete(null)
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete this flow and all its data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (flowToDelete) {
                  handleDeleteFlow(flowToDelete)
                }
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
