"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Loader2, Phone, Pencil, Trash2, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  useAccounts,
  useCreateAccount,
  useUpdateAccount,
  useDeleteAccount,
  type Account,
} from "@/hooks/queries"

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone_number: z.string().optional(),
  phone_id: z.string().optional(),
  app_id: z.string().optional(),
  business_id: z.string().optional(),
  access_token: z.string().optional(),
})

const editSchema = z.object({
  name: z.string().min(1, "Name is required"),
  access_token: z.string().optional(),
})

type CreateFormValues = z.infer<typeof createSchema>
type EditFormValues = z.infer<typeof editSchema>

export default function AccountsPage() {
  const { data: accounts, isLoading } = useAccounts()
  const createAccount = useCreateAccount()
  const updateAccount = useUpdateAccount()
  const deleteAccount = useDeleteAccount()

  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null)

  const createForm = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      name: "",
      phone_number: "",
      phone_id: "",
      app_id: "",
      business_id: "",
      access_token: "",
    },
  })

  const editForm = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { name: "", access_token: "" },
  })

  function openCreate() {
    createForm.reset({
      name: "",
      phone_number: "",
      phone_id: "",
      app_id: "",
      business_id: "",
      access_token: "",
    })
    setShowCreateDialog(true)
  }

  function openEdit(account: Account) {
    editForm.reset({
      name: account.name,
      access_token: "",
    })
    setEditingAccount(account)
  }

  function onCreateSubmit(data: CreateFormValues) {
    createAccount.mutate(data, {
      onSuccess: () => {
        toast.success("Account added")
        setShowCreateDialog(false)
      },
      onError: (err) => toast.error(err.message || "Failed to add account"),
    })
  }

  function onEditSubmit(data: EditFormValues) {
    if (!editingAccount) return
    const payload: Record<string, string> = { name: data.name }
    if (data.access_token) payload.access_token = data.access_token
    updateAccount.mutate(
      { id: editingAccount.id, ...payload },
      {
        onSuccess: () => {
          toast.success("Account updated")
          setEditingAccount(null)
        },
        onError: (err) => toast.error(err.message || "Failed to update account"),
      }
    )
  }

  function confirmDelete() {
    if (!accountToDelete) return
    deleteAccount.mutate(accountToDelete.id, {
      onSuccess: () => {
        toast.success("Account deleted")
        setAccountToDelete(null)
      },
      onError: (err) => toast.error(err.message || "Failed to delete account"),
    })
  }

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
          <h1 className="text-2xl font-bold">WhatsApp Accounts</h1>
          <p className="text-sm text-muted-foreground">Manage your WhatsApp Business accounts</p>
        </div>
        <Button onClick={openCreate} className="cursor-pointer">
          <Plus className="mr-2 h-4 w-4" />
          Add Account
        </Button>
      </div>

      {!accounts || accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
          <div className="rounded-full bg-muted p-4">
            <Phone className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="font-medium">No WhatsApp accounts connected</p>
            <p className="text-sm text-muted-foreground">
              Add your first account to start sending messages.
            </p>
          </div>
          <Button onClick={openCreate} className="cursor-pointer">
            <Plus className="mr-2 h-4 w-4" />
            Add Your First Account
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {accounts.map((account) => (
            <Card key={account.id} className="hover:bg-muted/50 transition-colors">
              <CardContent className="flex items-center justify-between p-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{account.name}</span>
                    <Badge variant={account.status === "active" ? "default" : "secondary"}>
                      {account.status === "active" ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-0.5">
                    <p>{account.phone_number}</p>
                    <p className="text-xs">
                      Phone ID: {account.phone_id} &middot; Business: {account.business_id}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="cursor-pointer"
                    onClick={() => openEdit(account)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="cursor-pointer text-destructive hover:text-destructive"
                    onClick={() => setAccountToDelete(account)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add WhatsApp Account</DialogTitle>
            <DialogDescription>
              Connect a new WhatsApp Business account. You can also use Embedded Signup to connect automatically.
            </DialogDescription>
          </DialogHeader>
          <Form {...createForm}>
            <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
              <FormField
                control={createForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Main Business Account" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="phone_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input placeholder="+91XXXXXXXXXX" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="phone_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number ID</FormLabel>
                    <FormControl>
                      <Input placeholder="From Meta Business Manager" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="app_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>App ID</FormLabel>
                    <FormControl>
                      <Input placeholder="Meta App ID" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="business_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business ID</FormLabel>
                    <FormControl>
                      <Input placeholder="Meta Business ID" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={createForm.control}
                name="access_token"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Access Token</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Meta access token" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateDialog(false)}
                  className="cursor-pointer"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createAccount.isPending} className="cursor-pointer">
                  {createAccount.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add Account
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingAccount} onOpenChange={(open) => !open && setEditingAccount(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Account</DialogTitle>
            <DialogDescription>
              Update account name or access token. Other fields are managed by Meta.
            </DialogDescription>
          </DialogHeader>
          {editingAccount && (
            <div className="space-y-2 text-sm text-muted-foreground border rounded-md p-3 bg-muted/30">
              <p>Phone: {editingAccount.phone_number}</p>
              <p>Phone ID: {editingAccount.phone_id}</p>
              <p>Business ID: {editingAccount.business_id}</p>
            </div>
          )}
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account Name</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="access_token"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Access Token</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Leave empty to keep current token" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingAccount(null)}
                  className="cursor-pointer"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateAccount.isPending} className="cursor-pointer">
                  {updateAccount.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!accountToDelete} onOpenChange={(open) => !open && setAccountToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-medium">{accountToDelete?.name}</span>? This action cannot be
              undone and will disconnect this WhatsApp number.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteAccount.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
