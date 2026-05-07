import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { CockpitKpis } from '@/lib/types'

export async function GET() {
  const supabase = await createClient()

  const trailing12 = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [
    arrResult,
    movementsResult,
    startingArrResult,
    pipelineResult,
    winRateResult,
    dealSizeResult,
    cycleResult,
    gmResult,
    priorArrResult,
    spendResult,
    newLogoSubsResult,
  ] = await Promise.all([
    // Total ARR
    supabase.from('sub_subscriptions').select('arr').eq('status', 'active'),

    // ARR movements — trailing 12 months for NRR/GRR + Magic Number
    supabase
      .from('sub_arr_movements')
      .select('movement_type, arr_delta')
      .gte('effective_date', trailing12),

    // Starting ARR 12 months ago (for NRR denominator)
    supabase
      .from('mv_arr_daily')
      .select('total_arr')
      .lte('snapshot_date', trailing12)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Pipeline coverage — open opps
    supabase
      .from('sls_opportunities')
      .select('arr, stage, close_date')
      .not('stage', 'in', '("6","Closed Lost")'),

    // Win rate — trailing 12 months
    supabase
      .from('sls_opportunities')
      .select('stage')
      .in('stage', ['6', 'Closed Lost'])
      .gte('close_date', trailing12),

    // Avg deal size — closed-won, trailing 12 months
    supabase
      .from('sls_opportunities')
      .select('arr')
      .eq('stage', '6')
      .gte('close_date', trailing12),

    // Avg sales cycle — use close_date and created_date (deal_age_days is always 0)
    supabase
      .from('sls_opportunities')
      .select('close_date, created_date')
      .eq('stage', '6')
      .gte('close_date', trailing12)
      .not('created_date', 'is', null),

    // Gross margin (last 3 months)
    supabase
      .from('fin_margin')
      .select('gross_margin_pct')
      .gte('fiscal_month', new Date(Date.now() - 92 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .order('fiscal_month', { ascending: false })
      .limit(3),

    // ARR 12 months ago for Rule of 40 growth rate
    supabase
      .from('mv_arr_daily')
      .select('total_arr')
      .lte('snapshot_date', trailing12)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle(),

    // S&M spend — trailing 12 months (for Magic Number + CAC)
    supabase
      .from('fin_spend_monthly')
      .select('amount, category')
      .gte('fiscal_month', trailing12),

    // New logo subscriptions — trailing 12 months (for CAC)
    supabase
      .from('sub_subscriptions')
      .select('company_id, arr, opportunity:sls_opportunities!opportunity_id(stage, pipeline)')
      .gte('start_date', trailing12),
  ])

  // Total ARR
  const total_arr = (arrResult.data ?? []).reduce((s, r) => s + Number(r.arr), 0)

  // NRR/GRR using mv_arr_daily snapshot as denominator
  const movements = movementsResult.data ?? []
  const expansion = movements.filter((m) => m.movement_type === 'Expansion').reduce((s, m) => s + Number(m.arr_delta), 0)
  const contraction = movements.filter((m) => m.movement_type === 'Contraction').reduce((s, m) => s + Math.abs(Number(m.arr_delta)), 0)
  const churn = movements.filter((m) => m.movement_type === 'Churn').reduce((s, m) => s + Math.abs(Number(m.arr_delta)), 0)
  const startingArr = Number((startingArrResult.data as { total_arr?: number } | null)?.total_arr ?? 0) || (total_arr - expansion + contraction + churn)
  const nrr_pct = startingArr > 0 ? ((startingArr + expansion - contraction - churn) / startingArr) * 100 : 0
  const grr_pct = startingArr > 0 ? ((startingArr - contraction - churn) / startingArr) * 100 : 0

  // Pipeline coverage
  const openPipeline = (pipelineResult.data ?? []).filter((o) => {
    const qStart = getQuarterStart(0)
    const qEnd = getQuarterEnd(0)
    return o.close_date >= qStart && o.close_date <= qEnd
  })
  const pipeline_arr = openPipeline.reduce((s, o) => s + Number(o.arr ?? 0), 0)

  // Win rate
  const closed = winRateResult.data ?? []
  const won = closed.filter((o) => o.stage === '6').length
  const lost = closed.filter((o) => o.stage === 'Closed Lost').length
  const win_rate_pct = won + lost > 0 ? (won / (won + lost)) * 100 : 0

  // Avg deal size
  const wonDeals = dealSizeResult.data ?? []
  const avg_deal_arr = wonDeals.length > 0 ? wonDeals.reduce((s, o) => s + Number(o.arr ?? 0), 0) / wonDeals.length : 0

  // Quota (AE total annual, divide by 4 for quarter)
  const { data: quotaData } = await supabase.from('sls_users').select('quota').eq('role', 'AE')
  const quarterly_quota = (quotaData ?? []).reduce((s, u) => s + Number(u.quota ?? 0), 0) / 4
  const pipeline_coverage = quarterly_quota > 0 ? pipeline_arr / quarterly_quota : 0

  // Avg sales cycle — computed from close_date - created_date
  const cycleDeals = (cycleResult.data ?? []).filter((o) => o.close_date && o.created_date)
  const avg_cycle_days = cycleDeals.length > 0
    ? cycleDeals.reduce((s, o) => {
        const days = Math.floor(
          (new Date(o.close_date).getTime() - new Date(o.created_date).getTime()) / (1000 * 60 * 60 * 24)
        )
        return s + days
      }, 0) / cycleDeals.length
    : 0

  // Gross margin
  const gmRows = gmResult.data ?? []
  const gross_margin_pct = gmRows.length > 0
    ? (gmRows.reduce((s, r) => s + Number(r.gross_margin_pct), 0) / gmRows.length) * 100
    : 0

  // S&M spend — trailing 12 months
  const allSpend = spendResult.data ?? []
  const sm_spend = allSpend.reduce((s, r) => s + Number(r.amount), 0)

  // Magic number: T12 net new ARR / T12 S&M spend (both annualized, no ×4)
  const net_new_arr = movements.reduce((s, m) => s + Number(m.arr_delta), 0)
  const magic_number = sm_spend > 0 ? net_new_arr / sm_spend : 0

  // Blended CAC — trailing 12 months new logos
  const newLogoSubs = (newLogoSubsResult.data ?? []).filter(
    (s) => Array.isArray(s.opportunity)
      ? s.opportunity.some((o: { stage: string; pipeline: string }) => o.stage === '6' && o.pipeline === 'New Business')
      : (s.opportunity as { stage: string; pipeline: string } | null)?.stage === '6' &&
        (s.opportunity as { stage: string; pipeline: string } | null)?.pipeline === 'New Business'
  )
  const new_customer_count = new Set(newLogoSubs.map((s) => s.company_id)).size
  const blended_cac = new_customer_count > 0 ? sm_spend / new_customer_count : 0
  const avg_new_arr_per_cust = newLogoSubs.length > 0
    ? newLogoSubs.reduce((s, r) => s + Number(r.arr ?? 0), 0) / newLogoSubs.length
    : avg_deal_arr
  const gm_decimal = gross_margin_pct / 100
  const cac_payback_months = blended_cac > 0 && avg_new_arr_per_cust > 0 && gm_decimal > 0
    ? blended_cac / (avg_new_arr_per_cust / 12 * gm_decimal)
    : 0

  // Rule of 40
  const prior_arr = Number((priorArrResult.data as { total_arr?: number } | null)?.total_arr ?? 0)
  const arr_growth_pct = prior_arr > 0 ? ((total_arr - prior_arr) / prior_arr) * 100 : 0
  const rule_of_40 = arr_growth_pct + gross_margin_pct

  const kpis: CockpitKpis = {
    total_arr,
    nrr_pct: Math.round(nrr_pct * 10) / 10,
    grr_pct: Math.round(grr_pct * 10) / 10,
    pipeline_coverage: Math.round(pipeline_coverage * 100) / 100,
    win_rate_pct: Math.round(win_rate_pct * 10) / 10,
    avg_deal_arr: Math.round(avg_deal_arr),
    deal_count: wonDeals.length,
    avg_cycle_days: Math.round(avg_cycle_days),
    cac_payback_months: Math.round(cac_payback_months * 10) / 10,
    blended_cac: Math.round(blended_cac),
    gross_margin_pct: Math.round(gross_margin_pct * 10) / 10,
    magic_number: Math.round(magic_number * 100) / 100,
    arr_growth_pct: Math.round(arr_growth_pct * 10) / 10,
    rule_of_40: Math.round(rule_of_40 * 10) / 10,
  }

  return NextResponse.json(kpis)
}

function getQuarterStart(offsetQuarters: number): string {
  const now = new Date()
  const q = Math.floor(now.getMonth() / 3)
  const year = now.getFullYear()
  const qMonth = (q + offsetQuarters) * 3
  const d = new Date(year, qMonth, 1)
  return d.toISOString().split('T')[0]
}

function getQuarterEnd(offsetQuarters: number): string {
  const start = new Date(getQuarterStart(offsetQuarters + 1))
  start.setDate(start.getDate() - 1)
  return start.toISOString().split('T')[0]
}
