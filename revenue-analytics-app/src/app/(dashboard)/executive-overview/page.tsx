import { createClient } from '@/lib/supabase/server'
import { fmtUSD, fmtPct, fmtMultiple, fmtMonths, fmtDays } from '@/lib/format'
import AiNarrativePanel from '@/components/charts/AiNarrativePanel'
import ArrTrendChart from '@/components/charts/ArrTrendChart'
import ArrWaterfallChart from '@/components/charts/ArrWaterfallChart'
import type { ArrDailyRow } from '@/lib/types'

type KpiTile = {
  label: string
  value: string
  sub?: string
  accent?: boolean
}

function quarterStart(offsetQuarters = 0): string {
  const now = new Date()
  const q = Math.floor(now.getMonth() / 3)
  const d = new Date(now.getFullYear(), (q + offsetQuarters) * 3, 1)
  return d.toISOString().split('T')[0]
}

export default async function ExecutiveOverviewPage() {
  const supabase = await createClient()
  const trailing12 = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // ── Fetch all data in parallel ───────────────────────────────
  const [
    arrData,
    movementsData,
    pipelineData,
    closedData,
    gmData,
    quotaData,
    spendData,
    priorArrData,
    arrTrendData,
    waterfallData,
  ] = await Promise.all([
    supabase.from('sub_subscriptions').select('arr').eq('status', 'active'),
    supabase.from('sub_arr_movements').select('movement_type, arr_delta').gte('effective_date', trailing12),
    supabase.from('sls_opportunities').select('arr, stage, close_date').not('stage', 'in', '("6","Closed Lost")'),
    // Use created_date + close_date to compute cycle (deal_age_days is 0 from DB trigger)
    supabase.from('sls_opportunities').select('arr, stage, created_date, close_date').in('stage', ['6', 'Closed Lost']).gte('close_date', trailing12),
    supabase.from('fin_margin').select('gross_margin_pct').gte('fiscal_month', quarterStart(-1)).order('fiscal_month', { ascending: false }).limit(3),
    supabase.from('sls_users').select('quota').eq('role', 'AE'),
    // T12 spend — same window as CAC & magic number
    supabase.from('fin_spend_monthly').select('amount').gte('fiscal_month', trailing12),
    supabase.from('mv_arr_daily').select('total_arr').lte('snapshot_date', trailing12).order('snapshot_date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('mv_arr_daily').select('snapshot_date, total_arr, arr_smb, arr_midmarket, arr_enterprise').gte('snapshot_date', trailing12).order('snapshot_date', { ascending: true }),
    supabase.from('sub_arr_movements').select('movement_type, arr_delta').gte('effective_date', quarterStart(0)),
  ])

  // ── Compute KPIs ─────────────────────────────────────────────
  const total_arr = (arrData.data ?? []).reduce((s, r) => s + Number(r.arr), 0)
  const mvs = movementsData.data ?? []
  const expansion = mvs.filter((m) => m.movement_type === 'Expansion').reduce((s, m) => s + Number(m.arr_delta), 0)
  const contraction = mvs.filter((m) => m.movement_type === 'Contraction').reduce((s, m) => s + Math.abs(Number(m.arr_delta)), 0)
  const churn = mvs.filter((m) => m.movement_type === 'Churn').reduce((s, m) => s + Math.abs(Number(m.arr_delta)), 0)
  const startArr = total_arr - expansion + contraction + churn
  const nrr = startArr > 0 ? ((startArr + expansion - contraction - churn) / startArr) * 100 : 0

  const qStart = quarterStart(0)
  const qEnd = quarterStart(1)
  const openPipeline = (pipelineData.data ?? []).filter((o) => o.close_date >= qStart && o.close_date < qEnd)
  const pipeline_arr = openPipeline.reduce((s, o) => s + Number(o.arr ?? 0), 0)
  const quarterly_quota = (quotaData.data ?? []).reduce((s, u) => s + Number(u.quota ?? 0), 0) / 4
  const pipeline_coverage = quarterly_quota > 0 ? pipeline_arr / quarterly_quota : 0

  const closed = closedData.data ?? []
  const won = closed.filter((o) => o.stage === '6')
  const lost = closed.filter((o) => o.stage === 'Closed Lost')
  const win_rate = won.length + lost.length > 0 ? (won.length / (won.length + lost.length)) * 100 : 0
  const avg_deal = won.length > 0 ? won.reduce((s, o) => s + Number(o.arr ?? 0), 0) / won.length : 0

  // Compute sales cycle from close_date - created_date (deal_age_days is set to 0 by DB trigger)
  const cycleData = won.filter((o) => o.close_date && o.created_date)
  const avg_cycle = cycleData.length > 0
    ? cycleData.reduce((s, o) => {
        const days = Math.floor(
          (new Date(o.close_date).getTime() - new Date(o.created_date).getTime()) / (1000 * 60 * 60 * 24)
        )
        return s + days
      }, 0) / cycleData.length
    : 0

  const gmRows = gmData.data ?? []
  const gross_margin = gmRows.length > 0 ? (gmRows.reduce((s, r) => s + Number(r.gross_margin_pct), 0) / gmRows.length) * 100 : 0

  // T12 spend used for both CAC and Magic Number
  const sm_spend = (spendData.data ?? []).reduce((s, r) => s + Number(r.amount), 0)

  const prior_arr = Number((priorArrData.data as { total_arr?: number } | null)?.total_arr ?? 0)
  const arr_growth = prior_arr > 0 ? ((total_arr - prior_arr) / prior_arr) * 100 : 0

  // Magic Number: T12 net new ARR / T12 spend (no ×4 since both already annualised)
  const net_new_arr = mvs.reduce((s, m) => s + Number(m.arr_delta), 0)
  const magic_number = sm_spend > 0 ? net_new_arr / sm_spend : 0
  const rule_of_40 = arr_growth + gross_margin

  // Blended CAC & payback — T12 to avoid edge-effect quarter
  const { data: newLogoData } = await supabase
    .from('sub_subscriptions')
    .select('company_id, arr')
    .gte('start_date', trailing12)
  const new_cust = new Set((newLogoData ?? []).map((s) => s.company_id)).size
  const blended_cac = new_cust > 0 ? sm_spend / new_cust : 0
  const avg_new_arr = newLogoData && newLogoData.length > 0
    ? newLogoData.reduce((s, r) => s + Number(r.arr), 0) / newLogoData.length
    : avg_deal
  const gm_dec = gross_margin / 100
  const cac_payback = blended_cac > 0 && avg_new_arr > 0 && gm_dec > 0
    ? blended_cac / ((avg_new_arr / 12) * gm_dec)
    : 0

  // LTV/CAC
  const annual_churn_rate = startArr > 0 ? churn / startArr : 0
  const ltv = annual_churn_rate > 0 ? (avg_deal * gm_dec) / annual_churn_rate : 0
  const ltv_cac = blended_cac > 0 ? ltv / blended_cac : 0

  // ── Build tile data ──────────────────────────────────────────
  const tiles: KpiTile[] = [
    { label: 'Total ARR',            value: fmtUSD(total_arr),          sub: `${fmtPct(arr_growth)} YoY growth`,         accent: true },
    { label: 'Net Revenue Retention', value: fmtPct(nrr),               sub: 'Trailing 12 months' },
    { label: 'Pipeline Coverage',     value: fmtMultiple(pipeline_coverage), sub: 'Current quarter' },
    { label: 'Win Rate',              value: fmtPct(win_rate),           sub: 'Trailing 12 months' },
    { label: 'Avg Deal Size',         value: fmtUSD(avg_deal),           sub: `${won.length} closed-won deals` },
    { label: 'Avg Sales Cycle',       value: fmtDays(avg_cycle),         sub: 'Closed-won, T12M' },
    { label: 'CAC Payback',           value: fmtMonths(cac_payback),     sub: 'Trailing 12 months' },
    { label: 'LTV / CAC',             value: fmtMultiple(ltv_cac),       sub: 'Based on avg churn' },
    { label: 'Gross Margin',          value: fmtPct(gross_margin),       sub: 'Last 3 months avg' },
    { label: 'Magic Number',          value: magic_number.toFixed(2),    sub: 'Net new ARR / T12 spend' },
    { label: 'Rule of 40',            value: rule_of_40.toFixed(0),      sub: `Growth ${arr_growth.toFixed(0)}% + GM ${gross_margin.toFixed(0)}%` },
  ]

  // ── ARR trend chart data (weekly samples from mv_arr_daily) ──
  const allTrend = (arrTrendData.data ?? []) as ArrDailyRow[]
  const trendData = allTrend.filter((_, i) => i % 7 === 0 || i === allTrend.length - 1)

  // ── ARR waterfall this quarter ────────────────────────────────
  const qMvs = waterfallData.data ?? []
  const waterfall = [
    { name: 'New',         value: Math.round(qMvs.filter((m) => m.movement_type === 'New').reduce((s, m) => s + Number(m.arr_delta), 0)),               color: '#059669' },
    { name: 'Expansion',   value: Math.round(qMvs.filter((m) => m.movement_type === 'Expansion').reduce((s, m) => s + Number(m.arr_delta), 0)),          color: '#6366f1' },
    { name: 'Contraction', value: Math.round(qMvs.filter((m) => m.movement_type === 'Contraction').reduce((s, m) => s + Math.abs(Number(m.arr_delta)), 0)), color: '#f59e0b' },
    { name: 'Churn',       value: Math.round(qMvs.filter((m) => m.movement_type === 'Churn').reduce((s, m) => s + Math.abs(Number(m.arr_delta)), 0)),     color: '#ef4444' },
  ].filter((w) => w.value > 0)

  return (
    <div className="space-y-6">
      {/* AI Narrative */}
      <AiNarrativePanel />

      {/* KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
        {tiles.map(({ label, value, sub, accent }) => (
          <div
            key={label}
            className={`bg-white rounded-xl border p-5 ${accent ? 'border-indigo-200 shadow-sm' : 'border-gray-200'}`}
          >
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 truncate">
              {label}
            </p>
            <p className={`text-2xl font-bold tabular-nums ${accent ? 'text-indigo-700' : 'text-slate-900'}`}>
              {value}
            </p>
            {sub && <p className="text-xs text-slate-400 mt-1 truncate">{sub}</p>}
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ARR Trend */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">ARR Trend by Segment</h3>
          {trendData.length > 0 ? (
            <ArrTrendChart data={trendData} />
          ) : (
            <p className="text-sm text-slate-400 text-center py-16">No trend data — refresh materialized views</p>
          )}
        </div>

        {/* ARR Waterfall */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">ARR Waterfall QTD</h3>
          {waterfall.length > 0 ? (
            <ArrWaterfallChart items={waterfall} />
          ) : (
            <p className="text-sm text-slate-400 text-center py-16">No movements this quarter yet</p>
          )}
        </div>
      </div>
    </div>
  )
}
