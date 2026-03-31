"use client"

import { useState, useMemo, useCallback } from "react"
import { toast } from "sonner"
import {
  Loader2,
  Users,
  Pencil,
  Trash2,
  Plus,
  Search,
  RotateCcw,
  Scale,
  Hand,
  UserPlus,
  UserMinus,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import {
  useTeams,
  useCreateTeam,
  useUpdateTeam,
  useDeleteTeam,
  useUsers,
  type Team,
} from "@/hooks/queries"
import { apiClient } from "@/lib/api-client"

// --- Types ---

interface TeamMember {
  id: string
  user_id: string
  team_id: string
  role: string
  user?: { id: string; full_name: string; email: string; is_available: boolean }
}

// --- Constants ---

const STRATEGY_INFO = [
  {
    key: "round_robin",
    label: "Round Robin",
    icon: RotateCcw,
    description: "Assigns to agents in rotation",
  },
  {
    key: "load_balanced",
    label: "Load Balanced",
    icon: Scale,
    description: "Assigns to agent with fewest active chats",
  },
  {
    key: "manual",
    label: "Manual Queue",
    icon: Hand,
    description: "Agents pick from team queue",
  },
]

const STRATEGY_LABELS: Record<string, string> = {
  round_robin: "Round Robin",
  load_balanced: "Load Balanced",
  manual: "Manual Queue",
}

const STRATEGY_ICONS: Record<string, typeof RotateCcw> = {
  round_robin: RotateCcw,
  load_balanced: Scale,
  manual: Hand,
}

interface TeamFormState {
  name: string
  description: string
  assignment_strategy: "round_robin" | "load_balanced" | "manual"
  is_active: boolean
}

const EMPTY_FORM: TeamFormState = {
  name: "",
  description: "",
  assignment_strategy: "round_robin",
  is_active: true,
}

// --- Helpers ---

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  } catch {
    return dateStr
  }
}

// --- Manage Members Dialog ---

function ManageMembersDialog({
  team,
  open,
  onOpenChange,
}: {
  team: Team | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: users = [] } = useUsers()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchMembers = useCallback(async (teamId: string) => {
    setLoading(true)
    try {
      const data = await apiClient.get<any>(`/api/teams/${teamId}/members`)
      setMembers(data?.members || data || [])
    } catch {
      toast.error("Failed to load members")
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch members when dialog opens
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen && team) {
        fetchMembers(team.id)
      }
      if (!nextOpen) {
        setMembers([])
      }
      onOpenChange(nextOpen)
    },
    [team, fetchMembers, onOpenChange]
  )

  const memberUserIds = useMemo(
    () => new Set(members.map((m) => m.user_id)),
    [members]
  )

  const availableUsers = useMemo(
    () => users.filter((u) => !memberUserIds.has(u.id)),
    [users, memberUserIds]
  )

  async function addMember(userId: string, role: "agent" | "manager") {
    if (!team) return
    setActionLoading(`add-${userId}-${role}`)
    try {
      await apiClient.post(`/api/teams/${team.id}/members`, {
        user_id: userId,
        role,
      })
      toast.success("Member added")
      await fetchMembers(team.id)
    } catch (err: any) {
      toast.error(err.message || "Failed to add member")
    } finally {
      setActionLoading(null)
    }
  }

  async function removeMember(userId: string) {
    if (!team) return
    setActionLoading(`remove-${userId}`)
    try {
      await apiClient.delete(`/api/teams/${team.id}/members/${userId}`)
      toast.success("Member removed")
      await fetchMembers(team.id)
    } catch (err: any) {
      toast.error(err.message || "Failed to remove member")
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[540px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Manage Members {team ? `- ${team.name}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-2">
          {/* Current Members */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium">
              Current Members ({members.length})
            </h3>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : members.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No members yet. Add members below.
              </p>
            ) : (
              <div className="space-y-2">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {getInitials(
                            member.user?.full_name || "Unknown"
                          )}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">
                          {member.user?.full_name || "Unknown User"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {member.user?.email || ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="capitalize">
                        {member.role}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="cursor-pointer text-destructive hover:text-destructive hover:bg-muted h-8 w-8"
                        disabled={actionLoading === `remove-${member.user_id}`}
                        onClick={() => removeMember(member.user_id)}
                      >
                        {actionLoading === `remove-${member.user_id}` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <UserMinus className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Members */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Add Members</h3>

            {availableUsers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {users.length === 0
                  ? "No users found in your organization."
                  : "All users are already members of this team."}
              </p>
            ) : (
              <div className="space-y-2">
                {availableUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {getInitials(user.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">
                          {user.full_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {user.email}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="cursor-pointer"
                        disabled={actionLoading === `add-${user.id}-agent`}
                        onClick={() => addMember(user.id, "agent")}
                      >
                        {actionLoading === `add-${user.id}-agent` && (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        )}
                        Add as Agent
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="cursor-pointer"
                        disabled={actionLoading === `add-${user.id}-manager`}
                        onClick={() => addMember(user.id, "manager")}
                      >
                        {actionLoading === `add-${user.id}-manager` && (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        )}
                        Add as Manager
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// --- Main Page ---

export default function TeamsPage() {
  const { data: teams, isLoading } = useTeams()
  const createTeam = useCreateTeam()
  const updateTeam = useUpdateTeam()
  const deleteTeam = useDeleteTeam()

  const [searchQuery, setSearchQuery] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)
  const [teamToDelete, setTeamToDelete] = useState<Team | null>(null)
  const [membersTeam, setMembersTeam] = useState<Team | null>(null)
  const [membersDialogOpen, setMembersDialogOpen] = useState(false)
  const [form, setForm] = useState<TeamFormState>(EMPTY_FORM)

  const isEditing = editingTeam !== null

  const filteredTeams = useMemo(() => {
    if (!teams) return []
    if (!searchQuery.trim()) return teams
    const q = searchQuery.toLowerCase()
    return teams.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        STRATEGY_LABELS[t.assignment_strategy]?.toLowerCase().includes(q)
    )
  }, [teams, searchQuery])

  function openCreate() {
    setEditingTeam(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  function openEdit(team: Team) {
    setEditingTeam(team)
    setForm({
      name: team.name,
      description: team.description ?? "",
      assignment_strategy: team.assignment_strategy,
      is_active: team.is_active,
    })
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditingTeam(null)
    setForm(EMPTY_FORM)
  }

  function openMembers(team: Team) {
    setMembersTeam(team)
    setMembersDialogOpen(true)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!form.name.trim()) {
      toast.error("Name is required")
      return
    }

    if (isEditing) {
      updateTeam.mutate(
        {
          id: editingTeam.id,
          name: form.name,
          description: form.description,
          assignment_strategy: form.assignment_strategy,
          is_active: form.is_active,
        },
        {
          onSuccess: () => {
            toast.success("Team updated")
            closeDialog()
          },
          onError: (err) => toast.error(err.message || "Failed to update team"),
        }
      )
    } else {
      createTeam.mutate(
        {
          name: form.name,
          description: form.description,
          assignment_strategy: form.assignment_strategy,
        },
        {
          onSuccess: () => {
            toast.success("Team created")
            closeDialog()
          },
          onError: (err) => toast.error(err.message || "Failed to create team"),
        }
      )
    }
  }

  function confirmDelete() {
    if (!teamToDelete) return
    deleteTeam.mutate(teamToDelete.id, {
      onSuccess: () => {
        toast.success("Team deleted")
        setTeamToDelete(null)
      },
      onError: (err) => toast.error(err.message || "Failed to delete team"),
    })
  }

  const isSubmitting = createTeam.isPending || updateTeam.isPending

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Teams</h1>
          <p className="text-sm text-muted-foreground">
            Organize agents into teams with assignment strategies
          </p>
        </div>
        <Button onClick={openCreate} className="cursor-pointer">
          <Plus className="mr-2 h-4 w-4" />
          Create Team
        </Button>
      </div>

      {/* Assignment Strategies Info */}
      <Card className="py-4">
        <CardContent className="grid grid-cols-3 gap-4">
          {STRATEGY_INFO.map(({ key, label, icon: Icon, description }) => (
            <div key={key} className="flex items-start gap-3">
              <div className="rounded-lg bg-muted p-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Search + Count */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search teams..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Badge variant="secondary">
          {filteredTeams.length} {filteredTeams.length === 1 ? "team" : "teams"}
        </Badge>
      </div>

      {/* Table */}
      {!teams || teams.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <div className="rounded-full bg-muted p-4">
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="font-medium">No teams yet</p>
            <p className="text-sm text-muted-foreground">
              Create a team to group agents and manage conversation routing.
            </p>
          </div>
          <Button onClick={openCreate} className="cursor-pointer">
            <Plus className="mr-2 h-4 w-4" />
            Create Your First Team
          </Button>
        </div>
      ) : filteredTeams.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-2">
          <p className="font-medium">No teams found</p>
          <p className="text-sm text-muted-foreground">
            Try a different search term.
          </p>
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team</TableHead>
                <TableHead>Strategy</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTeams.map((team) => {
                const StrategyIcon = STRATEGY_ICONS[team.assignment_strategy]
                return (
                  <TableRow key={team.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarFallback>
                            <Users className="h-4 w-4" />
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{team.name}</p>
                          {team.description && (
                            <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                              {team.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {StrategyIcon && (
                          <StrategyIcon className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="text-sm">
                          {STRATEGY_LABELS[team.assignment_strategy] ??
                            team.assignment_strategy}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="cursor-pointer hover:bg-muted"
                        onClick={() => openMembers(team)}
                      >
                        <Users className="mr-1 h-3 w-3" />
                        {team.member_count}{" "}
                        {team.member_count === 1 ? "member" : "members"}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          team.is_active
                            ? "border-green-500 text-green-600"
                            : ""
                        }
                      >
                        {team.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(team.created_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="cursor-pointer hover:bg-muted"
                          onClick={() => openMembers(team)}
                          title="Manage members"
                        >
                          <UserPlus className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="cursor-pointer hover:bg-muted"
                          onClick={() => openEdit(team)}
                          title="Edit team"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="cursor-pointer text-destructive hover:text-destructive hover:bg-muted"
                          onClick={() => setTeamToDelete(team)}
                          title="Delete team"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Manage Members Dialog */}
      <ManageMembersDialog
        team={membersTeam}
        open={membersDialogOpen}
        onOpenChange={setMembersDialogOpen}
      />

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Edit Team" : "Create Team"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="team-name">Name</Label>
              <Input
                id="team-name"
                placeholder="e.g. Support Team"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="team-desc">Description</Label>
              <Textarea
                id="team-desc"
                placeholder="Briefly describe this team's purpose"
                rows={3}
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Assignment Strategy</Label>
              <Select
                value={form.assignment_strategy}
                onValueChange={(val) =>
                  setForm((f) => ({
                    ...f,
                    assignment_strategy: val as TeamFormState["assignment_strategy"],
                  }))
                }
              >
                <SelectTrigger className="cursor-pointer">
                  <SelectValue placeholder="Select a strategy" />
                </SelectTrigger>
                <SelectContent>
                  {STRATEGY_INFO.map(({ key, label, icon: Icon }) => (
                    <SelectItem
                      key={key}
                      value={key}
                      className="cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <span>{label}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isEditing && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label>Active</Label>
                  <p className="text-sm text-muted-foreground">
                    Inactive teams will not receive assignments
                  </p>
                </div>
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, is_active: checked }))
                  }
                  className="cursor-pointer"
                />
              </div>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={closeDialog}
                className="cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="cursor-pointer"
              >
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isEditing ? "Save Changes" : "Create Team"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete AlertDialog */}
      <AlertDialog
        open={!!teamToDelete}
        onOpenChange={(open) => !open && setTeamToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Team</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium">{teamToDelete?.name}</span>? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTeam.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
