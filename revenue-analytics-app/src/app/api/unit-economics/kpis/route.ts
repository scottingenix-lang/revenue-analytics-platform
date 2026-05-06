import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { UnitEconomicsKpis, CacBySourceRow } from '@/lib/types'

function quarterStart(offsetQuarters = 0): string {
  const now = new Date()
  const q = Math.floor(now.getMonth() / 3)
  const d = new Date(now.getFullYear(), (q + offsetQuarters) * 3, 1)
  return d.toISOString().split('T')[0]
}

export async function GET() {
  const supabase = await createClient()

  const trailing12 = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [arrData, movementsData, gmData, spendData, spendPriorData, cacSourceData, priorArrData] =
    await Promise.all([
      supabase.from('sub_subscriptions').select('arr').eq('status', 'active'),

      supabase
        .from('sub_arr_movements')
        .select('movement_type, arr_delta')
        .gte('effective_date', trailing12),

      supabase
        .from('fin_margin')
        .select('gross_margin_pct')
        .gte('fiscal_month', quarterStart(-1))
        .order('fiscal_month', { ascending: false })
        .limit(3),

      supabase
        .from('fin_spend_monthly')
        .select('amount')
        .gte('fiscal_month', trailing12),

      supabase
        .from('fin_spend_monthly')
        .select('amount')
        .gte('fiscal_month', quarterStart(-2))
        .lt('fiscal_month', quarterStart(-1)),

      supabase
        .from('mv_cac_by_source_quarterly')
        .select('close_quarter, lead_source, new_customers, new_arr, total_spend, cac')
        .order('close_quarter', { ascending: false })
        .limit(40),

      supabase
        .from('mv_arr_daily')
        .select('total_arr')
        .lte('snapshot_date', trailing12)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

  const total_arr = (arrData.data ?? []).reduce((s, r) => s + Number(r.arr), 0)
  const mvs = movementsData.data ?? []
  const expansion = mvs.filter((m) => m.movement_type === 'Expansion').reduce((s, m) => s + Number(m.arr_delta), 0)
  const contraction = mvs.filter((m) => m.movement_type === 'Contraction').reduce((s, m) => s + Math.abs(Number(m.arr_delta)), 0)
  const churn = mvs.filter((m) => m.movement_type === 'Churn').reduce((s, m) => s + Math.abs(Number(m.arr_delta)), 0)

  const starting_arr = Number((priorArrData.data as { total_arr?: number } | null)?.total_arr ?? 0)
  const arr_growth_pct = starting_arr > 0 ? ((total_arr - starting_arr) / starting_arr) * 100 : 0
  const annual_churn_rate = starting_arr > 0 ? churn / starting_arr : 0

  const gmRows = gmData.data ?? []
  const gross_margin_pct = gmRows.length > 0
    ? (gmRows.reduce((s, r) => s + Number(r.gross_margin_pct), 0) / gmRows.length) * 100
    : 0

  const sm_spend_current = (spendData.data ?? []).reduce((s, r) => s + Number(r.amount), 0)
  const sm_spend_prior = (spendPriorData.data ?? []).reduce((s, r) => s + Number(r.amount), 0)

  // New logos — trailing 12 months (same window as spend, avoids end-of-history edge effect)
  const { data: newLogoPrior } = await supabase
    .from('sub_subscriptions')
    .select('company_id')
    .gte('start_date', trailing12)
  const new_customer_count = new Set((newLogoPrior ?? []).map((s) => s.company_id)).size
  const blended_cac = new_customer_count > 0 ? sm_spend_current / new_customer_count : 0

  const avg_arr = total_arr / Math.max((arrData.data ?? []).length, 1)
  const gm_dec = gross_margin_pct / 100
  const ltv = annual_churn_rate > 0 ? (avg_arr * gm_dec) / annual_churn_rate : 0
  const ltv_cac = blended_cac > 0 ? ltv / blended_cac : 0
  const cac_payback_months = blended_cac > 0 && avg_arr > 0 && gm_dec > 0
    ? blended_cac / ((avg_arr / 12) * gm_dec)
    : 0

  // Magic number
  const { data: netNewData } = await supabase
    .from('sub_arr_movements')
    .select('arr_delta')
    .gte('effective_date', quarterStart(-1))
    .lt('effective_date', quarterStart(0))
  const net_new_arr = (netNewData ?? []).reduce((s, r) => s + Number(r.arr_delta), 0)
  const magic_number = sm_spend_prior > 0 ? (net_new_arr * 4) / sm_spend_prior : 0

  const rule_of_40 = arr_growth_pct + gross_margin_pct

  const kpis: UnitEconomicsKpis = {
    blended_cac: Math.round(blended_cac),
    cac_payback_months: Math.round(cac_payback_months * 10) / 10,
    ltv: Math.round(ltv),
    ltv_cac: Math.round(ltv_cac * 100) / 100,
    gross_margin_pct: Math.round(gross_margin_pct * 10) / 10,
    magic_number: Math.round(magic_number * 100) / 100,
    arr_growth_pct: Math.round(arr_growth_pct * 10) / 10,
    rule_of_40: Math.round(rule_of_40 * 10) / 10,
  }

  const cacBySource: CacBySourceRow[] = (cacSourceData.data ?? []).map((r) => ({
    close_quarter: r.close_quarter,
    lead_source: r.lead_source ?? 'Unknown',
    new_customers: Number(r.new_customers),
    new_arr: Number(r.new_arr),
    total_spend: Number(r.total_spend ?? 0),
    cac: Math.round(Number(r.cac ?? 0)),
  }))

  return NextResponse.json({ kpis, cacBySource })
}
