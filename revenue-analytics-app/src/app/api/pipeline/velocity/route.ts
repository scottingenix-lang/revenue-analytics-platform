import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type StageKey = 'stage_0' | 'stage_1' | 'stage_2' | 'stage_3' | 'stage_4' | 'stage_5'
type DealStage = 'all' | 'open' | 'won'

const PIPELINE_STAGES = ['0', '1', '2', '3', '4', '5'] as const

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const ownerFilter    = searchParams.get('owner_id')    ?? ''
  const segmentFilter  = searchParams.get('segment')     ?? ''
  const verticalFilter = searchParams.get('vertical')    ?? ''
  const dealStage      = (searchParams.get('deal_stage') ?? 'all') as DealStage

  const supabase = await createClient()

  // Always fetch filter options from unfiltered data
  const [repsRes, oppsDistinct] = await Promise.all([
    supabase.from('sls_users').select('id, name').eq('role', 'AE').order('name'),
    supabase.from('sls_opportunities').select('segment, vertical').not('segment', 'is', null),
  ])

  const reps      = (repsRes.data ?? []) as { id: string; name: string }[]
  const allOpps   = oppsDistinct.data ?? []
  const segments  = [...new Set(allOpps.map((o) => o.segment).filter(Boolean))].sort() as string[]
  const verticals = [...new Set(allOpps.map((o) => o.vertical).filter(Boolean))].sort() as string[]

  const hasFilter = !!(ownerFilter || segmentFilter || verticalFilter || dealStage !== 'all')

  // Build history query. Use embedded !inner join when filters are needed so
  // filtering happens server-side in one query. Use original table name in
  // filter params — PostgREST ignores alias names in filter columns.
  type HistRow = { from_stage: string | null; to_stage: string | null; days_in_prior_stage: number | null }
  let history: HistRow[] = []

  if (hasFilter) {
    let q = supabase
      .from('sls_opportunity_history')
      .select('from_stage, to_stage, days_in_prior_stage, sls_opportunities!inner(owner_id, segment, vertical, stage)')
      .not('from_stage', 'is', null)

    // Rep / segment / vertical filters
    if (ownerFilter)    q = q.eq('sls_opportunities.owner_id', ownerFilter)
    if (segmentFilter)  q = q.eq('sls_opportunities.segment',  segmentFilter)
    if (verticalFilter) q = q.eq('sls_opportunities.vertical', verticalFilter)

    // Deal stage filter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (dealStage === 'open') q = (q as any).not('sls_opportunities.stage', 'in', '("6","Closed Lost")')
    if (dealStage === 'won')  q = q.eq('sls_opportunities.stage', '6')

    const { data } = await q
    history = (data ?? []) as HistRow[]
  } else {
    const { data } = await supabase
      .from('sls_opportunity_history')
      .select('from_stage, to_stage, days_in_prior_stage')
      .not('from_stage', 'is', null)
    history = (data ?? []) as HistRow[]
  }

  // Aggregate per from_stage
  type StageAgg = { daySum: number; count: number; progressed: number }
  const agg: Record<string, StageAgg> = {}

  for (const row of history) {
    const s = row.from_stage as string
    if (!agg[s]) agg[s] = { daySum: 0, count: 0, progressed: 0 }
    agg[s].daySum += Number(row.days_in_prior_stage ?? 0)
    agg[s].count++
    if (row.to_stage !== 'Closed Lost') agg[s].progressed++
  }

  function val(stage: string, metric: 'conv' | 'days'): number | null {
    const a = agg[stage]
    if (!a || a.count === 0) return null
    if (metric === 'conv') return Math.round((a.progressed / a.count) * 1000) / 10
    return Math.round((a.daySum / a.count) * 10) / 10
  }

  const convRow: Record<string, string | number | null> = { metric: 'conversion_rate' }
  const daysRow: Record<string, string | number | null> = { metric: 'avg_days' }

  for (const s of PIPELINE_STAGES) {
    const key = `stage_${s}` as StageKey
    convRow[key] = val(s, 'conv')
    daysRow[key] = val(s, 'days')
  }

  return NextResponse.json({
    pivot: [convRow, daysRow],
    options: { reps, segments, verticals },
  })
}
