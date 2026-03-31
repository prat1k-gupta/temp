"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import {
  Plus, Pencil, Trash2, Phone, Check, RefreshCw, Loader2,
  Copy, ExternalLink, AlertCircle, CheckCircle2, Settings2, X, Send,
} from "lucide-react"
import { useQueryClient } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"

import {
  useAccounts, useCreateAccount, useUpdateAccount, useDeleteAccount, type Account,
  accountKeys,
} from "@/hooks/queries"
import { apiClient } from "@/lib/api-client"
import { useFacebookSDK, type EmbeddedSignupResult } from "@/hooks/use-facebook-sdk"

// --- Facebook icon (inline SVG to avoid extra dependency) ---
function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  )
}

// --- Embedded Signup Dialog Steps ---
type SignupStep = "connect" | "processing" | "payment" | "test"

interface SignupState {
  step: SignupStep
  accountId: string | null
  accountName: string | null
  error: string | null
  testPhone: string
  testSending: boolean
  testSent: boolean
}

const INITIAL_SIGNUP_STATE: SignupState = {
  step: "connect",
  accountId: null,
  accountName: null,
  error: null,
  testPhone: "",
  testSending: false,
  testSent: false,
}

// --- Helpers ---

interface TestResult {
  success: boolean
  error?: string
  display_phone_number?: string
  verified_name?: string
}

const WEBHOOK_URL = typeof window !== "undefined"
  ? `${window.location.origin}/api/webhook`
  : "/api/webhook"

function getStatusColor(status: string) {
  switch (status) {
    case "active": return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
    case "inactive": return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300"
    case "error": return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
    default: return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
  }
}

function copyToClipboard(text: string, label: string) {
  navigator.clipboard.writeText(text)
  toast.success(`${label} copied to clipboard`)
}

// --- Embedded Signup Dialog ---

function EmbeddedSignupDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const { isLoading: sdkLoading, isSDKReady, error: sdkError, loadSDK, launchEmbeddedSignup } = useFacebookSDK()
  const [state, setState] = useState<SignupState>(INITIAL_SIGNUP_STATE)

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setState(INITIAL_SIGNUP_STATE)
    }
  }, [open])

  async function handleConnect() {
    setState((s) => ({ ...s, error: null }))
    try {
      if (!isSDKReady) {
        await loadSDK()
      }
      const signupResult = await launchEmbeddedSignup()
      setState((s) => ({ ...s, step: "processing" }))
      await completeSignup(signupResult)
    } catch {
      // SDK errors are handled by the hook (sdkError state).
      // Only set state.error for non-SDK failures (popup cancel, etc.)
      if (isSDKReady) {
        setState((s) => ({ ...s, error: "Setup was cancelled or failed. You can try again." }))
      }
    }
  }

  async function completeSignup(signupResult: EmbeddedSignupResult) {
    try {
      const result = await apiClient.post<{ account_id: string; account_name: string }>(
        "/api/embedded-signup/complete",
        {
          code: signupResult.code,
          waba_id: signupResult.wabaId,
          phone_number_id: signupResult.phoneNumberId,
        }
      )
      queryClient.invalidateQueries({ queryKey: accountKeys.list() })
      setState((s) => ({
        ...s,
        step: "payment",
        accountId: result.account_id,
        accountName: result.account_name,
      }))
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to complete signup"
      setState((s) => ({ ...s, step: "connect", error: msg }))
    }
  }

  async function handleSendTest() {
    if (!state.accountId || !state.testPhone.trim()) return
    setState((s) => ({ ...s, testSending: true, error: null }))
    try {
      await apiClient.post("/api/embedded-signup/test-message", {
        account_id: state.accountId,
        phone_number: state.testPhone.trim(),
      })
      setState((s) => ({ ...s, testSending: false, testSent: true }))
      toast.success("Test message sent!")
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send test message"
      setState((s) => ({ ...s, testSending: false, error: msg }))
    }
  }

  function handleClose() {
    onOpenChange(false)
  }

  const showError = (sdkError || state.error) && state.step === "connect"
  const errorMessage = state.error || sdkError

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {state.step === "connect" && "Connect WhatsApp Business"}
            {state.step === "processing" && "Setting up your account..."}
            {state.step === "payment" && "Add a payment method"}
            {state.step === "test" && "Send a test message"}
          </DialogTitle>
          <DialogDescription>
            {state.step === "connect" && "Sign in with Facebook to connect your WhatsApp Business account automatically."}
            {state.step === "processing" && "We're configuring your account. This takes a few seconds."}
            {state.step === "payment" && "A payment method is required by Meta to send messages beyond the test limit."}
            {state.step === "test" && "Verify everything works by sending a quick test message."}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Connect */}
        {state.step === "connect" && (
          <div className="space-y-4 py-2">
            {showError && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground space-y-2">
                <p>This will:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Create or link a WhatsApp Business Account</li>
                  <li>Register a phone number for messaging</li>
                  <li>Configure webhooks automatically</li>
                </ul>
              </CardContent>
            </Card>
            <Button
              className="w-full cursor-pointer"
              size="lg"
              disabled={sdkLoading}
              onClick={handleConnect}
            >
              {sdkLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FacebookIcon className="h-4 w-4 mr-2" />
              )}
              {sdkLoading ? "Connecting..." : "Continue with Facebook"}
            </Button>
          </div>
        )}

        {/* Step 2: Processing */}
        {state.step === "processing" && (
          <div className="flex flex-col items-center py-8 gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Registering phone number and configuring webhooks...</p>
          </div>
        )}

        {/* Step 3: Payment */}
        {state.step === "payment" && (
          <div className="space-y-4 py-2">
            <div className="flex items-start gap-3 p-3 rounded-md bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200 text-sm">
              <CheckCircle2 className="h-5 w-5 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Account connected successfully!</p>
                {state.accountName && (
                  <p className="text-green-700 dark:text-green-300 mt-0.5">{state.accountName}</p>
                )}
              </div>
            </div>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Why add a payment method?</CardTitle>
                <CardDescription>
                  Meta requires a valid payment method in your WhatsApp Manager to send messages beyond the free test limit of 1,000 service conversations per month.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                <Button
                  variant="outline"
                  className="w-full cursor-pointer"
                  onClick={() => window.open("https://business.facebook.com/billing", "_blank")}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open WhatsApp Manager
                </Button>
              </CardContent>
            </Card>
            <DialogFooter className="flex-row gap-2 sm:justify-between">
              <Button
                variant="ghost"
                size="sm"
                className="cursor-pointer"
                onClick={() => setState((s) => ({ ...s, step: "test" }))}
              >
                Skip for now
              </Button>
              <Button
                size="sm"
                className="cursor-pointer"
                onClick={() => setState((s) => ({ ...s, step: "test" }))}
              >
                I&apos;ve added payment
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 4: Test */}
        {state.step === "test" && (
          <div className="space-y-4 py-2">
            {state.testSent ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <CheckCircle2 className="h-10 w-10 text-green-600" />
                <p className="font-medium">Test message sent!</p>
                <p className="text-sm text-muted-foreground text-center">
                  Check the WhatsApp app on the number you entered. If you don&apos;t see it, verify the number has WhatsApp installed.
                </p>
                <Button className="cursor-pointer mt-2" onClick={handleClose}>
                  Done
                </Button>
              </div>
            ) : (
              <>
                {state.error && (
                  <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{state.error}</span>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="test-phone">Phone number (with country code)</Label>
                  <Input
                    id="test-phone"
                    placeholder="e.g., 919876543210"
                    value={state.testPhone}
                    onChange={(e) => setState((s) => ({ ...s, testPhone: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter the full number without + or spaces. The recipient must have WhatsApp installed.
                  </p>
                </div>
                <DialogFooter className="flex-row gap-2 sm:justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="cursor-pointer"
                    onClick={handleClose}
                  >
                    Skip
                  </Button>
                  <Button
                    size="sm"
                    className="cursor-pointer"
                    disabled={!state.testPhone.trim() || state.testSending}
                    onClick={handleSendTest}
                  >
                    {state.testSending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    Send Test
                  </Button>
                </DialogFooter>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// --- Main Page ---

export default function AccountsPage() {
  const { data: accounts = [], isLoading } = useAccounts()
  const createAccount = useCreateAccount()
  const updateAccount = useUpdateAccount()
  const deleteAccount = useDeleteAccount()

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isSignupOpen, setIsSignupOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null)
  const [testingAccountId, setTestingAccountId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [formData, setFormData] = useState({
    name: "",
    app_id: "",
    phone_id: "",
    business_id: "",
    access_token: "",
    webhook_verify_token: "",
    api_version: "v21.0",
    is_default_incoming: false,
    is_default_outgoing: false,
    auto_read_receipt: false,
  })

  function updateForm(field: string, value: string | boolean) {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  function openCreate() {
    setEditingAccount(null)
    setFormData({
      name: "", app_id: "", phone_id: "", business_id: "", access_token: "",
      webhook_verify_token: "", api_version: "v21.0",
      is_default_incoming: false, is_default_outgoing: false, auto_read_receipt: false,
    })
    setIsDialogOpen(true)
  }

  function openEdit(account: Account) {
    setEditingAccount(account)
    setFormData({
      name: account.name,
      app_id: account.app_id || "",
      phone_id: account.phone_id,
      business_id: account.business_id,
      access_token: "",
      webhook_verify_token: account.webhook_verify_token || "",
      api_version: account.api_version || "v21.0",
      is_default_incoming: account.is_default_incoming,
      is_default_outgoing: account.is_default_outgoing,
      auto_read_receipt: account.auto_read_receipt,
    })
    setIsDialogOpen(true)
  }

  async function saveAccount() {
    if (!formData.name.trim() || !formData.phone_id.trim() || !formData.business_id.trim()) {
      toast.error("Please fill in all required fields")
      return
    }
    if (!editingAccount && !formData.access_token.trim()) {
      toast.error("Access token is required for new accounts")
      return
    }

    setIsSubmitting(true)
    const payload = { ...formData }
    if (editingAccount && !payload.access_token) {
      delete (payload as any).access_token
    }

    if (editingAccount) {
      updateAccount.mutate(
        { id: editingAccount.id, ...payload },
        {
          onSuccess: () => { toast.success("Account updated"); setIsDialogOpen(false) },
          onError: (err) => toast.error(err.message || "Failed to update account"),
          onSettled: () => setIsSubmitting(false),
        }
      )
    } else {
      createAccount.mutate(payload, {
        onSuccess: () => { toast.success("Account created"); setIsDialogOpen(false) },
        onError: (err) => toast.error(err.message || "Failed to create account"),
        onSettled: () => setIsSubmitting(false),
      })
    }
  }

  async function testConnection(account: Account) {
    setTestingAccountId(account.id)
    try {
      const result = await apiClient.post<TestResult>(`/api/accounts/${account.id}/test`)
      setTestResults((prev) => ({ ...prev, [account.id]: result }))
      if (result.success) {
        toast.success("Connection successful!")
      } else {
        toast.error("Connection failed: " + (result.error || "Unknown error"))
      }
    } catch (err: any) {
      const message = err.message || "Connection test failed"
      setTestResults((prev) => ({ ...prev, [account.id]: { success: false, error: message } }))
      toast.error(message)
    } finally {
      setTestingAccountId(null)
    }
  }

  function confirmDelete() {
    if (!accountToDelete) return
    deleteAccount.mutate(accountToDelete.id, {
      onSuccess: () => { toast.success("Account deleted"); setAccountToDelete(null) },
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
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">WhatsApp Accounts</h1>
          <p className="text-sm text-muted-foreground">Manage your WhatsApp Business accounts</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsSignupOpen(true)} className="cursor-pointer">
            <FacebookIcon className="h-4 w-4 mr-2" />
            Connect with Facebook
          </Button>
          <Button variant="outline" size="sm" onClick={openCreate} className="cursor-pointer">
            <Plus className="h-4 w-4 mr-2" />
            Add Account
          </Button>
        </div>
      </div>

      {/* Webhook URL Info */}
      <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div className="flex-1">
              <h4 className="font-medium text-blue-900 dark:text-blue-100">Webhook Configuration</h4>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                Configure this URL in your Meta Developer Console as the webhook callback URL:
              </p>
              <div className="flex items-center gap-2 mt-2">
                <code className="px-2 py-1 bg-blue-100 dark:bg-blue-900 rounded text-sm font-mono">
                  {WEBHOOK_URL}
                </code>
                <Button variant="ghost" size="sm" className="cursor-pointer" onClick={() => copyToClipboard(WEBHOOK_URL, "Webhook URL")}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account Cards */}
      {accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Phone className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No WhatsApp accounts connected</p>
            <p className="text-sm mb-4">Connect your WhatsApp Business account to start sending and receiving messages.</p>
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsSignupOpen(true)} className="cursor-pointer">
                <FacebookIcon className="h-4 w-4 mr-2" />
                Connect with Facebook
              </Button>
              <Button variant="outline" size="sm" onClick={openCreate} className="cursor-pointer">
                <Plus className="h-4 w-4 mr-2" />
                Add Account
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        accounts.map((account) => (
          <Card key={account.id}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center flex-shrink-0">
                    <Phone className="h-6 w-6 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-lg">{account.name}</h3>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor(account.status)}`}>
                        {account.status}
                      </span>
                    </div>

                    {/* Test Result */}
                    {testResults[account.id] && (
                      <div className="mt-2">
                        {testResults[account.id].success ? (
                          <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                            <CheckCircle2 className="h-4 w-4" />
                            <span className="text-sm font-medium">Connected</span>
                            {testResults[account.id].display_phone_number && (
                              <span className="text-sm text-muted-foreground">
                                - {testResults[account.id].display_phone_number}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                            <X className="h-4 w-4" />
                            <span className="text-sm">{testResults[account.id].error}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Account Details */}
                    <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                      {account.app_id && (
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">App ID:</span>
                          <code className="text-xs bg-muted px-1 rounded">{account.app_id}</code>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Phone ID:</span>
                        <code className="text-xs bg-muted px-1 rounded">{account.phone_id}</code>
                        <Button variant="ghost" size="icon" className="h-6 w-6 cursor-pointer" onClick={() => copyToClipboard(account.phone_id, "Phone ID")}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Business ID:</span>
                        <code className="text-xs bg-muted px-1 rounded">{account.business_id}</code>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">API Version:</span>
                        <span>{account.api_version}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Access Token:</span>
                        <Badge
                          variant="outline"
                          className={account.has_access_token ? "border-green-600 text-green-600" : "border-destructive text-destructive"}
                        >
                          {account.has_access_token ? "Configured" : "Missing"}
                        </Badge>
                      </div>
                    </div>

                    {/* Defaults */}
                    <div className="mt-3 flex items-center gap-3 flex-wrap">
                      {account.is_default_incoming && (
                        <Badge variant="outline"><Check className="h-3 w-3 mr-1" />Default Incoming</Badge>
                      )}
                      {account.is_default_outgoing && (
                        <Badge variant="outline"><Check className="h-3 w-3 mr-1" />Default Outgoing</Badge>
                      )}
                      {account.auto_read_receipt && (
                        <Badge variant="outline"><Check className="h-3 w-3 mr-1" />Auto Read Receipt</Badge>
                      )}
                    </div>

                    {/* Webhook Verify Token */}
                    {account.webhook_verify_token && (
                      <div className="mt-3 flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Verify Token:</span>
                        <code className="text-xs bg-muted px-2 py-0.5 rounded font-mono truncate max-w-[200px]">
                          {account.webhook_verify_token}
                        </code>
                        <Button variant="ghost" size="icon" className="h-6 w-6 cursor-pointer" onClick={() => copyToClipboard(account.webhook_verify_token, "Verify Token")}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="cursor-pointer"
                    disabled={testingAccountId === account.id}
                    onClick={() => testConnection(account)}
                  >
                    {testingAccountId === account.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <RefreshCw className="h-4 w-4" />
                    }
                    <span className="ml-1">Test</span>
                  </Button>
                  <Button variant="ghost" size="icon" className="cursor-pointer" onClick={() => openEdit(account)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="cursor-pointer text-destructive hover:text-destructive" onClick={() => setAccountToDelete(account)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {/* Setup Guide */}
      <Card>
        <CardContent className="p-6">
          <h3 className="font-semibold flex items-center gap-2 mb-4">
            <Settings2 className="h-5 w-5" />
            Setup Guide
          </h3>
          <ol className="list-decimal list-inside space-y-3 text-sm text-muted-foreground">
            <li>
              <strong className="text-foreground">Recommended:</strong> Click{" "}
              <strong className="text-foreground">Connect with Facebook</strong> above to set up automatically via Embedded Signup
            </li>
            <li>
              Or go to{" "}
              <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                Meta Developer Console <ExternalLink className="h-3 w-3" />
              </a>{" "}
              and create or select your app for manual setup
            </li>
            <li>Add WhatsApp product to your app and complete the setup</li>
            <li>In WhatsApp &gt; API Setup, copy your <strong className="text-foreground">Phone Number ID</strong> and <strong className="text-foreground">WhatsApp Business Account ID</strong></li>
            <li>
              Create a permanent access token in{" "}
              <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                Business Settings &gt; System Users <ExternalLink className="h-3 w-3" />
              </a>
            </li>
            <li>Configure the webhook URL and verify token in your Meta app settings</li>
            <li>Subscribe to messages webhook field</li>
          </ol>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAccount ? "Edit" : "Add"} WhatsApp Account</DialogTitle>
            <DialogDescription>
              Connect your WhatsApp Business account using the Meta Cloud API.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Account Name <span className="text-destructive">*</span></Label>
              <Input value={formData.name} onChange={(e) => updateForm("name", e.target.value)} placeholder="e.g., Main Business Line" />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Meta App ID</Label>
              <Input value={formData.app_id} onChange={(e) => updateForm("app_id", e.target.value)} placeholder="e.g., 123456789012345" />
              <p className="text-xs text-muted-foreground">Found in Meta Developer Console &gt; App Dashboard</p>
            </div>

            <div className="space-y-2">
              <Label>Phone Number ID <span className="text-destructive">*</span></Label>
              <Input value={formData.phone_id} onChange={(e) => updateForm("phone_id", e.target.value)} placeholder="e.g., 123456789012345" />
              <p className="text-xs text-muted-foreground">Found in Meta Developer Console &gt; WhatsApp &gt; API Setup</p>
            </div>

            <div className="space-y-2">
              <Label>WhatsApp Business Account ID <span className="text-destructive">*</span></Label>
              <Input value={formData.business_id} onChange={(e) => updateForm("business_id", e.target.value)} placeholder="e.g., 987654321098765" />
            </div>

            <div className="space-y-2">
              <Label>
                Access Token{" "}
                {!editingAccount
                  ? <span className="text-destructive">*</span>
                  : <span className="text-muted-foreground">(leave blank to keep existing)</span>
                }
              </Label>
              <Input type="password" value={formData.access_token} onChange={(e) => updateForm("access_token", e.target.value)} placeholder="Permanent access token from System User" />
              <p className="text-xs text-muted-foreground">Generate in Business Settings &gt; System Users &gt; Generate Token</p>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>API Version</Label>
              <Input value={formData.api_version} onChange={(e) => updateForm("api_version", e.target.value)} placeholder="v21.0" />
            </div>

            <div className="space-y-2">
              <Label>Webhook Verify Token</Label>
              <Input value={formData.webhook_verify_token} onChange={(e) => updateForm("webhook_verify_token", e.target.value)} placeholder="Auto-generated if empty" />
              <p className="text-xs text-muted-foreground">Used to verify webhook requests from Meta</p>
            </div>

            <Separator />

            <div className="space-y-4">
              <Label>Options</Label>
              <div className="flex items-center justify-between">
                <Label className="font-normal cursor-pointer">Default for incoming messages</Label>
                <Switch checked={formData.is_default_incoming} onCheckedChange={(v) => updateForm("is_default_incoming", v)} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="font-normal cursor-pointer">Default for outgoing messages</Label>
                <Switch checked={formData.is_default_outgoing} onCheckedChange={(v) => updateForm("is_default_outgoing", v)} />
              </div>
              <div className="flex items-center justify-between">
                <Label className="font-normal cursor-pointer">Automatically send read receipts</Label>
                <Switch checked={formData.auto_read_receipt} onCheckedChange={(v) => updateForm("auto_read_receipt", v)} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsDialogOpen(false)} className="cursor-pointer">Cancel</Button>
            <Button size="sm" onClick={saveAccount} disabled={isSubmitting} className="cursor-pointer">
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingAccount ? "Update" : "Create"} Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Embedded Signup Dialog */}
      <EmbeddedSignupDialog open={isSignupOpen} onOpenChange={setIsSignupOpen} />

      {/* Delete Confirmation */}
      <AlertDialog open={!!accountToDelete} onOpenChange={(open) => !open && setAccountToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{accountToDelete?.name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="cursor-pointer bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
