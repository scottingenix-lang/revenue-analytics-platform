import { NextResponse, type NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-haiku-4-5-20251001'

function buildPrompt(d: Record<string, unknown>): string {
  const tableColumns = d.tableColumns as Array<{
    bookingQuarter: string
    pipelineQuarter: string
    isNextYear: boolean
    quarterlyBookings: number
    quarterlyPipeline: number
  }>

  const nextYearCols = tableColumns.filter(c => c.isNextYear)
  const currentYearPipelinePerQtr = (d.goalCurrent as number) / 4 / ((d.winRatePct as number) / 100)
  const nextYearPipelinePerQtr   = (d.goalNext as number)    / 4 / ((d.winRatePct as number) / 100)
  const nextYearPipelineGap = nextYearCols.length > 0
    ? nextYearCols.reduce((acc, col) => acc + (nextYearPipelinePerQtr - col.quarterlyPipeline), 0)
    : 0

  const tableRows = tableColumns.map((col, i) =>
    `  Q${i + 1}: Bookings close ${col.bookingQuarter} ($${Math.round(col.quarterlyBookings).toLocaleString()}) | Pipeline generated ${col.pipelineQuarter} ($${Math.round(col.quarterlyPipeline).toLocaleString()}) | ${col.isNextYear ? '⚠ NEXT YEAR GOAL APPLIES' : 'Current year goal'}`
  ).join('\n')

  return `You are a B2B GTM advisor reviewing a revenue plan. Analyze the data below and return a JSON object matching the exact schema provided.

Be specific — use the exact numbers supplied. Be opinionated. Flag real risks clearly.

## Plan Inputs
- Sales Motion: ${d.motionType} (Avg Deal Size: $${(d.dealSize as number).toLocaleString()})
- Current Year Bookings Goal: $${(d.goalCurrent as number).toLocaleString()}
- Next Year Bookings Goal: $${(d.goalNext as number).toLocaleString()}
- YoY Growth Rate: ${(d.yoyGrowthPct as number).toFixed(1)}%
- Number of Reps: ${(d.numReps as number).toFixed(1)}
- Avg Win Rate: ${(d.winRatePct as number).toFixed(1)}%
- Avg Quota Attainment: ${(d.attainmentPct as number).toFixed(1)}%
- Quota per Rep (Annual): $${Math.round(d.quotaPerRep as number).toLocaleString()}
- Annual Pipeline Required: $${Math.round(d.pipelineRequired as number).toLocaleString()}
- Pipeline per Rep (Annual): $${Math.round(d.pipelinePerRep as number).toLocaleString()}
- Avg Sales Cycle: ${d.salesCycleLabel}
- Solving for: ${d.valueToCalc === 'quota' ? 'Quota per Rep' : d.valueToCalc === 'reps' ? 'Number of Reps' : 'Win Rate'}

## Derived Metrics
- Pipeline Coverage Ratio: ${(d.coverageRatio as number).toFixed(1)}x
- Deals per Rep per Year: ${(d.dealsPerRepPerYear as number).toFixed(1)}
- Effective Revenue per Rep: $${Math.round((d.quotaPerRep as number) * (d.attainmentPct as number) / 100).toLocaleString()} (Quota × Attainment)

## 4-Quarter Pipeline Shift Table
${tableRows}

## Timing Risk Detail
- Booking quarters landing in next fiscal year: ${nextYearCols.length} of 4
- If those quarters were sized against current year goal ($${(d.goalCurrent as number).toLocaleString()}) instead of next year ($${(d.goalNext as number).toLocaleString()}), the cumulative pipeline gap is $${Math.round(nextYearPipelineGap).toLocaleString()}
- Pipeline needed per quarter for next-year bookings: $${Math.round(nextYearPipelinePerQtr).toLocaleString()} vs currently shown: $${Math.round(currentYearPipelinePerQtr).toLocaleString()}

## Benchmarks to apply
- Pipeline coverage: <3x under-covered (flag), 3x–4x healthy, 4x–5x conservative, >5x over-built
- Win rate: <15% red flag, 15–25% typical B2B outbound, 25–35% strong, >40% may indicate poor qualification
- Quota attainment: <60% pricing in failure (flag), 60–80% healthy, >80% overly aggressive (flag)
- Deals/rep/yr: SMB 20–40, Mid-Market 8–20, Enterprise 3–10
- Pipeline/rep (annual): SMB <$1M, Mid-Market $1M–$3M, Enterprise $3M–$8M
- YoY growth >40% requires proportional headcount or win rate improvement to be achievable
- With a sales cycle of 2+ quarters, pipeline for next-year booking quarters must be sized against next year's goal — not current year's — or teams will under-build pipeline and miss

## Required JSON schema
Return ONLY this JSON, no markdown fences, no commentary outside the object:
{
  "insights": [
    { "label": "string", "finding": "string (2–3 sentences, cite specific numbers)", "status": "healthy" | "warning" | "flag" }
  ],
  "verdict": "string (2–3 sentences: overall assessment + the single most important lever to adjust)"
}

Produce exactly 8 insights in this order:
1. label: "Pipeline Coverage" — is ${(d.coverageRatio as number).toFixed(1)}x healthy?
2. label: "Win Rate Health" — is ${(d.winRatePct as number).toFixed(1)}% healthy for this motion?
3. label: "Quota Attainment Design" — is ${(d.attainmentPct as number).toFixed(1)}% realistic or a red flag?
4. label: "Deals per Rep" — is ${(d.dealsPerRepPerYear as number).toFixed(1)} deals/yr realistic for ${d.motionType}?
5. label: "Pipeline per Rep Load" — is $${Math.round(d.pipelinePerRep as number).toLocaleString()}/rep healthy for ${d.motionType}?
6. label: "Year-over-Year Growth" — is ${(d.yoyGrowthPct as number).toFixed(1)}% growth achievable with this team?
7. label: "Quarter Timing Risk" — focus on whether pipeline for next-year booking quarters is correctly sized; the gap is $${Math.round(nextYearPipelineGap).toLocaleString()}
8. label: "Overall Plan Design" — is this quota/rep/pipeline configuration internally consistent?`
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })
  }

  let payload: Record<string, unknown>
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const client = new Anthropic({ apiKey })

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1400,
      messages: [{ role: 'user', content: buildPrompt(payload) }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    const parsed = JSON.parse(raw)
    return NextResponse.json(parsed)
  } catch (err) {
    return NextResponse.json({
      error: 'Generation failed',
      detail: err instanceof Error ? err.message : String(err),
    }, { status: 502 })
  }
}
