import { NextRequest, NextResponse } from "next/server"
import { createClient } from "redis"

const REDIS_KEY = "ai-debug-logs"
const MAX_ENTRIES = 50

async function getRedisClient() {
  const url = process.env.REDIS_URL || "redis://localhost:6379"
  const client = createClient({ url })
  client.on("error", () => {}) // suppress noisy logs
  if (!client.isOpen) await client.connect()
  return client
}

/**
 * GET /api/debug/ai-logs — retrieve last 50 debug entries
 */
export async function GET() {
  try {
    const client = await getRedisClient()
    const raw = await client.lRange(REDIS_KEY, 0, MAX_ENTRIES - 1)
    await client.quit()
    const entries = raw.map((r) => JSON.parse(r))
    return NextResponse.json({ entries, count: entries.length })
  } catch (error) {
    console.error("[debug/ai-logs] GET error:", error)
    return NextResponse.json({ entries: [], count: 0, error: "Redis unavailable" })
  }
}

/**
 * POST /api/debug/ai-logs — append a debug entry
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const client = await getRedisClient()
    await client.lPush(REDIS_KEY, JSON.stringify(body))
    await client.lTrim(REDIS_KEY, 0, MAX_ENTRIES - 1)
    await client.quit()
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[debug/ai-logs] POST error:", error)
    return NextResponse.json({ ok: false, error: "Redis unavailable" }, { status: 500 })
  }
}

/**
 * DELETE /api/debug/ai-logs — clear all logs
 */
export async function DELETE() {
  try {
    const client = await getRedisClient()
    await client.del(REDIS_KEY)
    await client.quit()
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[debug/ai-logs] DELETE error:", error)
    return NextResponse.json({ ok: false, error: "Redis unavailable" }, { status: 500 })
  }
}
