"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Loader2, Users, Pencil, Trash2, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
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
  type Team,
} from "@/hooks/queries"

const teamSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  assignment_strategy: z.enum(["round_robin", "load_balanced", "manual"]),
})

type TeamFormValues = z.infer<typeof teamSchema>

const STRATEGY_LABELS: Record<string, string> = {
  round_robin: "Round Robin",
  load_balanced: "Load Balanced",
  manual: "Manual",
}

const STRATEGY_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  round_robin: "default",
  load_balanced: "secondary",
  manual: "outline",
}

export default function TeamsPage() {
  const { data: teams, isLoading } = useTeams()
  const createTeam = useCreateTeam()
  const updateTeam = useUpdateTeam()
  const deleteTeam = useDeleteTeam()

  const [showDialog, setShowDialog] = useState(false)
  const [editingTeam, setEditingTeam] = useState<Team | null>(null)
  const [teamToDelete, setTeamToDelete] = useState<Team | null>(null)

  const form = useForm<TeamFormValues>({
    resolver: zodResolver(teamSchema),
    defaultValues: {
      name: "",
      description: "",
      assignment_strategy: "round_robin",
    },
  })

  function openCreate() {
    setEditingTeam(null)
    form.reset({ name: "", description: "", assignment_strategy: "round_robin" })
    setShowDialog(true)
  }

  function openEdit(team: Team) {
    setEditingTeam(team)
    form.reset({
      name: team.name,
      description: team.description ?? "",
      assignment_strategy: team.assignment_strategy,
    })
    setShowDialog(true)
  }

  function onSubmit(data: TeamFormValues) {
    if (editingTeam) {
      updateTeam.mutate(
        { id: editingTeam.id, ...data },
        {
          onSuccess: () => {
            toast.success("Team updated")
            setShowDialog(false)
          },
          onError: (err) => toast.error(err.message || "Failed to update team"),
        }
      )
    } else {
      createTeam.mutate(data, {
        onSuccess: () => {
          toast.success("Team created")
          setShowDialog(false)
        },
        onError: (err) => toast.error(err.message || "Failed to create team"),
      })
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

  const isPending = createTeam.isPending || updateTeam.isPending

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Teams</h1>
          <p className="text-sm text-muted-foreground">Organize agents into teams with assignment strategies</p>
        </div>
        <Button onClick={openCreate} className="cursor-pointer">
          <Plus className="mr-2 h-4 w-4" />
          Create Team
        </Button>
      </div>

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
      ) : (
        <div className="space-y-3">
          {teams.map((team) => (
            <Card key={team.id} className="hover:bg-muted/50 transition-colors">
              <CardContent className="flex items-center justify-between p-4">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{team.name}</span>
                    <Badge variant={STRATEGY_VARIANTS[team.assignment_strategy] ?? "outline"}>
                      {STRATEGY_LABELS[team.assignment_strategy] ?? team.assignment_strategy}
                    </Badge>
                    <Badge variant={team.is_active ? "default" : "secondary"}>
                      {team.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  {team.description && (
                    <p className="text-sm text-muted-foreground truncate">{team.description}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {team.member_count} {team.member_count === 1 ? "member" : "members"}
                  </p>
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="cursor-pointer"
                    onClick={() => openEdit(team)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="cursor-pointer text-destructive hover:text-destructive"
                    onClick={() => setTeamToDelete(team)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>{editingTeam ? "Edit Team" : "Create Team"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Support Team" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Briefly describe this team's purpose"
                        rows={3}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="assignment_strategy"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assignment Strategy</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="cursor-pointer">
                          <SelectValue placeholder="Select a strategy" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="round_robin" className="cursor-pointer">Round Robin</SelectItem>
                        <SelectItem value="load_balanced" className="cursor-pointer">Load Balanced</SelectItem>
                        <SelectItem value="manual" className="cursor-pointer">Manual</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowDialog(false)}
                  className="cursor-pointer"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending} className="cursor-pointer">
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingTeam ? "Save Changes" : "Create Team"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete AlertDialog */}
      <AlertDialog open={!!teamToDelete} onOpenChange={(open) => !open && setTeamToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Team</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium">{teamToDelete?.name}</span>? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTeam.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
