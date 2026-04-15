"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { PageHeader } from "@/components/page-header"
import {
  BookUser,
  Building2,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  Hash,
  Loader2,
  Send,
  Sparkles,
  Upload,
  Users,
  Zap,
} from "lucide-react"
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

// v1 audience sources. "csv" renders a coming-soon tab body; the 2-step CSV
// backend path (create draft → import recipients) needs its own UX pass.
const AUDIENCE_SOURCES = ["contacts", "sampling-central", "csv"] as const
type AudienceSourceValue = (typeof AUDIENCE_SOURCES)[number]

// Channels shown in the picker. Only whatsapp is wired; instagram/line are
// display-only "Coming Soon" placeholders mirroring the rest of the product.
type ChannelValue = "whatsapp" | "instagram" | "line"

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
  // superRefine lets us emit template_id / flow_id errors on the correct field
  // path depending on which send type the user picked. A plain .refine() can
  // only attach to one hardcoded path, which silently swallowed the error on
  // the hidden field when the user picked the other send type.
  .superRefine((data, ctx) => {
    if (data.type === "template" && !data.template_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Pick a template",
        path: ["template_id"],
      })
    }
    if (data.type === "flow" && !data.flow_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Pick a flow",
        path: ["flow_id"],
      })
    }
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

// Shared card shell for form sections. Keeps section chrome consistent and
// local to this file — every card has an icon header + muted subtitle.
function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Sparkles
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b bg-muted/30">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-medium text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="p-6 flex flex-col gap-5">{children}</div>
    </div>
  )
}

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

  // Channel is UI-only for now — backend only supports whatsapp. Kept as local
  // state (not form state) because it's not submitted.
  const [channel, setChannel] = useState<ChannelValue>("whatsapp")

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
  // Debounce handle for auto-preview so rapid filter commits (add then remove
  // a condition) only fire a single API call after things settle.
  const previewDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { filterButton, filterTree } = useContactFilterUI({
    rootFilter: contactFilter,
    onRootFilterChange: (next) => {
      setContactFilter(next)
      if (previewDebounce.current) clearTimeout(previewDebounce.current)
      const hasConditions = (next.filters ?? []).some(
        (g) => (g.filters ?? []).length > 0,
      )
      if (!hasConditions) {
        setContactCount(null)
        return
      }
      previewDebounce.current = setTimeout(() => {
        previewAudience
          .mutateAsync({ source: "contacts", filter: toApiFilter(next) })
          .then((res) => setContactCount(res.total_count))
          .catch(() => setContactCount(null))
      }, 250)
    },
  })

  const variablesToMap: string[] = (() => {
    if (audienceSource !== "sampling-central") return []
    if (type === "flow") return flowVars?.variables ?? []
    if (type === "template" && templateId) {
      const t = (templates ?? []).find((tpl: { id: string }) => tpl.id === templateId)
      return extractTemplatePlaceholders((t as { body_content?: string })?.body_content)
    }
    return []
  })()

  const onSubmit = async (values: FormValues) => {
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
      return
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
        {/* Page header owns the Cancel / Create Draft actions via children so
            they sit inline with the title instead of floating below it. */}
        <PageHeader title="New Campaign">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push("/campaigns")}
              className="cursor-pointer text-muted-foreground"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="cursor-pointer px-6">
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Draft
            </Button>
          </div>
        </PageHeader>

        {/* Two-column layout: v1 (Campaign Details stacked over Send Options)
            on the left, v2 (Audience) on the right. Stacks vertically below
            lg so narrow viewports remain readable. items-start so the two
            columns size to their own content (Audience can grow tall without
            stretching Send Options). */}
        <div className="grid gap-4 lg:grid-cols-2 items-start">
          {/* v1 — left column */}
          <div className="flex flex-col gap-4">
            {/* Campaign Details */}
            <SectionCard
              icon={Sparkles}
              title="Campaign Details"
              description="Name and channel configuration"
            >
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="max-w-md">
                <FormLabel className="text-sm text-muted-foreground flex items-center gap-2">
                  <Hash className="h-3.5 w-3.5" />
                  Campaign name
                </FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g. Diwali Promo 2026"
                    className="h-11"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex flex-col gap-3">
            <Label className="text-sm text-muted-foreground">Channel</Label>
            <div className="grid grid-cols-3 gap-3 max-w-xl">
              <ChannelButton
                active={channel === "whatsapp"}
                onClick={() => setChannel("whatsapp")}
                label="WhatsApp"
                sublabel="Business API"
                activeIconBg="bg-[#25D366]/10"
                activeIconColor="text-[#25D366]"
                icon={
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                }
              />
              <ChannelButton
                disabled
                comingSoon
                label="Instagram"
                sublabel="Direct Messages"
                activeIconBg=""
                activeIconColor=""
                icon={
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                  </svg>
                }
              />
              <ChannelButton
                disabled
                comingSoon
                label="LINE"
                sublabel="Official Account"
                activeIconBg=""
                activeIconColor=""
                icon={
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                    <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.349 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
                  </svg>
                }
              />
            </div>
          </div>

          <FormField
            control={form.control}
            name="account_name"
            render={({ field }) => (
              <FormItem className="max-w-md">
                <FormLabel className="text-sm text-muted-foreground flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5" />
                  WhatsApp account
                </FormLabel>
                <FormControl>
                  <SearchablePicker
                    value={field.value}
                    onValueChange={field.onChange}
                    options={(accounts ?? []).map((a) => ({ value: a.name, label: a.name }))}
                    placeholder="Pick an account..."
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
            </SectionCard>

            {/* Send Options */}
            <SectionCard
              icon={Send}
              title="Send Options"
              description="Choose how to deliver your campaign"
            >
          <Controller
            control={form.control}
            name="type"
            render={({ field }) => (
              <div className="flex flex-col gap-3">
                <Label className="text-sm text-muted-foreground">Send type</Label>
                <div className="grid grid-cols-2 gap-3 max-w-md">
                  <SendTypeButton
                    active={field.value === "template"}
                    onClick={() => field.onChange("template")}
                    icon={<FileText className="h-5 w-5" />}
                    label="Template"
                    sublabel="Pre-approved message"
                  />
                  <SendTypeButton
                    active={field.value === "flow"}
                    onClick={() => field.onChange("flow")}
                    icon={<Zap className="h-5 w-5" />}
                    label="Flow"
                    sublabel="Automated sequence"
                  />
                </div>
              </div>
            )}
          />

          {type === "template" ? (
            <FormField
              control={form.control}
              name="template_id"
              render={({ field }) => (
                <FormItem className="max-w-md">
                  <FormLabel className="text-sm text-muted-foreground flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5" />
                    Select template
                  </FormLabel>
                  <FormControl>
                    <SearchablePicker
                      value={field.value ?? ""}
                      onValueChange={field.onChange}
                      options={(templates ?? []).map((t: { id: string; name: string }) => ({
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
          ) : (
            <>
              <FormField
                control={form.control}
                name="flow_id"
                render={({ field }) => (
                  <FormItem className="max-w-md">
                    <FormLabel className="text-sm text-muted-foreground flex items-center gap-2">
                      <Zap className="h-3.5 w-3.5" />
                      Select flow
                    </FormLabel>
                    <FormControl>
                      <SearchablePicker
                        value={field.value ?? ""}
                        onValueChange={field.onChange}
                        options={(flows ?? []).map((f) => ({ value: f.id, label: f.name }))}
                        placeholder="Pick a flow..."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <InfoBanner24hr className="max-w-2xl" />
            </>
          )}
            </SectionCard>
          </div>

          {/* v2 — right column (Audience fills the full column height) */}
          <SectionCard
            icon={Users}
            title="Audience"
            description="Define who will receive this campaign"
          >
          <Controller
            control={form.control}
            name="audience_source"
            render={({ field }) => {
              const selectSource = (v: AudienceSourceValue) => {
                field.onChange(v)
                setScPreview(null)
                setContactCount(null)
                form.clearErrors("audience_source")
                form.clearErrors("sc_audience_id")
              }
              return (
                <div className="flex flex-col gap-3">
                  <Label className="text-sm text-muted-foreground">
                    Select audience source
                  </Label>
                  <div className="grid grid-cols-3 gap-3 max-w-xl">
                    <SendTypeButton
                      active={field.value === "contacts"}
                      onClick={() => selectSource("contacts")}
                      icon={<BookUser className="h-5 w-5" />}
                      label="Contacts"
                      sublabel="Filter your CRM"
                    />
                    <SendTypeButton
                      active={field.value === "sampling-central"}
                      onClick={() => selectSource("sampling-central")}
                      icon={<FlaskConical className="h-5 w-5" />}
                      label="Sampling Central"
                      sublabel="External audience"
                    />
                    <SendTypeButton
                      active={field.value === "csv"}
                      onClick={() => selectSource("csv")}
                      icon={<FileSpreadsheet className="h-5 w-5" />}
                      label="CSV"
                      sublabel="Import a file"
                    />
                  </div>
                </div>
              )
            }}
          />

          {audienceSource === "contacts" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                {filterButton}
                <span className="text-sm text-muted-foreground">
                  Build a filter to target contacts by tags, flow activity, or variables
                </span>
              </div>
              {filterTree}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {previewAudience.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Counting matching contacts…</span>
                  </>
                ) : contactCount !== null ? (
                  <>
                    <Users className="h-3.5 w-3.5" />
                    <span>
                      {contactCount.toLocaleString()} contacts match
                    </span>
                  </>
                ) : (
                  <span className="text-xs">
                    Add a filter condition to see the match count.
                  </span>
                )}
              </div>
            </div>
          )}

          {audienceSource === "sampling-central" && (
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
          )}

          {audienceSource === "csv" && (
            <div className="rounded-lg border border-dashed bg-muted/20 p-8">
              <div className="flex flex-col items-center justify-center text-center">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
                  <Upload className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-sm font-medium text-foreground mb-1">
                  Upload CSV file
                </h3>
                <p className="text-sm text-muted-foreground max-w-sm mb-4">
                  Import contacts from a CSV file. Support for uploads is landing in a
                  follow-up — pick Contacts or Sampling Central for now.
                </p>
                <Button type="button" variant="outline" disabled className="gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  Select file
                </Button>
                <p className="text-xs text-muted-foreground mt-3">
                  Supports .csv files up to 10 MB
                </p>
              </div>
            </div>
          )}

          <FormField
            control={form.control}
            name="audience_source"
            render={() => (
              <FormItem>
                <FormMessage />
              </FormItem>
            )}
          />
          </SectionCard>
        </div>

        {/* Variable mapping — only for SC source, rendered below the grid so
            it can span the full width if the column list is long. */}
        {audienceSource === "sampling-central" && scPreview && variablesToMap.length > 0 && (
          <VariableMappingForm
            variables={variablesToMap}
            availableColumns={scPreview.available_columns}
            value={columnMapping}
            onChange={setColumnMapping}
          />
        )}
      </form>
    </Form>
  )
}

// Big card-style button for the channel picker. Disabled channels render a
// "Coming Soon" pill and use muted styling regardless of state.
function ChannelButton({
  active,
  disabled,
  comingSoon,
  onClick,
  icon,
  label,
  sublabel,
  activeIconBg,
  activeIconColor,
}: {
  active?: boolean
  disabled?: boolean
  comingSoon?: boolean
  onClick?: () => void
  icon: React.ReactNode
  label: string
  sublabel: string
  activeIconBg: string
  activeIconColor: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative flex items-center gap-3 p-4 rounded-lg border text-left transition-all",
        active && "border-primary bg-primary/5 ring-1 ring-primary/20",
        !active && !disabled && "border-border bg-muted/30 hover:border-muted-foreground/30 cursor-pointer",
        disabled && "border-border bg-muted/20 opacity-60 cursor-not-allowed",
      )}
    >
      {comingSoon && (
        <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-muted border rounded-full">
          <span className="text-[10px] font-medium text-muted-foreground">Coming Soon</span>
        </div>
      )}
      <div
        className={cn(
          "flex items-center justify-center w-10 h-10 rounded-lg shrink-0",
          active ? activeIconBg : "bg-muted",
        )}
      >
        <span className={cn(active ? activeIconColor : "text-muted-foreground")}>{icon}</span>
      </div>
      <div className="min-w-0">
        <div
          className={cn(
            "text-sm font-medium truncate",
            active ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {label}
        </div>
        <div className="text-xs text-muted-foreground truncate">{sublabel}</div>
      </div>
    </button>
  )
}

// Big card-style button for the send-type picker (Template vs Flow).
function SendTypeButton({
  active,
  onClick,
  icon,
  label,
  sublabel,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  sublabel: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 p-4 rounded-lg border text-left transition-all cursor-pointer",
        active
          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
          : "border-border bg-muted/30 hover:border-muted-foreground/30",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center w-10 h-10 rounded-lg shrink-0",
          active ? "bg-primary/10" : "bg-muted",
        )}
      >
        <span className={cn(active ? "text-primary" : "text-muted-foreground")}>{icon}</span>
      </div>
      <div className="min-w-0">
        <div
          className={cn(
            "text-sm font-medium truncate",
            active ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {label}
        </div>
        <div className="text-xs text-muted-foreground truncate">{sublabel}</div>
      </div>
    </button>
  )
}
