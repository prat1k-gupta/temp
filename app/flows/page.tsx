"use client"

import { useState, useEffect, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Plus, Trash2, Copy, Loader2, Layers, LogOut, Search, LayoutGrid, List } from "lucide-react"
import { WhatsAppIcon, InstagramIcon, WebIcon } from "@/components/platform-icons"
import { ThemeToggle } from "@/components/theme-toggle"
import { getAllFlows, deleteFlow, duplicateFlow, type FlowMetadata } from "@/utils/flow-storage"
import { getPlatformDisplayName } from "@/utils/platform-labels"
import type { Platform } from "@/types"
import { toast } from "sonner"
import Link from "next/link"
import { logout } from "@/lib/auth"

// Freestand LogoClosed component (icon only)
const LogoClosed = ({ className }: { className?: string }) => (
  <svg viewBox='0 0 127 128' fill='none' xmlns='http://www.w3.org/2000/svg' className={className}>
    <g>
      <path
        d='M94.8052 62.1819V102.384C94.7538 104.184 94.7565 105.342 94.7565 105.342H68.3398V62.1819M94.8052 62.1819H68.3398M94.8052 62.1819H98.7703V51.4453L68.3398 51.4453V62.1819'
        stroke='#052762'
        strokeWidth='7'
        strokeMiterlimit='16'
        strokeLinecap='round'
      />
      <path
        d='M32.6543 62.1819V102.384C32.7057 104.184 32.703 105.342 32.703 105.342H57.2754V62.1819M32.6543 62.1819H57.2754M32.6543 62.1819H28.6892V51.4453L57.2754 51.4453V62.1819'
        stroke='#052762'
        strokeWidth='7'
        strokeMiterlimit='16'
        strokeLinecap='round'
      />
      <path
        d='M28.6895 41.6827C33.2272 41.6827 51.7948 41.6827 56.2307 41.6827L54.6309 39.8631C49.9526 34.0405 40.9363 28.2184 41.3726 18.3922C41.5859 13.5891 48.4992 8.05709 55.553 15.0442C61.1961 20.6339 62.1221 30.9108 61.8797 35.3505C64.1825 28.8971 70.737 17.0821 78.5326 21.449C88.2771 26.9077 76.3772 37.1701 73.9775 38.1891C72.0577 39.2371 70.1728 40.7122 69.0093 41.3187H98.7717'
        stroke='#052762'
        strokeWidth='7'
        strokeLinecap='square'
        strokeLinejoin='round'
      />
    </g>
  </svg>
)

type SortOption = "last-updated" | "name-asc" | "name-desc" | "newest" | "oldest"
type PlatformFilter = "all" | Platform
type ViewMode = "cards" | "table"

function getStatusBadge(flow: FlowMetadata) {
  if (flow.hasPublished) {
    return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800 hover:bg-green-100">Published</Badge>
  }
  if (flow.hasDraft) {
    return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800 hover:bg-amber-100">Draft</Badge>
  }
  return <Badge variant="secondary" className="text-muted-foreground">Not published</Badge>
}

export default function FlowsPage() {
  const router = useRouter()
  const [flows, setFlows] = useState<FlowMetadata[]>([])
  const [loading, setLoading] = useState(true)
  const [flowToDelete, setFlowToDelete] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<ViewMode>("cards")
  const [sortOption, setSortOption] = useState<SortOption>("last-updated")
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all")

  useEffect(() => {
    loadFlows()
  }, [])

  const loadFlows = async () => {
    setLoading(true)
    try {
      const allFlows = await getAllFlows()
      // Sort flows by updatedAt (newest first)
      const sortedFlows = allFlows.sort((a, b) => {
        const dateA = new Date(a.updatedAt).getTime()
        const dateB = new Date(b.updatedAt).getTime()
        return dateB - dateA
      })
      setFlows(sortedFlows)
    } catch (error) {
      console.error("Failed to load flows:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateFlow = () => {
    router.push("/flow/new")
  }

  const handleDeleteFlow = async (flowId: string) => {
    const success = await deleteFlow(flowId)
    if (success) {
      toast.success("Flow deleted")
      loadFlows()
    } else {
      toast.error("Failed to delete flow")
    }
    setFlowToDelete(null)
  }

  const handleDuplicateFlow = async (flowId: string, flowName: string) => {
    const duplicated = await duplicateFlow(flowId)
    if (duplicated) {
      toast.success(`Flow "${flowName}" duplicated!`)
      loadFlows()
    } else {
      toast.error("Failed to duplicate flow")
    }
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

  // FlowCard component
  const FlowCard = ({
    flow,
    onDuplicate,
    onDelete,
    onEdit,
    showActions = true,
  }: {
    flow: FlowMetadata
    onDuplicate: () => void
    onDelete: () => void
    onEdit: () => void
    showActions?: boolean
  }) => (
    <Card
      className="group relative overflow-hidden hover:shadow-xl transition-all duration-300 cursor-pointer border hover:border-accent/50 hover:-translate-y-1"
      onClick={onEdit}
    >
      {/* Platform-colored accent bar */}
      <div className={`absolute top-0 left-0 right-0 h-1 ${getPlatformColor(flow.platform)}`} />

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`${getPlatformColor(flow.platform)} p-2.5 rounded-lg text-white shrink-0 shadow-sm`}>
              {getPlatformIcon(flow.platform)}
            </div>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base font-semibold truncate mb-1">
                {flow.name}
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                  {getPlatformDisplayName(flow.platform)}
                </Badge>
                {getStatusBadge(flow)}
                <span className="text-xs text-muted-foreground">
                  {formatDate(flow.updatedAt)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-sm font-medium">{flow.nodeCount}</span>
            <span className="text-xs text-muted-foreground">nodes</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/50">
            <div className="w-2 h-2 rounded-full bg-purple-500" />
            <span className="text-sm font-medium">{flow.edgeCount}</span>
            <span className="text-xs text-muted-foreground">edges</span>
          </div>
        </div>
      </CardContent>

      {showActions && (
        <CardFooter className="pt-3 border-t">
          <div className="flex items-center justify-end gap-1 w-full opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-3 text-xs gap-1.5"
              onClick={(e) => {
                e.stopPropagation()
                onDuplicate()
              }}
            >
              <Copy className="w-3.5 h-3.5" />
              Duplicate
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-3 text-xs gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </Button>
          </div>
        </CardFooter>
      )}
    </Card>
  )

  // Table view component
  const FlowTable = () => (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left font-medium text-muted-foreground px-4 py-3">Name</th>
            <th className="text-left font-medium text-muted-foreground px-4 py-3">Platform</th>
            <th className="text-left font-medium text-muted-foreground px-4 py-3">Status</th>
            <th className="text-right font-medium text-muted-foreground px-4 py-3">Nodes</th>
            <th className="text-right font-medium text-muted-foreground px-4 py-3">Edges</th>
            <th className="text-left font-medium text-muted-foreground px-4 py-3">Last Updated</th>
            <th className="text-right font-medium text-muted-foreground px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredFlows.map((flow) => (
            <tr
              key={flow.id}
              className="border-b last:border-b-0 hover:bg-muted/50 cursor-pointer transition-colors"
              onClick={() => router.push(`/flow/${flow.id}`)}
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className={`${getPlatformColor(flow.platform)} p-1.5 rounded-md text-white shrink-0`}>
                    {getPlatformIcon(flow.platform)}
                  </div>
                  <span className="font-medium truncate max-w-[250px]">{flow.name}</span>
                </div>
              </td>
              <td className="px-4 py-3">
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                  {getPlatformDisplayName(flow.platform)}
                </Badge>
              </td>
              <td className="px-4 py-3">
                {getStatusBadge(flow)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{flow.nodeCount}</td>
              <td className="px-4 py-3 text-right tabular-nums">{flow.edgeCount}</td>
              <td className="px-4 py-3 text-muted-foreground">{formatDate(flow.updatedAt)}</td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDuplicateFlow(flow.id, flow.name)
                    }}
                    title="Duplicate"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation()
                      setFlowToDelete(flow.id)
                    }}
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
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
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header with gradient */}
      <div className="border-b border-border/50 bg-background/80 backdrop-blur-xl sticky top-0 z-10 shadow-sm">
        <div className="container mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    window.location.href = 'http://localhost:3000';
                  }}
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                  aria-label="Go to Freestand Sampling Central"
                >
                  <LogoClosed className="w-12 h-12" />
                </button>
                <div>
                  <h1 className="text-2xl font-bold text-[#052762]">
                    Freestand Flow Builder
                  </h1>
                  <p className="text-xs text-muted-foreground">Build conversational experiences</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/templates">
                <Button variant="outline" size="lg" className="gap-2">
                  <WhatsAppIcon className="w-4 h-4" />
                  WhatsApp Templates
                </Button>
              </Link>
              <Link href="/flow-templates">
                <Button variant="outline" size="lg" className="gap-2">
                  <Layers className="w-4 h-4" />
                  Flow Templates
                </Button>
              </Link>
              <Button
                onClick={handleCreateFlow}
                size="lg"
                className="gap-2 shadow-md hover:shadow-lg transition-all bg-[#052762] hover:bg-[#0A49B7] text-white"
              >
                <Plus className="w-4 h-4" />
                New Flow
              </Button>
              <ThemeToggle />
              <Button
                variant="ghost"
                size="icon"
                onClick={logout}
                className="cursor-pointer"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-6 py-10">
        {loading ? (
          <div className="flex items-center justify-center min-h-[70vh]">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : flows.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[70vh]">
            <div className="relative">
              {/* Animated gradient circles in background */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-32 h-32 bg-[#052762]/20 rounded-full blur-3xl animate-pulse" />
                <div className="w-32 h-32 bg-[#2872F4]/20 rounded-full blur-3xl animate-pulse delay-75 -ml-16" />
              </div>

              {/* Main icon */}
              <div className="relative mb-8">
                <button
                  onClick={() => {
                    window.location.href = 'http://localhost:3000';
                  }}
                  className="cursor-pointer hover:opacity-80 transition-opacity"
                  aria-label="Go to Freestand Sampling Central"
                >
                  <LogoClosed className="w-24 h-24" />
                </button>
              </div>
            </div>

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
            {/* Title row */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-foreground mb-1">Your Flows</h2>
                <p className="text-sm text-muted-foreground">
                  {filteredFlows.length} of {flows.length} {flows.length === 1 ? 'flow' : 'flows'}
                </p>
              </div>
            </div>

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
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
