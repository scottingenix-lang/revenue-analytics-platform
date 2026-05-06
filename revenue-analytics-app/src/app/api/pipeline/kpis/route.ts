import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { PipelineKpis } from '@/lib/types'

function quarterStart(offsetMonths = 0): string {
  const now = new Date()
  const q = Math.floor(now.getMonth() / 3)
  const d = new Date(now.getFullYear(), q * 3 + offsetMonths, 1)
  return d.toISOString().split('T')[0]
}

export async function GET() {
  const supabase = await createClient()

  const qStart = quarterStart(0)
  const qEnd = quarterStart(3)
  const trailing12 = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [openOps, closedOps, quotaData, wonQtd] = await Promise.all([
    supabase
      .from('sls_opportunities')
      .select('arr, probability, stage, close_date')
      .not('stage', 'in', '("6","Closed Lost")')
      .gte('close_date', qStart)
      .lt('close_date', qEnd),

    supabase
      .from('sls_opportunities')
      .select('arr, stage, close_date, created_date')
      .in('stage', ['6', 'Closed Lost'])
      .gte('close_date', trailing12),

    supabase.from('sls_users').select('quota').eq('role', 'AE'),

    supabase
      .from('sls_opportunities')
      .select('arr')
      .eq('stage', '6')
      .gte('close_date', qStart)
      .lt('close_date', qEnd),
  ])

  const open = openOps.data ?? []
  const closed = closedOps.data ?? []

  const pipeline_arr = open.reduce((s, o) => s + Number(o.arr ?? 0), 0)
  const weighted_arr = open.reduce((s, o) => s + Number(o.arr ?? 0) * Number(o.probability ?? 0) / 100, 0)
  const won = closed.filter((o) => o.stage === '6')
  const lost = closed.filter((o) => o.stage === 'Closed Lost')
  const win_rate_pct = won.length + lost.length > 0 ? (won.length / (won.length + lost.length)) * 100 : 0
  const avg_deal_arr = won.length > 0 ? won.reduce((s, o) => s + Number(o.arr ?? 0), 0) / won.length : 0
  const cycleDeals = won.filter((o) => o.close_date && o.created_date)
  const avg_cycle_days = cycleDeals.length > 0
    ? cycleDeals.reduce((s, o) => {
        const ms = new Date(o.close_date!).getTime() - new Date(o.created_date!).getTime()
        return s + ms / (1000 * 60 * 60 * 24)
      }, 0) / cycleDeals.length
    : 0
  const quarterly_quota = (quotaData.data ?? []).reduce((s, u) => s + Number(u.quota ?? 0), 0) / 4
  const pipeline_coverage = quarterly_quota > 0 ? pipeline_arr / quarterly_quota : 0
  const won_arr_qtd = (wonQtd.data ?? []).reduce((s, o) => s + Number(o.arr ?? 0), 0)

  const kpis: PipelineKpis = {
    open_deals: open.length,
    pipeline_arr: Math.round(pipeline_arr),
    weighted_arr: Math.round(weighted_arr),
    pipeline_coverage: Math.round(pipeline_coverage * 100) / 100,
    win_rate_pct: Math.round(win_rate_pct * 10) / 10,
    avg_deal_arr: Math.round(avg_deal_arr),
    avg_cycle_days: Math.round(avg_cycle_days),
    won_arr_qtd: Math.round(won_arr_qtd),
  }

  return NextResponse.json({ kpis })
}
