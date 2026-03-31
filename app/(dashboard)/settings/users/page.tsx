"use client"

import { useState, useEffect, useMemo } from "react"
import { toast } from "sonner"
import {
  Loader2,
  Users,
  Pencil,
  Trash2,
  Plus,
  Search,
  ShieldCheck,
  Shield,
  UserCog,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
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
  useUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  type OrgUser,
} from "@/hooks/queries"
import { getUser, type AuthUser } from "@/lib/auth"

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Manager",
  agent: "Agent",
}

const ROLE_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  admin: "default",
  manager: "secondary",
  agent: "outline",
}

const ROLE_INFO = [
  {
    role: "Admin",
    icon: ShieldCheck,
    description: "Full access including user management",
  },
  {
    role: "Manager",
    icon: Shield,
    description: "All features except user management",
  },
  {
    role: "Agent",
    icon: UserCog,
    description: "Chat with assigned contacts only",
  },
]

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

const ROLE_ICON_MAP: Record<string, typeof ShieldCheck> = {
  admin: ShieldCheck,
  manager: Shield,
  agent: UserCog,
}

interface UserFormState {
  full_name: string
  email: string
  password: string
  role: "admin" | "manager" | "agent"
  is_active: boolean
}

const EMPTY_FORM: UserFormState = {
  full_name: "",
  email: "",
  password: "",
  role: "agent",
  is_active: true,
}

export default function UsersPage() {
  const { data: users, isLoading } = useUsers()
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()
  const deleteUser = useDeleteUser()

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<OrgUser | null>(null)
  const [userToDelete, setUserToDelete] = useState<OrgUser | null>(null)
  const [form, setForm] = useState<UserFormState>(EMPTY_FORM)

  useEffect(() => {
    setCurrentUser(getUser())
  }, [])

  const isEditing = editingUser !== null
  const isSelf = isEditing && editingUser.id === currentUser?.id

  const filteredUsers = useMemo(() => {
    if (!users) return []
    if (!searchQuery.trim()) return users
    const q = searchQuery.toLowerCase()
    return users.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
    )
  }, [users, searchQuery])

  function openCreate() {
    setEditingUser(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  function openEdit(user: OrgUser) {
    setEditingUser(user)
    setForm({
      full_name: user.full_name,
      email: user.email,
      password: "",
      role: user.role as "admin" | "manager" | "agent",
      is_active: user.is_active,
    })
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditingUser(null)
    setForm(EMPTY_FORM)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!form.full_name.trim()) {
      toast.error("Name is required")
      return
    }
    if (!form.email.trim() || !form.email.includes("@")) {
      toast.error("Valid email is required")
      return
    }
    if (!isEditing && form.password.length < 8) {
      toast.error("Password must be at least 8 characters")
      return
    }
    if (isEditing && form.password && form.password.length < 8) {
      toast.error("Password must be at least 8 characters")
      return
    }

    if (isEditing) {
      const payload: Record<string, unknown> = {
        id: editingUser.id,
        full_name: form.full_name,
        email: form.email,
        role: form.role,
        is_active: form.is_active,
      }
      if (form.password) {
        payload.password = form.password
      }
      updateUser.mutate(payload as Parameters<typeof updateUser.mutate>[0], {
        onSuccess: () => {
          toast.success("User updated")
          closeDialog()
        },
        onError: (err) => toast.error(err.message || "Failed to update user"),
      })
    } else {
      createUser.mutate(
        {
          full_name: form.full_name,
          email: form.email,
          password: form.password,
          role: form.role,
        },
        {
          onSuccess: () => {
            toast.success("User invited")
            closeDialog()
          },
          onError: (err) =>
            toast.error(err.message || "Failed to invite user"),
        }
      )
    }
  }

  function confirmDelete() {
    if (!userToDelete) return
    deleteUser.mutate(userToDelete.id, {
      onSuccess: () => {
        toast.success("User removed")
        setUserToDelete(null)
      },
      onError: (err) => toast.error(err.message || "Failed to remove user"),
    })
  }

  const isSubmitting = createUser.isPending || updateUser.isPending

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
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-sm text-muted-foreground">
            Manage your team members and their roles
          </p>
        </div>
        <Button onClick={openCreate} className="cursor-pointer">
          <Plus className="mr-2 h-4 w-4" />
          Invite User
        </Button>
      </div>

      {/* Role Permissions Info */}
      <Card className="py-4">
        <CardContent className="grid grid-cols-3 gap-4">
          {ROLE_INFO.map(({ role, icon: Icon, description }) => (
            <div key={role} className="flex items-start gap-3">
              <div className="rounded-lg bg-muted p-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">{role}</p>
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
            placeholder="Search by name, email, or role..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Badge variant="secondary">
          {filteredUsers.length} {filteredUsers.length === 1 ? "user" : "users"}
        </Badge>
      </div>

      {/* Table */}
      {!users || users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <div className="rounded-full bg-muted p-4">
            <Users className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="font-medium">No team members</p>
            <p className="text-sm text-muted-foreground">
              Invite your first user to get started.
            </p>
          </div>
          <Button onClick={openCreate} className="cursor-pointer">
            <Plus className="mr-2 h-4 w-4" />
            Invite Your First User
          </Button>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-2">
          <p className="font-medium">No users found</p>
          <p className="text-sm text-muted-foreground">
            Try a different search term.
          </p>
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user) => {
                const RoleIcon = ROLE_ICON_MAP[user.role]
                const isCurrentUser = user.id === currentUser?.id
                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="relative">
                          <Avatar>
                            <AvatarFallback>
                              {getInitials(user.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          {RoleIcon && (
                            <div className="absolute -bottom-0.5 -right-0.5 rounded-full bg-background p-0.5">
                              <RoleIcon className="h-3 w-3 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {user.full_name}
                            </span>
                            {isCurrentUser && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                You
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={ROLE_VARIANTS[user.role] ?? "outline"}>
                        {ROLE_LABELS[user.role] ?? user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          user.is_active
                            ? "border-green-500 text-green-600"
                            : ""
                        }
                      >
                        {user.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(user.created_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="cursor-pointer hover:bg-muted"
                          onClick={() => openEdit(user)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="cursor-pointer text-destructive hover:text-destructive hover:bg-muted"
                          disabled={isCurrentUser}
                          onClick={() => setUserToDelete(user)}
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

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Edit User" : "Invite User"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                placeholder="Jane Doe"
                value={form.full_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, full_name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="jane@example.com"
                value={form.email}
                onChange={(e) =>
                  setForm((f) => ({ ...f, email: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">
                {isEditing ? "Password" : "Initial Password"}
              </Label>
              <Input
                id="password"
                type="password"
                placeholder={
                  isEditing
                    ? "Leave blank to keep existing"
                    : "Min. 8 characters"
                }
                value={form.password}
                onChange={(e) =>
                  setForm((f) => ({ ...f, password: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={form.role}
                onValueChange={(val) =>
                  setForm((f) => ({
                    ...f,
                    role: val as "admin" | "manager" | "agent",
                  }))
                }
              >
                <SelectTrigger className="cursor-pointer">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin" className="cursor-pointer">
                    Admin
                  </SelectItem>
                  <SelectItem value="manager" className="cursor-pointer">
                    Manager
                  </SelectItem>
                  <SelectItem value="agent" className="cursor-pointer">
                    Agent
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isEditing && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label>Active</Label>
                  <p className="text-sm text-muted-foreground">
                    Inactive users cannot log in
                  </p>
                </div>
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(checked) =>
                    setForm((f) => ({ ...f, is_active: checked }))
                  }
                  disabled={isSelf}
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
                {isEditing ? "Save Changes" : "Invite User"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete AlertDialog */}
      <AlertDialog
        open={!!userToDelete}
        onOpenChange={(open) => !open && setUserToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove{" "}
              <span className="font-medium">{userToDelete?.full_name}</span>?
              They will lose access to your organization.
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
              {deleteUser.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
