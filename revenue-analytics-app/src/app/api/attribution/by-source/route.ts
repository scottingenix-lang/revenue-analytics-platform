import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { AttributionRow } from '@/lib/types'

type Model = 'first_touch' | 'last_touch' | 'linear' | 'time_decay' | 'w_shaped'
type Timeframe = 'this_quarter' | 'last_quarter' | 'this_year' | 'all_time'

type Bucket = {
  deal_ids: Set<string>
  stage_0: number
  stage_1: number
  stage_2: number
  stage_3: number
  stage_4: number
  stage_5: number
  won: number
  lost: number
}

function makeBucket(): Bucket {
  return { deal_ids: new Set(), stage_0: 0, stage_1: 0, stage_2: 0, stage_3: 0, stage_4: 0, stage_5: 0, won: 0, lost: 0 }
}

function addToStage(bucket: Bucket, stage: string | null, amount: number) {
  if (stage === '6')           { bucket.won     += amount; return }
  if (stage === 'Closed Lost') { bucket.lost    += amount; return }
  if (stage === '0')           { bucket.stage_0 += amount; return }
  if (stage === '1')           { bucket.stage_1 += amount; return }
  if (stage === '2')           { bucket.stage_2 += amount; return }
  if (stage === '3')           { bucket.stage_3 += amount; return }
  if (stage === '4')           { bucket.stage_4 += amount; return }
  if (stage === '5')           { bucket.stage_5 += amount; return }
  bucket.stage_0 += amount
}

function getDateRange(timeframe: Timeframe): { start: string; end: string } | null {
  const now = new Date()
  const y = now.getFullYear()
  const q = Math.floor(now.getMonth() / 3)

  if (timeframe === 'this_quarter') {
    const start = new Date(y, q * 3, 1)
    const end   = new Date(y, q * 3 + 3, 0)
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
  }
  if (timeframe === 'last_quarter') {
    const prevQ = q === 0 ? 3 : q - 1
    const prevY = q === 0 ? y - 1 : y
    const start = new Date(prevY, prevQ * 3, 1)
    const end   = new Date(prevY, prevQ * 3 + 3, 0)
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
  }
  if (timeframe === 'this_year') {
    return { start: `${y}-01-01`, end: `${y}-12-31` }
  }
  return null
}

function toRows(grouped: Record<string, Bucket>): AttributionRow[] {
  const total = Object.values(grouped).reduce((s, g) => s + g.won, 0)
  return Object.entries(grouped)
    .map(([src, g]) => ({
      attributed_source: src,
      deal_count: g.deal_ids.size,
      stage_0_arr: Math.round(g.stage_0),
      stage_1_arr: Math.round(g.stage_1),
      stage_2_arr: Math.round(g.stage_2),
      stage_3_arr: Math.round(g.stage_3),
      stage_4_arr: Math.round(g.stage_4),
      stage_5_arr: Math.round(g.stage_5),
      closed_won_arr: Math.round(g.won),
      lost_arr: Math.round(g.lost),
      pct_of_total_arr: total > 0 ? Math.round((g.won / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => {
      const sum = (r: AttributionRow) =>
        r.stage_0_arr + r.stage_1_arr + r.stage_2_arr + r.stage_3_arr +
        r.stage_4_arr + r.stage_5_arr + r.closed_won_arr + r.lost_arr
      return sum(b) - sum(a)
    })
    .slice(0, 10)
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const model     = (searchParams.get('model')     ?? 'first_touch') as Model
  const timeframe = (searchParams.get('timeframe') ?? 'all_time')    as Timeframe
  const supabase  = await createClient()

  // Build optional opportunity ID filter for timeframe
  let oppIdFilter: Set<string> | null = null
  const range = getDateRange(timeframe)
  if (range) {
    const { data: opps } = await supabase
      .from('sls_opportunities')
      .select('id')
      .gte('created_date', range.start)
      .lte('created_date', range.end)
    oppIdFilter = new Set((opps ?? []).map((o) => o.id))
  }

  const grouped: Record<string, Bucket> = {}

  if (model === 'first_touch' || model === 'last_touch') {
    const view = model === 'first_touch' ? 'mv_attribution_first_touch' : 'mv_attribution_last_touch'
    const { data } = await supabase
      .from(view as 'mv_attribution_first_touch')
      .select('attributed_source, arr, stage, opportunity_id')

    for (const row of data ?? []) {
      if (oppIdFilter && !oppIdFilter.has(row.opportunity_id)) continue
      const src = row.attributed_source ?? 'Unknown'
      if (!grouped[src]) grouped[src] = makeBucket()
      grouped[src].deal_ids.add(row.opportunity_id)
      addToStage(grouped[src], row.stage, Number(row.arr ?? 0))
    }
  } else if (model === 'linear' || model === 'w_shaped') {
    const view = model === 'linear' ? 'mv_attribution_linear' : 'mv_attribution_w_shaped'
    const { data } = await supabase
      .from(view as 'mv_attribution_linear')
      .select('attributed_source, attributed_arr, stage, opportunity_id')

    for (const row of data ?? []) {
      if (oppIdFilter && !oppIdFilter.has(row.opportunity_id)) continue
      const src = row.attributed_source ?? 'Unknown'
      if (!grouped[src]) grouped[src] = makeBucket()
      grouped[src].deal_ids.add(row.opportunity_id)
      addToStage(grouped[src], row.stage, Number(row.attributed_arr ?? 0))
    }
  } else if (model === 'time_decay') {
    const { data } = await supabase
      .from('mv_attribution_time_decay')
      .select('attributed_source, touch_weight, stage, opportunity_id')

    for (const row of data ?? []) {
      if (oppIdFilter && !oppIdFilter.has(row.opportunity_id)) continue
      const src = row.attributed_source ?? 'Unknown'
      if (!grouped[src]) grouped[src] = makeBucket()
      grouped[src].deal_ids.add(row.opportunity_id)
      addToStage(grouped[src], row.stage, Number(row.touch_weight ?? 0))
    }
  }

  return NextResponse.json(toRows(grouped))
}
