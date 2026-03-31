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

const accountSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone_number: z.string().min(1, "Phone number is required"),
  phone_number_id: z.string().min(1, "Phone Number ID is required"),
  business_id: z.string().min(1, "Business ID is required"),
  waba_id: z.string().min(1, "WABA ID is required"),
  access_token: z.string().min(1, "Access token is required"),
})

type AccountFormValues = z.infer<typeof accountSchema>

export default function AccountsPage() {
  const { data: accounts, isLoading } = useAccounts()
  const createAccount = useCreateAccount()
  const updateAccount = useUpdateAccount()
  const deleteAccount = useDeleteAccount()

  const [showDialog, setShowDialog] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null)

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      name: "",
      phone_number: "",
      phone_number_id: "",
      business_id: "",
      waba_id: "",
      access_token: "",
    },
  })

  function openCreate() {
    setEditingAccount(null)
    form.reset({
      name: "",
      phone_number: "",
      phone_number_id: "",
      business_id: "",
      waba_id: "",
      access_token: "",
    })
    setShowDialog(true)
  }

  function openEdit(account: Account) {
    setEditingAccount(account)
    form.reset({
      name: account.name,
      phone_number: account.phone_number,
      phone_number_id: account.phone_number_id,
      business_id: account.business_id,
      waba_id: account.waba_id,
      access_token: account.access_token,
    })
    setShowDialog(true)
  }

  function onSubmit(data: AccountFormValues) {
    if (editingAccount) {
      updateAccount.mutate(
        { id: editingAccount.id, ...data },
        {
          onSuccess: () => {
            toast.success("Account updated")
            setShowDialog(false)
          },
          onError: (err) => toast.error(err.message || "Failed to update account"),
        }
      )
    } else {
      createAccount.mutate(data, {
        onSuccess: () => {
          toast.success("Account added")
          setShowDialog(false)
        },
        onError: (err) => toast.error(err.message || "Failed to add account"),
      })
    }
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

  const isPending = createAccount.isPending || updateAccount.isPending

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
                    <Badge variant={account.is_active ? "default" : "secondary"}>
                      {account.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-0.5">
                    <p>{account.phone_number}</p>
                    <p className="text-xs">
                      WABA: {account.waba_id} &middot; Business: {account.business_id}
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

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingAccount ? "Edit Account" : "Add WhatsApp Account"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
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
                control={form.control}
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
                control={form.control}
                name="phone_number_id"
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
                control={form.control}
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
                control={form.control}
                name="waba_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>WABA ID</FormLabel>
                    <FormControl>
                      <Input placeholder="WhatsApp Business Account ID" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
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
                  onClick={() => setShowDialog(false)}
                  className="cursor-pointer"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending} className="cursor-pointer">
                  {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingAccount ? "Save Changes" : "Add Account"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

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
