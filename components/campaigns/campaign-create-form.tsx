"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Loader2, Users } from "lucide-react"
import { useAccounts } from "@/hooks/queries/use-accounts"
import { useTemplates } from "@/hooks/queries/use-templates"
import { useChatbotFlows } from "@/hooks/queries/use-chatbot"
import { useFlowVariables } from "@/hooks/queries/use-flow-variables"
import { useCreateCampaign, usePreviewAudience } from "@/hooks/queries/use-campaigns"
import { toApiFilter } from "@/hooks/queries/use-contact-filters"
import { useContactFilterUI } from "@/components/chat/contact-list/contact-filter"
import { SearchablePicker } from "./searchable-picker"
import { InfoBanner24hr } from "./info-banner-24hr"
import { VariableMappingForm } from "./variable-mapping-form"
import { AudiencePickerSamplingCentral } from "./audience-picker-sampling-central"
import type { AudiencePreview } from "@/types/campaigns"
import type { ContactFilter } from "@/types/chat"

// v1 audience sources exposed in the form. "csv" is registered so users can
// see the tab, but the tab body renders a "coming soon" state — the backend
// CSV import path is a 2-step flow (create draft → import recipients) that
// needs its own UX pass.
const AUDIENCE_SOURCES = ["contacts", "sampling-central", "csv"] as const
type AudienceSourceValue = (typeof AUDIENCE_SOURCES)[number]

const schema = z
  .object({
    name: z.string().min(1, "Name is required"),
    account_name: z.string().min(1, "Account is required"),
    type: z.enum(["template", "flow"]),
    template_id: z.string().optional(),
    flow_id: z.string().optional(),
    audience_source: z.enum(AUDIENCE_SOURCES),
    sc_audience_id: z.string().optional(),
  })
  .refine((data) => (data.type === "template" ? !!data.template_id : !!data.flow_id), {
    message: "Pick a template or flow",
    path: ["template_id"],
  })
  .refine(
    (data) => data.audience_source !== "sampling-central" || !!data.sc_audience_id,
    {
      message: "Audience ID is required",
      path: ["sc_audience_id"],
    },
  )
  .refine((data) => data.audience_source !== "csv", {
    message: "CSV upload is coming in a follow-up — pick Contacts or Sampling Central",
    path: ["audience_source"],
  })

type FormValues = z.infer<typeof schema>

// Extract {{name}} refs from template body (ignore dotted names like session.x)
function extractTemplatePlaceholders(body: string | undefined): string[] {
  if (!body) return []
  const set = new Set<string>()
  for (const m of body.matchAll(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g)) {
    const name = m[1]
    if (!name.includes(".")) set.add(name)
  }
  return Array.from(set)
}

const EMPTY_FILTER: ContactFilter = { logic: "and", filters: [] }

export function CampaignCreateForm() {
  const router = useRouter()
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      account_name: "",
      type: "template",
      audience_source: "contacts",
    },
  })

  // Existing hooks — verified signatures:
  //   useAccounts() → Account[] directly
  //   useTemplates("APPROVED") → any[] directly (uppercase APPROVED matches backend enum)
  //   useChatbotFlows() → ChatbotFlow[] directly (NOT { flows: [...] })
  const { data: accounts } = useAccounts()
  const { data: templates } = useTemplates("APPROVED")
  const { data: flows } = useChatbotFlows()
  const { mutateAsync: createCampaign, isPending } = useCreateCampaign()

  const type = form.watch("type")
  const audienceSource = form.watch("audience_source")
  const templateId = form.watch("template_id")
  const flowId = form.watch("flow_id")

  const { data: flowVars } = useFlowVariables(type === "flow" ? flowId : undefined)

  // SC-specific state — preview blob + column mapping for the variable form
  const [scPreview, setScPreview] = useState<AudiencePreview | null>(null)
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})

  // Contacts-specific state — ContactFilter tree + live count
  const [contactFilter, setContactFilter] = useState<ContactFilter>(EMPTY_FILTER)
  const [contactCount, setContactCount] = useState<number | null>(null)
  const previewAudience = usePreviewAudience()
  const { filterButton, filterTree } = useContactFilterUI({
    rootFilter: contactFilter,
    onRootFilterChange: (next) => {
      setContactFilter(next)
      setContactCount(null) // invalidate stale count on any filter change
    },
  })

  // Variables that need mapping (SC only — contacts source doesn't do per-row variable injection)
  const variablesToMap: string[] = (() => {
    if (audienceSource !== "sampling-central") return []
    if (type === "flow") return flowVars?.variables ?? []
    if (type === "template" && templateId) {
      const t = (templates ?? []).find((tpl: any) => tpl.id === templateId)
      return extractTemplatePlaceholders(t?.body_content)
    }
    return []
  })()

  const handleContactsPreview = async () => {
    const res = await previewAudience.mutateAsync({
      source: "contacts",
      filter: toApiFilter(contactFilter),
    })
    setContactCount(res.total_count)
  }

  const onSubmit = async (values: FormValues) => {
    // Per-source validation
    if (values.audience_source === "sampling-central") {
      if (!scPreview) {
        form.setError("sc_audience_id", { message: "Fetch the audience first" })
        return
      }
    } else if (values.audience_source === "contacts") {
      const hasConditions = (contactFilter.filters ?? []).some(
        (g) => (g.filters ?? []).length > 0,
      )
      if (!hasConditions) {
        form.setError("audience_source", {
          message: "Build at least one filter condition",
        })
        return
      }
    }

    // Build audience_config per source
    let audience_config: unknown
    if (values.audience_source === "sampling-central") {
      audience_config = {
        audience_id: values.sc_audience_id!,
        column_mapping: columnMapping,
      }
    } else if (values.audience_source === "contacts") {
      audience_config = {
        filter: toApiFilter(contactFilter),
        channel: "whatsapp",
      }
    } else {
      return // csv is blocked by zod
    }

    const res = await createCampaign({
      name: values.name,
      account_name: values.account_name,
      template_id: values.type === "template" ? values.template_id! : null,
      flow_id: values.type === "flow" ? values.flow_id! : null,
      audience_source: values.audience_source,
      audience_config,
      schedule_at: null,
    })
    router.push(`/campaigns/${res.id}`)
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        {/* Name */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Campaign name</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Diwali Promo 2026" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Account */}
        <FormField
          control={form.control}
          name="account_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>WhatsApp account</FormLabel>
              <FormControl>
                <SearchablePicker
                  value={field.value}
                  onValueChange={field.onChange}
                  options={(accounts ?? []).map((a: any) => ({ value: a.name, label: a.name }))}
                  placeholder="Pick an account..."
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Type + picker */}
        <div className="flex flex-col gap-3">
          <Label>Send</Label>
          <Controller
            control={form.control}
            name="type"
            render={({ field }) => (
              <Tabs value={field.value} onValueChange={(v) => field.onChange(v)}>
                <TabsList className="w-fit">
                  <TabsTrigger value="template" className="cursor-pointer">
                    Template
                  </TabsTrigger>
                  <TabsTrigger value="flow" className="cursor-pointer">
                    Flow
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="template" className="mt-3">
                  <FormField
                    control={form.control}
                    name="template_id"
                    render={({ field: tfield }) => (
                      <FormItem>
                        <FormControl>
                          <SearchablePicker
                            value={tfield.value ?? ""}
                            onValueChange={tfield.onChange}
                            options={(templates ?? []).map((t: any) => ({
                              value: t.id,
                              label: t.name,
                            }))}
                            placeholder="Pick a template..."
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>

                <TabsContent value="flow" className="mt-3 space-y-3">
                  <FormField
                    control={form.control}
                    name="flow_id"
                    render={({ field: ffield }) => (
                      <FormItem>
                        <FormControl>
                          <SearchablePicker
                            value={ffield.value ?? ""}
                            onValueChange={ffield.onChange}
                            options={(flows ?? []).map((f) => ({
                              value: f.id,
                              label: f.name,
                            }))}
                            placeholder="Pick a flow..."
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <InfoBanner24hr />
                </TabsContent>
              </Tabs>
            )}
          />
        </div>

        {/* Audience — three sources */}
        <div className="flex flex-col gap-3">
          <Label>Audience</Label>
          <Controller
            control={form.control}
            name="audience_source"
            render={({ field }) => (
              <Tabs
                value={field.value}
                onValueChange={(v) => {
                  field.onChange(v as AudienceSourceValue)
                  // clear per-source state so switching tabs doesn't leak state
                  setScPreview(null)
                  setContactCount(null)
                  form.clearErrors("audience_source")
                  form.clearErrors("sc_audience_id")
                }}
              >
                <TabsList className="w-fit">
                  <TabsTrigger value="contacts" className="cursor-pointer">
                    Contacts
                  </TabsTrigger>
                  <TabsTrigger value="sampling-central" className="cursor-pointer">
                    Sampling Central
                  </TabsTrigger>
                  <TabsTrigger value="csv" className="cursor-pointer">
                    CSV
                  </TabsTrigger>
                </TabsList>

                {/* Contacts tab — reuses useContactFilterUI from the chat sidebar */}
                <TabsContent value="contacts" className="mt-3 space-y-3">
                  <div className="flex items-center gap-2">
                    {filterButton}
                    <span className="text-sm text-muted-foreground">
                      Build a filter to target contacts by tags, flow activity, or variables
                    </span>
                  </div>
                  {filterTree}
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleContactsPreview}
                      disabled={previewAudience.isPending}
                      className="cursor-pointer"
                    >
                      {previewAudience.isPending ? (
                        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      Preview count
                    </Button>
                    {contactCount !== null && (
                      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Users className="h-3.5 w-3.5" />
                        {contactCount.toLocaleString()} contacts match
                      </span>
                    )}
                  </div>
                </TabsContent>

                {/* Sampling-central tab */}
                <TabsContent value="sampling-central" className="mt-3">
                  <FormField
                    control={form.control}
                    name="sc_audience_id"
                    render={({ field: scField }) => (
                      <FormItem>
                        <FormControl>
                          <AudiencePickerSamplingCentral
                            value={scField.value ?? ""}
                            onChange={scField.onChange}
                            onPreviewLoaded={setScPreview}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>

                {/* CSV tab — coming soon */}
                <TabsContent value="csv" className="mt-3">
                  <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                    CSV upload is coming in a follow-up. For now use Contacts or Sampling Central.
                  </div>
                </TabsContent>
              </Tabs>
            )}
          />
          <FormField
            control={form.control}
            name="audience_source"
            render={() => (
              <FormItem>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Variable mapping — only for SC source (contacts uses the contact's own stored vars) */}
        {audienceSource === "sampling-central" && scPreview && variablesToMap.length > 0 && (
          <VariableMappingForm
            variables={variablesToMap}
            availableColumns={scPreview.available_columns}
            value={columnMapping}
            onChange={setColumnMapping}
          />
        )}

        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={isPending} className="cursor-pointer">
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Start Campaign
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/campaigns")}
            className="cursor-pointer"
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  )
}
