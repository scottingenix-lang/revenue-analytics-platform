'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import StageVelocityTable from '@/components/charts/StageVelocityTable'
import DiscoveryBookingChart from '@/components/charts/DiscoveryBookingChart'
import { fmtUSD, fmtPct, fmtMultiple, fmtDays } from '@/lib/format'
import type {
  PipelineKpis, RepLeaderboardRow,
  StalledDealRow, FastPacingDealRow,
  QuarterForecast, DiscoveryOpsRow, DiscoveryBookingWeek,
  RepAttainmentRow, GoalAttainmentRow, PipelineLagForecastRow,
} from '@/lib/types'

const STAGE_LABELS: Record<string, string> = {
  '0': 'Discovery Booked',
  '1': 'Discovery Held',
  '2': 'Solution Review',
  '3': 'Technical Validation',
  '4': 'Proposal Sent',
  '5': 'Procurement & Legal',
}

type PipelineData    = { kpis: PipelineKpis }
type VelocityOptions = { reps: { id: string; name: string }[]; segments: string[]; verticals: string[] }
type PivotRow        = { metric: 'conversion_rate' | 'avg_days'; [key: string]: string | number | null }
type VelocityResponse  = { pivot: PivotRow[]; options: VelocityOptions }
type DiscoveryResponse = { ops: DiscoveryOpsRow[]; weeks: DiscoveryBookingWeek[]; sdrNames: string[] }
type LagForecastResponse = {
  repAttainment: RepAttainmentRow[]
  goalAttainment: GoalAttainmentRow[]
  lagForecast: PipelineLagForecastRow[]
  currentQuarter: { year: number; quarter: number }
}
type SortField = 'attainment_pct' | 'closed_won_count' | 'avg_deal_arr' | 'win_rate_pct' | 'avg_age_days'
type DiscTab   = 'booking' | 'ops'

function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 truncate">{label}</p>
      <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

function FilterSelect({
  label, value, onChange, options, allLabel,
}: {
  label: string; value: string; onChange: (v: string) => void
  options: { value: string; label: string }[]; allLabel: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide shrink-0">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

function StalledBadge({ overage_pct }: { overage_pct: number }) {
  const color = overage_pct >= 200 ? 'bg-red-100 text-red-700'
              : overage_pct >= 50  ? 'bg-orange-100 text-orange-700'
              : 'bg-amber-100 text-amber-700'
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>
      +{overage_pct}%
    </span>
  )
}

function RoiFlag({ flag }: { flag: string }) {
  const cfg = flag === 'green'  ? { label: '● Efficient', cls: 'text-emerald-600' }
            : flag === 'yellow' ? { label: '● Mixed',     cls: 'text-amber-600'  }
            : flag === 'red'    ? { label: '● Expensive', cls: 'text-red-500'    }
            : { label: '—',       cls: 'text-slate-400' }
  return <span className={`text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>
}

export default function PipelinePage() {
  // ── Velocity / rep filters ───────────────────────────────────
  const [ownerId,   setOwnerId]   = useState('')
  const [segment,   setSegment]   = useState('')
  const [vertical,  setVertical]  = useState('')
  const [dealStage, setDealStage] = useState<'all' | 'open' | 'won'>('all')
  const [sortBy,    setSortBy]    = useState<SortField>('attainment_pct')
  const [lbSegment, setLbSegment] = useState('')
  const [lbVertical,setLbVertical]= useState('')

  // ── Discovery filters ────────────────────────────────────────
  const [discTab,    setDiscTab]    = useState<DiscTab>('booking')
  const [discSdr,    setDiscSdr]    = useState('')
  const [discSize,   setDiscSize]   = useState('')

  // ── Stalled / fast-pacing expand ────────────────────────────
  const [stalledExpanded, setStalledExpanded]   = useState(true)
  const [fastExpanded,    setFastExpanded]      = useState(true)
  const [forecastExpanded,setForecastExpanded]  = useState(true)

  // ── Queries ───────────────────────────────────────────────────
  const { data: pipelineData, isLoading: loadingPipeline } = useQuery<PipelineData>({
    queryKey: ['pipeline-kpis'],
    queryFn:  () => fetch('/api/pipeline/kpis').then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  const velParams = new URLSearchParams()
  if (ownerId)            velParams.set('owner_id',   ownerId)
  if (segment)            velParams.set('segment',    segment)
  if (vertical)           velParams.set('vertical',   vertical)
  if (dealStage !== 'all')velParams.set('deal_stage', dealStage)

  const { data: velocityData, isLoading: loadingVelocity } = useQuery<VelocityResponse>({
    queryKey: ['pipeline-velocity', ownerId, segment, vertical, dealStage],
    queryFn:  () => fetch(`/api/pipeline/velocity?${velParams}`).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  const repsParams = new URLSearchParams()
  if (lbSegment)  repsParams.set('segment',  lbSegment)
  if (lbVertical) repsParams.set('vertical', lbVertical)

  const { data: repsData, isLoading: loadingReps } = useQuery<RepLeaderboardRow[]>({
    queryKey: ['pipeline-reps', lbSegment, lbVertical],
    queryFn:  () => fetch(`/api/pipeline/reps?${repsParams}`).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  const { data: stalledData, isLoading: loadingStalled } = useQuery<StalledDealRow[]>({
    queryKey: ['pipeline-stalled'],
    queryFn:  () => fetch('/api/pipeline/stalled').then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  const { data: fastData, isLoading: loadingFast } = useQuery<FastPacingDealRow[]>({
    queryKey: ['pipeline-fast-pacing'],
    queryFn:  () => fetch('/api/pipeline/fast-pacing').then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  const { data: forecastData, isLoading: loadingForecast } = useQuery<{ quarter: QuarterForecast }>({
    queryKey: ['pipeline-forecast'],
    queryFn:  () => fetch('/api/pipeline/forecast').then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  })
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set())

  const discParams = new URLSearchParams()
  if (discSdr)  discParams.set('sdr',  discSdr)
  if (discSize) discParams.set('size', discSize)

  const { data: discoveryData, isLoading: loadingDiscovery } = useQuery<DiscoveryResponse>({
    queryKey: ['pipeline-discovery', discSdr, discSize],
    queryFn:  () => fetch(`/api/pipeline/discovery?${discParams}`).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  const { data: lagData, isLoading: loadingLag } = useQuery<LagForecastResponse>({
    queryKey: ['pipeline-lag-forecast'],
    queryFn:  () => fetch('/api/pipeline/lag-forecast').then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  const opts          = velocityData?.options
  const repOptions    = (opts?.reps     ?? []).map((r) => ({ value: r.id,    label: r.name }))
  const segmentOptions= (opts?.segments ?? []).map((s) => ({ value: s,      label: s }))
  const verticalOptions=(opts?.verticals?? []).map((v) => ({ value: v,      label: v }))
  const sdrOptions    = (discoveryData?.sdrNames ?? []).map((n) => ({ value: n, label: n }))
  const k = pipelineData?.kpis
  const stalled = stalledData ?? []
  const fast    = fastData    ?? []
  const quarter = forecastData?.quarter

  return (
    <div className="space-y-6">

      {/* ── KPI tiles ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {loadingPipeline ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-24 animate-pulse" />
          ))
        ) : k ? (
          <>
            <KpiTile label="Open Deals"        value={k.open_deals.toString()}         sub="Current quarter" />
            <KpiTile label="Pipeline ARR"      value={fmtUSD(k.pipeline_arr)}          sub="Current quarter" />
            <KpiTile label="Weighted ARR"      value={fmtUSD(k.weighted_arr)}          sub="Probability-adjusted" />
            <KpiTile label="Pipeline Coverage" value={fmtMultiple(k.pipeline_coverage)}sub="vs quarterly quota" />
            <KpiTile label="Win Rate"          value={fmtPct(k.win_rate_pct)}          sub="Trailing 12 months" />
            <KpiTile label="Avg Deal Size"     value={fmtUSD(k.avg_deal_arr)}          sub="Closed-won, T12M" />
            <KpiTile label="Avg Sales Cycle"   value={fmtDays(k.avg_cycle_days)}       sub="Closed-won, T12M" />
            <KpiTile label="Won ARR QTD"       value={fmtUSD(k.won_arr_qtd)}           sub="Current quarter" />
          </>
        ) : null}
      </div>

      {/* ── Close-Date Forecast ───────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          onClick={() => setForecastExpanded((v) => !v)}
          className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
        >
          <div>
            <h3 className="text-sm font-semibold text-slate-700">
              Close-Date Forecast{quarter ? ` — ${quarter.label}` : ''}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Closed vs. committed vs. gap to quota · expand each month to see deals</p>
          </div>
          <span className="text-slate-400 text-lg">{forecastExpanded ? '▲' : '▼'}</span>
        </button>

        {forecastExpanded && (
          <div className="border-t border-gray-100 p-5 space-y-5">
            {loadingForecast || !quarter ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded animate-pulse" />)}
              </div>
            ) : (() => {
              const quota     = quarter.quota || 1
              const barTotal  = Math.max(quota, quarter.closed_arr + quarter.committed_arr + quarter.pipeline_arr)
              const closedPct    = Math.min((quarter.closed_arr    / barTotal) * 100, 100)
              const committedPct = Math.min((quarter.committed_arr / barTotal) * 100, 100 - closedPct)
              const pipelinePct  = Math.min((quarter.pipeline_arr  / barTotal) * 100, 100 - closedPct - committedPct)
              const gapPct       = Math.max(0, 100 - closedPct - committedPct - pipelinePct)
              const monthQuota   = quarter.quota / 3

              const now         = new Date()
              const qIdx2       = Math.floor(now.getMonth() / 3)
              const qStartD     = new Date(now.getFullYear(), qIdx2 * 3, 1)
              const qEndD       = new Date(now.getFullYear(), qIdx2 * 3 + 3, 0)
              const totalDays   = Math.round((qEndD.getTime() - qStartD.getTime()) / 86400000) + 1
              const elapsedDays = Math.min(totalDays, Math.round((now.getTime() - qStartD.getTime()) / 86400000) + 1)
              const progressPct = Math.round((elapsedDays / totalDays) * 100)

              return (
                <>
                  {/* ── Quarter overview bar ─────────────────── */}
                  <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-slate-700">{quarter.label} Overview</span>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${quarter.gap > 0 ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-700'}`}>
                          {quarter.gap > 0 ? `${fmtUSD(quarter.gap)} gap to quota` : '✓ On Track'}
                        </span>
                      </div>
                      <span className="text-xs text-slate-400 shrink-0">Quota: <span className="font-semibold text-slate-600">{fmtUSD(quarter.quota)}</span></span>
                    </div>
                    {/* ARR stacked bar */}
                    <div className="relative h-5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="absolute inset-y-0 left-0 bg-indigo-600 rounded-l-full transition-all" style={{ width: `${closedPct}%` }} />
                      <div className="absolute inset-y-0 bg-indigo-400 transition-all" style={{ left: `${closedPct}%`, width: `${committedPct}%` }} />
                      <div className="absolute inset-y-0 bg-indigo-200 transition-all" style={{ left: `${closedPct + committedPct}%`, width: `${pipelinePct}%` }} />
                      {gapPct > 0 && <div className="absolute inset-y-0 bg-gray-200 rounded-r-full" style={{ left: `${closedPct + committedPct + pipelinePct}%`, width: `${gapPct}%` }} />}
                    </div>
                    {/* Legend */}
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-indigo-600 inline-block" /><span className="text-slate-500">Closed Won</span><span className="font-semibold text-slate-800 ml-1">{fmtUSD(quarter.closed_arr)}</span></span>
                      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-indigo-400 inline-block" /><span className="text-slate-500">Committed</span><span className="font-semibold text-slate-800 ml-1">{fmtUSD(quarter.committed_arr)}</span></span>
                      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-indigo-200 inline-block" /><span className="text-slate-500">Open Pipeline</span><span className="font-semibold text-slate-800 ml-1">{fmtUSD(quarter.pipeline_arr)}</span></span>
                    </div>
                    {/* Quarter progress bar */}
                    <div className="space-y-1 pt-1 border-t border-slate-200">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="font-medium text-slate-500">Quarter Progress</span>
                        <span>Day {elapsedDays} of {totalDays} &nbsp;·&nbsp; {progressPct}% elapsed</span>
                      </div>
                      <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div className="absolute inset-y-0 left-0 bg-slate-400 rounded-full" style={{ width: `${progressPct}%` }} />
                      </div>
                    </div>
                  </div>

                  {/* ── Month sub-bars ────────────────────────── */}
                  {quarter.months.map((m) => {

                    const mTotal      = Math.max(monthQuota, m.committed_arr + m.pipeline_arr)
                    const mCommPct    = mTotal > 0 ? Math.min((m.committed_arr / mTotal) * 100, 100) : 0
                    const mPipePct    = mTotal > 0 ? Math.min((m.pipeline_arr  / mTotal) * 100, 100 - mCommPct) : 0
                    const mGapPct     = Math.max(0, 100 - mCommPct - mPipePct)
                    const isExpanded  = expandedMonths.has(m.month)

                    return (
                      <div key={m.month} className="rounded-xl border border-gray-200 overflow-hidden">
                        <button
                          onClick={() => setExpandedMonths((prev) => {
                            const next = new Set(prev)
                            if (next.has(m.month)) next.delete(m.month)
                            else next.add(m.month)
                            return next
                          })}
                          className="w-full px-4 py-3 flex items-center gap-4 hover:bg-gray-50 transition-colors text-left"
                        >
                          <span className="text-xs font-semibold text-slate-600 w-28 shrink-0">{m.label}</span>
                          <div className="flex-1 relative h-3.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className="absolute inset-y-0 left-0 bg-indigo-400 rounded-l-full" style={{ width: `${mCommPct}%` }} />
                            <div className="absolute inset-y-0 bg-indigo-200" style={{ left: `${mCommPct}%`, width: `${mPipePct}%` }} />
                            {mGapPct > 0 && <div className="absolute inset-y-0 bg-gray-200 rounded-r-full" style={{ left: `${mCommPct + mPipePct}%`, width: `${mGapPct}%` }} />}
                          </div>
                          <div className="flex items-center gap-3 shrink-0 text-xs text-slate-500">
                            <span><span className="font-semibold text-slate-800">{fmtUSD(m.committed_arr)}</span> committed</span>
                            <span className="text-slate-300">·</span>
                            <span><span className="font-semibold text-slate-800">{fmtUSD(m.pipeline_arr)}</span> pipeline</span>
                            <span className="text-slate-300">·</span>
                            <span className="text-slate-400">{m.deals.length} deal{m.deals.length !== 1 ? 's' : ''}</span>
                          </div>
                          <span className="text-slate-400 text-sm ml-2">{isExpanded ? '▲' : '▼'}</span>
                        </button>

                        {isExpanded && m.deals.length > 0 && (
                          <table className="w-full text-sm border-t border-gray-100">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="text-left px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">Deal</th>
                                <th className="text-left px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">Company</th>
                                <th className="text-left px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">Stage</th>
                                <th className="text-left px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">Category</th>
                                <th className="text-right px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">ARR</th>
                                <th className="text-right px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">Prob</th>
                                <th className="text-left px-4 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide">Owner</th>
                              </tr>
                            </thead>
                            <tbody>
                              {m.deals.map((d) => (
                                <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                                  <td className="px-4 py-2 font-medium text-slate-700 max-w-[180px]"><span className="block truncate">{d.name}</span></td>
                                  <td className="px-4 py-2 text-slate-500 text-xs max-w-[140px]"><span className="block truncate">{d.company_name}</span></td>
                                  <td className="px-4 py-2 text-slate-500 text-xs whitespace-nowrap">{STAGE_LABELS[d.stage] ?? `Stage ${d.stage}`}</td>
                                  <td className="px-4 py-2">
                                    {d.forecast_category === 'Commit'
                                      ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">Committed</span>
                                      : <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-slate-600">{d.forecast_category || 'Pipeline'}</span>
                                    }
                                  </td>
                                  <td className="px-4 py-2 text-right tabular-nums font-semibold text-slate-900 whitespace-nowrap">{fmtUSD(d.arr)}</td>
                                  <td className="px-4 py-2 text-right tabular-nums text-slate-500">{d.probability}%</td>
                                  <td className="px-4 py-2 text-slate-500 text-xs whitespace-nowrap">{d.owner_name}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        {isExpanded && m.deals.length === 0 && (
                          <p className="text-sm text-slate-400 text-center py-6">No open deals closing in {m.label}.</p>
                        )}
                      </div>
                    )
                  })}
                </>
              )
            })()}
          </div>
        )}
      </div>

      {/* ── Panel B: Stage Velocity ────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <h3 className="text-sm font-semibold text-slate-700">Panel B — Stage Velocity &amp; Conversion</h3>
          <div className="flex flex-wrap gap-4">
            <FilterSelect label="Rep"      value={ownerId}   onChange={setOwnerId}   options={repOptions}      allLabel="All Reps"       />
            <FilterSelect label="Size"     value={segment}   onChange={setSegment}   options={segmentOptions}  allLabel="All Sizes"      />
            <FilterSelect label="Industry" value={vertical}  onChange={setVertical}  options={verticalOptions} allLabel="All Industries" />
            <FilterSelect
              label="Deals" value={dealStage}
              onChange={(v) => setDealStage(v as 'all' | 'open' | 'won')}
              options={[{ value: 'open', label: 'Open Pipeline Only' }, { value: 'won', label: 'Won Deals Only' }]}
              allLabel="All Deals"
            />
          </div>
        </div>
        {loadingVelocity ? (
          <div className="space-y-3 py-2">
            <div className="h-8 bg-gray-100 rounded animate-pulse" />
            <div className="h-8 bg-gray-100 rounded animate-pulse" />
          </div>
        ) : (
          <StageVelocityTable pivot={velocityData?.pivot ?? []} />
        )}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-400">
          <span>Conv. Rate: <span className="text-emerald-600 font-medium">≥75%</span> · <span className="text-amber-600 font-medium">50–74%</span> · <span className="text-red-500 font-medium">&lt;50%</span></span>
          <span>Avg Days: <span className="text-emerald-600 font-medium">≤14d</span> · <span className="text-amber-600 font-medium">15–30d</span> · <span className="text-red-500 font-medium">&gt;30d</span></span>
        </div>
      </div>

      {/* ── Panel C: Stalled Deals ────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          onClick={() => setStalledExpanded((v) => !v)}
          className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
        >
          <div>
            <h3 className="text-sm font-semibold text-slate-700">
              Panel C — Stalled Deals
              {!loadingStalled && (
                <span className="ml-2 text-xs font-normal text-slate-400">({stalled.length} deals)</span>
              )}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Deals exceeding typical stage dwell time · sorted by overage %</p>
          </div>
          <span className="text-slate-400 text-lg">{stalledExpanded ? '▲' : '▼'}</span>
        </button>

        {stalledExpanded && (
          <div className="border-t border-gray-100">
            {loadingStalled ? (
              <div className="p-5 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
              </div>
            ) : stalled.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No stalled deals detected.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Deal</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Stage</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">ARR</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">In Stage</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Typical</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Overage</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Close</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {stalled.slice(0, 20).map((d) => (
                    <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-700 truncate max-w-[180px]">{d.name}</p>
                        <p className="text-xs text-slate-400 truncate max-w-[180px]">{d.company_name}</p>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 text-xs">{STAGE_LABELS[d.stage] ?? `Stage ${d.stage}`}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-900">{fmtUSD(d.arr)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{d.current_stage_age_days}d</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">{d.avg_days_for_stage}d</td>
                      <td className="px-4 py-2.5 text-right"><StalledBadge overage_pct={d.overage_pct} /></td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">{d.close_date}</td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs">{d.owner_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* ── Panel D: Fast-Pacing Deals ────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          onClick={() => setFastExpanded((v) => !v)}
          className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
        >
          <div>
            <h3 className="text-sm font-semibold text-slate-700">
              Panel D — Fast-Pacing Deals
              {!loadingFast && (
                <span className="ml-2 text-xs font-normal text-slate-400">({fast.length} deals)</span>
              )}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Reaching current stage faster than p25 of peers · worth marketing assist or exec sponsor</p>
          </div>
          <span className="text-slate-400 text-lg">{fastExpanded ? '▲' : '▼'}</span>
        </button>

        {fastExpanded && (
          <div className="border-t border-gray-100">
            {loadingFast ? (
              <div className="p-5 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
              </div>
            ) : fast.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No fast-pacing deals detected.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Deal</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Stage</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">ARR</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Deal Age</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">p25 Benchmark</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Days Ahead</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Close</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {fast.slice(0, 15).map((d) => (
                    <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-700 truncate max-w-[180px]">{d.name}</p>
                        <p className="text-xs text-slate-400 truncate max-w-[180px]">{d.company_name}</p>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 text-xs">{STAGE_LABELS[d.stage] ?? `Stage ${d.stage}`}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-900">{fmtUSD(d.arr)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{d.deal_age_days}d</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">{d.p25_days_to_stage}d</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                          −{d.days_ahead}d
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">{d.close_date}</td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs">{d.owner_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* ── Panel E: Discovery Meeting Ops ────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Panel E — Discovery Meeting Operations</h3>
            <p className="text-xs text-slate-400 mt-0.5">Forward booking · SDR ops metrics</p>
          </div>
          <div className="flex gap-2">
            {(['booking', 'ops'] as DiscTab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setDiscTab(tab)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${discTab === tab ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-slate-600 hover:bg-gray-200'}`}
              >
                {tab === 'booking' ? 'Booking Forward' : 'SDR Ops Metrics'}
              </button>
            ))}
          </div>
        </div>

        {discTab === 'booking' && (
          <div className="p-5">
            {/* Filters */}
            <div className="flex flex-wrap gap-4 mb-4">
              <FilterSelect label="SDR"  value={discSdr}  onChange={setDiscSdr}  options={sdrOptions}   allLabel="All SDRs"  />
              <FilterSelect label="Size" value={discSize} onChange={setDiscSize} options={segmentOptions} allLabel="All Sizes" />
            </div>
            {loadingDiscovery ? (
              <div className="h-52 bg-gray-100 rounded animate-pulse" />
            ) : (
              <DiscoveryBookingChart weeks={discoveryData?.weeks ?? []} sdrFilter={discSdr} />
            )}
            <p className="text-xs text-slate-400 mt-2">Includes Scheduled + Rescheduling + No Show–Rescheduling statuses. Current week + 4 weeks ahead.</p>
          </div>
        )}

        {discTab === 'ops' && (
          <div>
            {loadingDiscovery ? (
              <div className="p-5 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
              </div>
            ) : (discoveryData?.ops ?? []).length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No discovery meeting data.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">SDR</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Segment</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Total</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Held Rate</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Hard No-Show</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Reschedule</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Disqualified</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Avg Reschedules</th>
                  </tr>
                </thead>
                <tbody>
                  {(discoveryData?.ops ?? []).map((sdr) => (
                    <tr key={sdr.sdr_id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-700">{sdr.sdr_name}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{sdr.sdr_segment}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{sdr.total_scheduled}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-semibold tabular-nums ${Number(sdr.held_rate) >= 0.65 ? 'text-emerald-600' : Number(sdr.held_rate) >= 0.5 ? 'text-amber-600' : 'text-red-500'}`}>
                          {fmtPct(Number(sdr.held_rate) * 100)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{fmtPct(Number(sdr.hard_no_show_rate) * 100)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{fmtPct(Number(sdr.reschedule_rate) * 100)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{fmtPct(Number(sdr.disqualification_rate) * 100)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-400">
                        {sdr.avg_reschedules_per_held != null ? Number(sdr.avg_reschedules_per_held).toFixed(2) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* ── Rep Leaderboard ────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4">
          <h3 className="text-sm font-semibold text-slate-700">Rep Leaderboard — QTD Attainment</h3>
          <div className="flex flex-wrap gap-4">
            <FilterSelect label="Size"     value={lbSegment}  onChange={setLbSegment}  options={segmentOptions}  allLabel="All Sizes"      />
            <FilterSelect label="Industry" value={lbVertical} onChange={setLbVertical} options={verticalOptions} allLabel="All Industries" />
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide shrink-0">Sort by</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortField)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="attainment_pct">Attainment</option>
                <option value="closed_won_count">Deals Won</option>
                <option value="avg_age_days">Avg Age</option>
                <option value="avg_deal_arr">Avg Deal</option>
                <option value="win_rate_pct">Win Rate</option>
              </select>
            </div>
          </div>
        </div>
        {loadingReps ? (
          <div className="p-5 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Rep</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Quota (Q)</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Attainment</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Deals Won</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Avg Age</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Avg Deal</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Win Rate</th>
              </tr>
            </thead>
            <tbody>
              {[...(repsData ?? [])].sort((a, b) => b[sortBy] - a[sortBy]).map((rep, i) => (
                <tr key={rep.owner_id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 w-4">{i + 1}</span>
                      <span className="font-medium text-slate-700">{rep.owner_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{fmtUSD(rep.quota)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-semibold tabular-nums ${rep.attainment_pct >= 100 ? 'text-emerald-600' : rep.attainment_pct >= 75 ? 'text-amber-600' : 'text-red-500'}`}>
                      {fmtPct(rep.attainment_pct)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">{rep.closed_won_count}</td>
                  <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{fmtDays(rep.avg_age_days)}</td>
                  <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{fmtUSD(rep.avg_deal_arr)}</td>
                  <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{fmtPct(rep.win_rate_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── v2.1 Rep Quota Attainment ──────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-slate-700">
            Rep Quota Attainment — Q{lagData?.currentQuarter.quarter ?? '?'} {lagData?.currentQuarter.year ?? ''}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">From <code className="bg-gray-100 px-1 rounded">mv_rep_attainment</code> · ramp-adjusted quota · pipeline 2 quarters out</p>
        </div>
        {loadingLag ? (
          <div className="p-5 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
          </div>
        ) : (lagData?.repAttainment ?? []).length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No rep attainment data for current quarter.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Rep</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Segment</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Eff. Quota</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">ARR Closed</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Attainment</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Pipeline +2Q</th>
              </tr>
            </thead>
            <tbody>
              {(lagData?.repAttainment ?? []).map((r) => (
                <tr key={r.user_id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-700">{r.rep_name}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{r.rep_segment}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${r.ramp_status === 'Ramped' ? 'bg-emerald-100 text-emerald-700' : r.ramp_status === 'Ramping' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                      {r.ramp_status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">{fmtUSD(r.effective_quota)}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900">{fmtUSD(r.arr_closed)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-semibold tabular-nums ${r.pct_attainment >= 100 ? 'text-emerald-600' : r.pct_attainment >= 75 ? 'text-amber-600' : 'text-red-500'}`}>
                      {fmtPct(r.pct_attainment)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-500">{fmtUSD(r.pipeline_2_qtrs_out)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── v2.1 Goal Attainment vs. 2026 Plan ────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-slate-700">2026 Revenue Goal Attainment</h3>
          <p className="text-xs text-slate-400 mt-0.5">From <code className="bg-gray-100 px-1 rounded">mv_attainment_by_period</code> · Annual + quarterly targets vs. closed-won ARR</p>
        </div>
        {loadingLag ? (
          <div className="p-5 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}
          </div>
        ) : (lagData?.goalAttainment ?? []).length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No goal attainment data.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Period</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Segment</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">ARR Goal</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actual ARR</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Wins</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Attainment</th>
              </tr>
            </thead>
            <tbody>
              {(lagData?.goalAttainment ?? []).map((g) => {
                const qLabel = g.period_quarter != null ? `Q${g.period_quarter} ${g.period_year}` : `FY${g.period_year}`
                const pct    = g.pct_attainment
                return (
                  <tr key={g.goal_id} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${g.period_quarter == null ? 'bg-slate-50/60 font-medium' : ''}`}>
                    <td className="px-4 py-3 text-slate-700">{qLabel}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{g.segment ?? 'All'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">{fmtUSD(g.total_arr_goal)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900">{fmtUSD(g.actual_total_arr)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">{g.actual_total_wins}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-1.5 rounded-full ${pct >= 100 ? 'bg-emerald-500' : pct >= 75 ? 'bg-amber-500' : 'bg-red-400'}`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                        <span className={`text-xs font-semibold tabular-nums ${pct >= 100 ? 'text-emerald-600' : pct >= 75 ? 'text-amber-600' : 'text-red-500'}`}>
                          {fmtPct(pct)}
                        </span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── v2.1 Pipeline Lag Forecast ────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-slate-700">Pipeline Lag Forecast — Next 4 Quarters</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            From <code className="bg-gray-100 px-1 rounded">mv_pipeline_lag_forecast</code> ·
            Projected wins = pipeline created N quarters ago × historical win rate
          </p>
        </div>
        {loadingLag ? (
          <div className="p-5 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
          </div>
        ) : (lagData?.lagForecast ?? []).length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No pipeline lag forecast data.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Close Quarter</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Segment</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Lag (Qtrs)</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Source Pipeline</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Win Rate</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Projected ARR</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Proj. Wins</th>
              </tr>
            </thead>
            <tbody>
              {(lagData?.lagForecast ?? []).map((row, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-2.5 text-slate-700 font-medium">{row.close_quarter}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{row.segment}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{row.lag_quarters}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{fmtUSD(row.source_pipeline_arr)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">{fmtPct(row.assumed_win_rate)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-900">{fmtUSD(row.projected_arr)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{Math.round(row.projected_wins)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  )
}
