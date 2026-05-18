import { createClient } from '@/lib/supabase/server'
import { fmtUSD, fmtPct, fmtMultiple, fmtMonths, fmtDays } from '@/lib/format'
import AiPanel from '@/components/ai/AiPanel'
import ArrSegmentBarChart from '@/components/charts/ArrSegmentBarChart'
import ArrWaterfallChart from '@/components/charts/ArrWaterfallChart'

function attainmentColor(pacePct: number) {
  if (pacePct >= 90) return { bar: 'bg-emerald-500', text: 'text-emerald-600', badge: 'bg-emerald-100 text-emerald-700' }
  if (pacePct >= 70) return { bar: 'bg-amber-400',   text: 'text-amber-600',   badge: 'bg-amber-100 text-amber-700'   }
  return               { bar: 'bg-red-500',          text: 'text-red-600',     badge: 'bg-red-100 text-red-700'       }
}

function AttainmentPanel({ label, actual, goal, progressPct }: {
  label: string; actual: number; goal: number; progressPct: number
}) {
  const pct      = goal > 0 ? Math.min((actual / goal) * 100, 100) : 0
  const pace     = progressPct > 0 ? (actual / goal * 100) / progressPct * 100 : 100
  const colors   = attainmentColor(pace)
  const barWidth = Math.min(pct, 100)

  return (
    <div className="p-6 flex-1 min-w-0">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">{label}</p>
      <div className="flex items-end gap-3 mb-3">
        <span className="text-4xl font-bold text-white tabular-nums leading-none">{fmtUSD(actual)}</span>
        <span className={`text-sm font-bold px-2.5 py-1 rounded-full mb-0.5 ${colors.badge}`}>
          {pct.toFixed(0)}%
        </span>
      </div>
      <div className="h-2.5 bg-white/10 rounded-full overflow-hidden mb-2">
        <div className={`h-full rounded-full transition-all ${colors.bar}`} style={{ width: `${barWidth}%` }} />
      </div>
      <p className="text-xs text-slate-400">of <span className="text-slate-300 font-medium">{fmtUSD(goal)}</span> goal</p>
    </div>
  )
}

function SupportTile({ label, primary, sub, color = 'text-white' }: {
  label: string; primary: string; sub: string; color?: string
}) {
  return (
    <div className="p-5 flex-1 min-w-0">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">{label}</p>
      <p className={`text-2xl font-bold tabular-nums leading-none mb-1 ${color}`}>{primary}</p>
      <p className="text-xs text-slate-300">{sub}</p>
    </div>
  )
}

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

  // Quarter / year bounds
  const now        = new Date()
  const year       = now.getFullYear()
  const qIdx       = Math.floor(now.getMonth() / 3)
  const qLabel     = `Q${qIdx + 1} ${year}`
  const qStartDate = new Date(year, qIdx * 3, 1)
  const qEndDate   = new Date(year, qIdx * 3 + 3, 0)
  const qStartStr  = qStartDate.toISOString().split('T')[0]
  const qEndStr    = qEndDate.toISOString().split('T')[0]
  const yearStart  = `${year}-01-01`
  const totalDays  = Math.round((qEndDate.getTime() - qStartDate.getTime()) / 86400000) + 1
  const elapsedDays = Math.min(totalDays, Math.round((now.getTime() - qStartDate.getTime()) / 86400000) + 1)
  const progressPct = Math.round((elapsedDays / totalDays) * 100)

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
    waterfallData,
    goalsData,
    qClosedData,
    ytdClosedData,
    ytdPipelineData,
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
    supabase.from('sub_arr_movements').select('movement_type, arr_delta').gte('effective_date', quarterStart(0)),
    // Scorecard: revenue goals for current year (all segments)
    supabase.from('fin_revenue_goals').select('period_quarter, new_business_arr_goal, expansion_arr_goal').eq('period_year', year).is('segment', null),
    // Scorecard: Q closed-won ARR
    supabase.from('sls_opportunities').select('arr').eq('stage', '6').gte('close_date', qStartStr).lte('close_date', qEndStr),
    // Scorecard: YTD closed-won ARR
    supabase.from('sls_opportunities').select('arr').eq('stage', '6').gte('close_date', yearStart),
    // Scorecard: YTD pipeline created (all non-lost deals)
    supabase.from('sls_opportunities').select('arr').not('stage', 'in', '("Closed Lost")').gte('created_date', yearStart),
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

  // ── Scorecard computations ───────────────────────────────────
  const goals       = goalsData.data ?? []
  const qGoalRow    = goals.find((g) => g.period_quarter === (qIdx + 1))
  const annualGoalRow = goals.find((g) => g.period_quarter === null)
  const qGoal       = qGoalRow     ? Number(qGoalRow.new_business_arr_goal)     : quarterly_quota
  const annualGoal  = annualGoalRow ? Number(annualGoalRow.new_business_arr_goal) : quarterly_quota * 4

  const qClosedArr     = (qClosedData.data   ?? []).reduce((s, o) => s + Number(o.arr), 0)
  const ytdClosedArr   = (ytdClosedData.data  ?? []).reduce((s, o) => s + Number(o.arr), 0)
  const ytdPipelineArr = (ytdPipelineData.data ?? []).reduce((s, o) => s + Number(o.arr), 0)

  // Q pipeline coverage (existing pipeline_arr already filtered to this quarter above)
  const qPipeCoverage = quarterly_quota > 0 ? pipeline_arr / quarterly_quota : 0
  const pipeTarget = 3.0 // 3x coverage benchmark

  // YTD pipeline vs 3× annualised quarterly quota target
  const ytdPipeTarget = quarterly_quota * 4 * pipeTarget * (progressPct / 100) // pace-adjusted annual target

  // Overall status (based on Q revenue pace)
  const qRevPace = progressPct > 0 ? (qClosedArr / (qGoal || 1) * 100) / progressPct * 100 : 100
  const overallStatus = qRevPace >= 90 ? { label: '✓ On Track', cls: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' }
                      : qRevPace >= 70 ? { label: '⚠ Watch',    cls: 'bg-amber-500/20  text-amber-300  border border-amber-500/30'  }
                      :                  { label: '✕ At Risk',   cls: 'bg-red-500/20    text-red-300    border border-red-500/30'    }

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

      {/* ── GTM Scorecard ─────────────────────────────────────── */}
      <div data-tour="gtm-scorecard" className="bg-slate-900 rounded-2xl overflow-hidden shadow-xl">

        {/* Header row */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-white/10">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">{qLabel} Go-To-Market Scorecard</h2>
            <p className="text-xs text-slate-400 mt-0.5">Day {elapsedDays} of {totalDays} · {progressPct}% of quarter elapsed</p>
          </div>
          <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${overallStatus.cls}`}>
            {overallStatus.label}
          </span>
        </div>

        {/* Quarter progress bar */}
        <div className="h-1 bg-white/5">
          <div className="h-full bg-indigo-500/60" style={{ width: `${progressPct}%` }} />
        </div>

        {/* Hero attainment panels */}
        <div className="flex divide-x divide-white/10">
          <AttainmentPanel
            label={`${qLabel} Revenue Attainment`}
            actual={qClosedArr}
            goal={qGoal}
            progressPct={progressPct}
          />
          <AttainmentPanel
            label={`${year} YTD Revenue Attainment`}
            actual={ytdClosedArr}
            goal={annualGoal}
            progressPct={progressPct}
          />
        </div>

        {/* Divider */}
        <div className="mx-6 border-t border-white/10" />

        {/* Supporting tiles */}
        <div className="flex divide-x divide-white/10">
          <SupportTile
            label="Q Pipeline Coverage"
            primary={`${qPipeCoverage.toFixed(1)}×`}
            sub={`vs ${pipeTarget}× target`}
            color={qPipeCoverage >= pipeTarget ? 'text-emerald-400' : qPipeCoverage >= 2.0 ? 'text-amber-400' : 'text-red-400'}
          />
          <SupportTile
            label="YTD Pipeline Created"
            primary={fmtUSD(ytdPipelineArr)}
            sub={`vs ${fmtUSD(ytdPipeTarget)} pace target`}
            color={ytdPipelineArr >= ytdPipeTarget ? 'text-emerald-400' : ytdPipelineArr >= ytdPipeTarget * 0.8 ? 'text-amber-400' : 'text-red-400'}
          />
          <SupportTile
            label="Expansion ARR"
            primary={`+${fmtUSD(expansion)}`}
            sub="Trailing 12 months"
            color="text-indigo-300"
          />
          <SupportTile
            label="Churn ARR"
            primary={`-${fmtUSD(churn)}`}
            sub="Trailing 12 months"
            color="text-red-400"
          />
        </div>
      </div>

      {/* AI Executive Summary */}
      <AiPanel page="executive_overview" panelId="exec_summary" title="AI Executive Summary" />

      {/* KPI tiles */}
      <div data-tour="kpi-tiles" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
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
        <div data-tour="arr-trend" className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">ARR Trend by Segment</h3>
          <ArrSegmentBarChart />
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
