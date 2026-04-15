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
import { Loader2 } from "lucide-react"
import { useAccounts } from "@/hooks/queries/use-accounts"
import { useTemplates } from "@/hooks/queries/use-templates"
import { useChatbotFlows } from "@/hooks/queries/use-chatbot"
import { useFlowVariables } from "@/hooks/queries/use-flow-variables"
import { useCreateCampaign } from "@/hooks/queries/use-campaigns"
import { SearchablePicker } from "./searchable-picker"
import { InfoBanner24hr } from "./info-banner-24hr"
import { VariableMappingForm } from "./variable-mapping-form"
import { AudiencePickerSamplingCentral } from "./audience-picker-sampling-central"
import type { AudiencePreview } from "@/types/campaigns"

const schema = z
  .object({
    name: z.string().min(1, "Name is required"),
    account_name: z.string().min(1, "Account is required"),
    type: z.enum(["template", "flow"]),
    template_id: z.string().optional(),
    flow_id: z.string().optional(),
    audience_source: z.enum(["sampling-central"]),
    sc_audience_id: z.string().optional(),
  })
  .refine((data) => (data.type === "template" ? !!data.template_id : !!data.flow_id), {
    message: "Pick a template or flow",
    path: ["template_id"],
  })
  .refine((data) => !!data.sc_audience_id, {
    message: "Audience ID is required",
    path: ["sc_audience_id"],
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

export function CampaignCreateForm() {
  const router = useRouter()
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      account_name: "",
      type: "template",
      audience_source: "sampling-central",
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
  const templateId = form.watch("template_id")
  const flowId = form.watch("flow_id")

  const { data: flowVars } = useFlowVariables(type === "flow" ? flowId : undefined)
  const [preview, setPreview] = useState<AudiencePreview | null>(null)
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})

  // Variables that need mapping
  const variablesToMap: string[] = (() => {
    if (type === "flow") return flowVars?.variables ?? []
    if (type === "template" && templateId) {
      const t = (templates ?? []).find((tpl: any) => tpl.id === templateId)
      return extractTemplatePlaceholders(t?.body_content)
    }
    return []
  })()

  const onSubmit = async (values: FormValues) => {
    if (!preview) {
      form.setError("sc_audience_id", { message: "Fetch the audience first" })
      return
    }
    const res = await createCampaign({
      name: values.name,
      account_name: values.account_name,
      template_id: values.type === "template" ? values.template_id! : null,
      flow_id: values.type === "flow" ? values.flow_id! : null,
      audience_source: "sampling-central",
      audience_config: {
        audience_id: values.sc_audience_id!,
        column_mapping: columnMapping,
      },
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

        {/* Audience — SC only in v1 */}
        <div className="flex flex-col gap-3">
          <Label>Audience</Label>
          <FormField
            control={form.control}
            name="sc_audience_id"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <AudiencePickerSamplingCentral
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    onPreviewLoaded={setPreview}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Variable mapping — only shown after preview + when vars exist */}
        {preview && variablesToMap.length > 0 && (
          <VariableMappingForm
            variables={variablesToMap}
            availableColumns={preview.available_columns}
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
