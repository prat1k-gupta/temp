// @vitest-environment jsdom
import React from "react"
import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react"
import { useForm, FormProvider, useFormContext } from "react-hook-form"

// Radix Select portals make assertions on option clicks difficult in jsdom.
// Stub the shadcn Select facade with a plain <select>; this preserves the
// component's observable behavior (onValueChange fires on change) without the
// portal complications.
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string
    onValueChange: (v: string) => void
    children: React.ReactNode
  }) => (
    <select
      data-testid="column-select"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
    >
      <option value="">(empty)</option>
      {React.Children.map(children, (child) => child)}
    </select>
  ),
  // Trigger/Value are no-ops inside the stubbed <select>.
  SelectTrigger: () => null,
  SelectValue: () => null,
  // Render content/items inline so <option> nodes appear inside our stub.
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({
    value,
    children,
  }: {
    value: string
    children: React.ReactNode
  }) => <option value={value}>{children}</option>,
}))

import { FreestandClaimantAudienceFields } from "../freestand-claimant-audience-fields"

interface WrapperProps {
  onAudienceIdChange?: (id: string) => void
  previewCount?: number | null
  previewError?: string | null
  defaultValues?: Record<string, unknown>
}

function Harness({
  onAudienceIdChange = () => {},
  previewCount = null,
  previewError = null,
  defaultValues = {},
  onFormReady,
}: WrapperProps & { onFormReady?: (form: ReturnType<typeof useForm>) => void }) {
  const methods = useForm({ defaultValues })
  // Expose form for assertions without relying on external refs.
  onFormReady?.(methods)
  return (
    <FormProvider {...methods}>
      <FreestandClaimantAudienceFields
        onAudienceIdChange={onAudienceIdChange}
        previewCount={previewCount}
        previewError={previewError}
      />
    </FormProvider>
  )
}

// Read-only probe that dumps the current form value for a given path.
function FormProbe({ path }: { path: string }) {
  const { watch } = useFormContext()
  return <span data-testid={`probe-${path}`}>{JSON.stringify(watch(path))}</span>
}

afterEach(() => cleanup())

describe("FreestandClaimantAudienceFields", () => {
  it("renders Audience ID input and the first mapping row with Add mapping", () => {
    render(<Harness />)
    expect(screen.getByLabelText(/audience id/i)).toBeTruthy()
    expect(screen.getByText(/add mapping/i)).toBeTruthy()
  })

  it("shows claimants count when previewCount is provided", () => {
    render(<Harness previewCount={3247} />)
    expect(screen.getByText(/3,247 claimants/)).toBeTruthy()
  })

  it("shows warning text when previewError is provided (no submit gating)", () => {
    render(<Harness previewError="backend timeout" />)
    expect(screen.getByText(/could not preview audience.*backend timeout/i)).toBeTruthy()
  })

  it("calls onAudienceIdChange after a 500ms debounce for a valid UUID", () => {
    const onAudienceIdChange = vi.fn()
    // Pre-seed the audience_id via defaultValues so react-hook-form's watch()
    // has a value on first render; the debounce effect will fire on mount.
    const validUuid = "abcdef01-2345-6789-abcd-ef0123456789"
    vi.useFakeTimers()
    try {
      render(
        <Harness
          onAudienceIdChange={onAudienceIdChange}
          defaultValues={{ audience_config: { audience_id: validUuid } }}
        />,
      )
      expect(onAudienceIdChange).not.toHaveBeenCalled()
      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(onAudienceIdChange).toHaveBeenCalledWith(validUuid)
    } finally {
      vi.useRealTimers()
    }
  })

  it("does not call onAudienceIdChange for an invalid UUID", () => {
    const onAudienceIdChange = vi.fn()
    vi.useFakeTimers()
    try {
      render(
        <Harness
          onAudienceIdChange={onAudienceIdChange}
          defaultValues={{ audience_config: { audience_id: "not-a-uuid" } }}
        />,
      )
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      expect(onAudienceIdChange).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it("adds and removes mapping rows (last row's trash is disabled)", () => {
    render(<Harness />)

    // Only the initial row exists → one column-select, one trash button.
    expect(screen.getAllByTestId("column-select")).toHaveLength(1)

    // The single trash button should be disabled on the only remaining row.
    const initialTrashes = screen
      .getAllByRole("button")
      .filter((b) => b.querySelector("svg") && !/add mapping/i.test(b.textContent ?? ""))
    expect(initialTrashes[0]).toHaveProperty("disabled", true)

    // Click Add mapping → now two rows.
    fireEvent.click(screen.getByText(/add mapping/i))
    expect(screen.getAllByTestId("column-select")).toHaveLength(2)

    // Click the trash on the second row → back to one row.
    const trashesAfterAdd = screen
      .getAllByRole("button")
      .filter((b) => b.querySelector("svg") && !/add mapping/i.test(b.textContent ?? ""))
    expect(trashesAfterAdd).toHaveLength(2)
    fireEvent.click(trashesAfterAdd[1])
    expect(screen.getAllByTestId("column-select")).toHaveLength(1)

    // Trash on the now-only row is disabled again.
    const trashesAfterRemove = screen
      .getAllByRole("button")
      .filter((b) => b.querySelector("svg") && !/add mapping/i.test(b.textContent ?? ""))
    expect(trashesAfterRemove[0]).toHaveProperty("disabled", true)
  })

  it("writes the selected column + flow variable into audience_config.column_mapping", () => {
    render(
      <>
        <Harness />
        {/* Render a probe inside its own provider via the same Harness to share context. */}
      </>,
    )

    // Type the flow variable name.
    const flowVarInput = screen.getByPlaceholderText(/flow variable/i) as HTMLInputElement
    fireEvent.change(flowVarInput, { target: { value: "customer_name" } })

    // Pick a column value from the stubbed <select>.
    const select = screen.getByTestId("column-select") as HTMLSelectElement
    fireEvent.change(select, { target: { value: "name" } })

    // The effect writes into audience_config.column_mapping on the shared form.
    // We can't assert on the form directly without a probe, so verify that the
    // inputs reflect the selection (the behavior the user sees).
    expect(flowVarInput.value).toBe("customer_name")
    expect(select.value).toBe("name")
  })
})

describe("FreestandClaimantAudienceFields column_mapping form value", () => {
  it("populates audience_config.column_mapping when row is filled", () => {
    let formRef: ReturnType<typeof useForm> | undefined
    render(
      <Harness
        onFormReady={(f) => {
          formRef = f
        }}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText(/flow variable/i), {
      target: { value: "customer_name" },
    })
    fireEvent.change(screen.getByTestId("column-select"), {
      target: { value: "name" },
    })

    expect(formRef).toBeDefined()
    expect(formRef!.getValues("audience_config.column_mapping")).toEqual({
      customer_name: "name",
    })
  })
})
