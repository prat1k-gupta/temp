// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import type { Campaign } from "@/types/campaigns"

// Stub the Progress UI so we can inspect the `value` prop directly and avoid
// Radix internals that aren't relevant to this component's contract.
vi.mock("@/components/ui/progress", () => ({
  Progress: ({ value, ...rest }: { value: number; className?: string }) => (
    <div data-testid="progress" data-value={String(value)} {...rest} />
  ),
}))

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "c1",
    name: "Test",
    account_name: "acct",
    template_id: null,
    flow_id: null,
    audience_source: "freestand-claimant",
    source_system: null,
    source_external_id: null,
    status: "draft",
    total_recipients: 0,
    materialized_count: null,
    audience_total: null,
    recipients_completed: 0,
    sent_count: 0,
    delivered_count: 0,
    read_count: 0,
    failed_count: 0,
    scheduled_at: null,
    started_at: null,
    completed_at: null,
    created_at: "2026-04-18T00:00:00Z",
    ...overrides,
  }
}

// Import after mocks so the production file picks up the stubbed Progress.
import { MaterializationProgress } from "../materialization-progress"

describe("MaterializationProgress", () => {
  it("renders nothing when status is not materializing", () => {
    const { container } = render(
      <MaterializationProgress campaign={makeCampaign({ status: "draft" })} />,
    )
    expect(container.innerHTML).toBe("")
  })

  it("renders counting label when audience_total is null", () => {
    render(
      <MaterializationProgress
        campaign={makeCampaign({
          status: "materializing",
          audience_total: null,
          materialized_count: 0,
        })}
      />,
    )
    expect(screen.getByText(/counting recipients/i)).toBeTruthy()
  })

  it("renders count label with both numbers (locale-formatted)", () => {
    render(
      <MaterializationProgress
        campaign={makeCampaign({
          status: "materializing",
          audience_total: 3247,
          materialized_count: 1200,
        })}
      />,
    )
    expect(screen.getByText(/1,200.*of.*3,247/)).toBeTruthy()
  })

  it("clamps progress value to 100 on overflow", () => {
    render(
      <MaterializationProgress
        campaign={makeCampaign({
          status: "materializing",
          audience_total: 100,
          materialized_count: 150,
        })}
      />,
    )
    const progress = screen.getByTestId("progress")
    expect(Number(progress.getAttribute("data-value"))).toBeLessThanOrEqual(100)
  })

  it("renders progress=0 when audience_total is 0 (no division by zero)", () => {
    render(
      <MaterializationProgress
        campaign={makeCampaign({
          status: "materializing",
          audience_total: 0,
          materialized_count: 0,
        })}
      />,
    )
    const progress = screen.getByTestId("progress")
    expect(progress.getAttribute("data-value")).toBe("0")
  })

  it("treats null materialized_count as 0", () => {
    render(
      <MaterializationProgress
        campaign={makeCampaign({
          status: "materializing",
          audience_total: 100,
          materialized_count: null,
        })}
      />,
    )
    const progress = screen.getByTestId("progress")
    expect(progress.getAttribute("data-value")).toBe("0")
  })
})
