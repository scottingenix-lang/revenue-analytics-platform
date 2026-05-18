'use client'

import { useState, useDeferredValue } from 'react'
import { useQuery } from '@tanstack/react-query'
import AiPanel from '@/components/ai/AiPanel'
import AttributionBarChart, { ATTRIBUTION_STAGES, type StageKey } from '@/components/charts/AttributionBarChart'
import { fmtUSD, fmtPct } from '@/lib/format'
import type { AttributionRow, ChannelHandoffRow, SourceConversionRow, CrossSectionRow, DealSearchResult, DealJourneyResponse } from '@/lib/types'

type HandoffResponse = {
  rows: ChannelHandoffRow[]
  originalSources: string[]
  dealSources: string[]
}

type Model = 'first_touch' | 'last_touch' | 'linear' | 'time_decay' | 'w_shaped'
type Timeframe = 'this_quarter' | 'last_quarter' | 'this_year' | 'all_time'

const MODELS: { id: Model; label: string }[] = [
  { id: 'last_touch',  label: 'Converting Touch' },
  { id: 'first_touch', label: 'First Touch' },
  { id: 'time_decay',  label: 'Most Recent' },
]

const MODEL_DESCRIPTIONS: Record<Model, string> = {
  first_touch: '100% credit to the first marketing touch before the deal was created.',
  last_touch:  '100% credit to the last marketing touch before the deal was created.',
  linear:      'Equal credit distributed across all pre-deal touches.',
  time_decay:  'More credit to recent touches; decays by 50% every 90 days.',
  w_shaped:    '30% first touch, 30% mid-funnel, 30% last touch, 10% spread across remainder.',
}

const TIMEFRAMES: { id: Timeframe; label: string }[] = [
  { id: 'this_quarter', label: 'This Quarter' },
  { id: 'last_quarter', label: 'Last Quarter' },
  { id: 'this_year',    label: 'This Year' },
  { id: 'all_time',     label: 'All Time' },
]

const ALL_STAGE_KEYS = new Set(ATTRIBUTION_STAGES.map((s) => s.key)) as Set<StageKey>

export default function AttributionPage() {
  const [model, setModel]           = useState<Model>('last_touch')
  const [timeframe, setTimeframe]   = useState<Timeframe>('all_time')
  const [visibleStages, setVisible] = useState<Set<StageKey>>(new Set(ALL_STAGE_KEYS))
  const [handoffView, setHandoffView] = useState<'table' | 'matrix'>('matrix')
  const [convDimension, setConvDimension] = useState<'lead_source' | 'company_size' | 'industry'>('industry')

  // Journey search state
  const [journeyInput, setJourneyInput]   = useState('')
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null)
  const deferredSearch = useDeferredValue(journeyInput)

  const { data, isLoading } = useQuery<AttributionRow[]>({
    queryKey: ['attribution', model, timeframe],
    queryFn: () =>
      fetch(`/api/attribution/by-source?model=${model}&timeframe=${timeframe}`).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  const { data: handoffData, isLoading: loadingHandoff } = useQuery<HandoffResponse>({
    queryKey: ['attribution-handoff'],
    queryFn:  () => fetch('/api/attribution/handoff').then((r) => r.json()),
    staleTime: 10 * 60 * 1000,
  })

  const { data: convRates, isLoading: loadingConv } = useQuery<SourceConversionRow[]>({
    queryKey: ['attribution-conversion-rates', convDimension],
    queryFn:  () => fetch(`/api/attribution/conversion-rates?dimension=${convDimension}`).then((r) => r.json()),
    staleTime: 10 * 60 * 1000,
  })

  const { data: crossSection, isLoading: loadingCrossSection } = useQuery<{ top5: CrossSectionRow[]; bottom5: CrossSectionRow[] }>({
    queryKey: ['attribution-cross-section'],
    queryFn:  () => fetch('/api/attribution/cross-section').then((r) => r.json()),
    staleTime: 10 * 60 * 1000,
  })

  const { data: searchResults } = useQuery<DealSearchResult[]>({
    queryKey: ['deal-search', deferredSearch],
    queryFn:  () => fetch(`/api/attribution/deal-journey?q=${encodeURIComponent(deferredSearch)}`).then((r) => r.json()),
    enabled: deferredSearch.length >= 2 && !selectedDealId,
    staleTime: 60 * 1000,
  })

  const { data: journeyData, isLoading: loadingJourney } = useQuery<DealJourneyResponse>({
    queryKey: ['deal-journey', selectedDealId],
    queryFn:  () => fetch(`/api/attribution/deal-journey?id=${selectedDealId}`).then((r) => r.json()),
    enabled: !!selectedDealId,
    staleTime: 5 * 60 * 1000,
  })

  function toggleStage(key: StageKey) {
    setVisible((prev) => {
      const next = new Set(prev)
      if (next.has(key)) { next.delete(key) } else { next.add(key) }
      return next
    })
  }

  const isWeighted = model === 'time_decay'
  const valueLabel = isWeighted ? 'Weighted Score' : 'Attributed ARR'

  return (
    <div className="space-y-6">
      {/* AI Attribution Insight */}
      <AiPanel page="attribution" panelId="attribution_insight" title="AI Attribution Insight" />

      {/* ── Company Size × Industry Win Rate Summary ──────────── */}
      <div data-tour="win-rate-cross-section" className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-slate-700">Win Rate by Segment Combination</h3>
          <p className="text-xs text-slate-400 mt-0.5">Company size × industry cross-section · closed-won and closed-lost deals · min 5 decided</p>
        </div>
        {loadingCrossSection ? (
          <div className="p-5 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
            {/* Top 5 */}
            <div>
              <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-100">
                <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Top 5 Win Combinations</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Segment</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide"># Wins</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Win Rate</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Days to Win</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Avg ARR</th>
                  </tr>
                </thead>
                <tbody>
                  {(crossSection?.top5 ?? []).map((r, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 text-slate-700 font-medium">{r.industry} · {r.company_size}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{r.wins}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-emerald-600">{r.win_rate.toFixed(1)}%</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{r.avg_days_to_win}d</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{fmtUSD(r.avg_arr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bottom 5 */}
            <div>
              <div className="px-5 py-3 bg-red-50 border-b border-red-100">
                <span className="text-xs font-semibold text-red-600 uppercase tracking-wide">Top 5 Losing Combinations</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Segment</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide"># Wins</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Win Rate</th>
                    <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Days to Win</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Avg ARR</th>
                  </tr>
                </thead>
                <tbody>
                  {(crossSection?.bottom5 ?? []).map((r, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 text-slate-700 font-medium">{r.industry} · {r.company_size}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{r.wins}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-red-500">{r.win_rate.toFixed(1)}%</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{r.avg_days_to_win > 0 ? `${r.avg_days_to_win}d` : '—'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{r.avg_arr > 0 ? fmtUSD(r.avg_arr) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Model selector */}
      <div data-tour="attribution-models" className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap gap-2 mb-3">
          {MODELS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setModel(id)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                model === id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-slate-600 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">{MODEL_DESCRIPTIONS[model]}</p>
      </div>

      {/* Stage + Timeframe filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Stage checkboxes */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide shrink-0">
              Stages
            </span>
            {ATTRIBUTION_STAGES.map(({ key, label, color }) => {
              const checked = visibleStages.has(key)
              return (
                <label key={key} className="flex items-center gap-1.5 cursor-pointer select-none">
                  <span
                    onClick={() => toggleStage(key)}
                    className="w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors"
                    style={{
                      borderColor: color,
                      backgroundColor: checked ? color : 'transparent',
                    }}
                  >
                    {checked && (
                      <svg viewBox="0 0 8 8" className="w-2.5 h-2.5" fill="none">
                        <path d="M1 4l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span className="text-xs text-slate-600">{label}</span>
                </label>
              )
            })}
          </div>

          {/* Timeframe dropdown */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Timeframe
            </span>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as Timeframe)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              {TIMEFRAMES.map(({ id, label }) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">
          {valueLabel} by Source — {MODELS.find((m) => m.id === model)?.label}
        </h3>
        {isLoading ? (
          <div className="space-y-2 py-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : (data ?? []).length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-12">No attribution data found.</p>
        ) : visibleStages.size === 0 ? (
          <p className="text-sm text-slate-400 text-center py-12">Select at least one stage to display.</p>
        ) : (
          <AttributionBarChart data={data ?? []} visibleStages={visibleStages} />
        )}
      </div>

      {/* Table */}
      {!isLoading && (data ?? []).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Source</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Deals</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{valueLabel}</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((row, i) => (
                <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-slate-700 font-medium">{row.attributed_source}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{row.deal_count}</td>
                  <td className="px-4 py-3 text-right text-slate-900 font-semibold tabular-nums">
                    {isWeighted ? row.closed_won_arr.toFixed(1) : fmtUSD(row.closed_won_arr)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-20 bg-gray-100 rounded-full h-1.5">
                        <div
                          className="bg-indigo-500 h-1.5 rounded-full"
                          style={{ width: `${Math.min(row.pct_of_total_arr, 100)}%` }}
                        />
                      </div>
                      <span className="text-slate-600 tabular-nums w-10 text-right">
                        {fmtPct(row.pct_of_total_arr)}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Channel Handoff Matrix ─────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Channel Handoff Matrix</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Champion&apos;s <span className="font-medium text-slate-500">original_lead_source</span> (acquisition) →
              deal-stamped <span className="font-medium text-slate-500">lead_source</span> (conversion) · closed-won deals only
            </p>
          </div>
          <div className="flex gap-2">
            {(['matrix', 'table'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setHandoffView(v)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${handoffView === v ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-slate-600 hover:bg-gray-200'}`}
              >
                {v === 'matrix' ? 'Heat Map' : 'Detail Table'}
              </button>
            ))}
          </div>
        </div>

        {loadingHandoff ? (
          <div className="p-5 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}
          </div>
        ) : !handoffData || handoffData.rows.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">No handoff data available.</p>
        ) : handoffView === 'matrix' ? (
          /* Heat map grid */
          <div className="p-5 overflow-x-auto">
            <p className="text-xs text-slate-400 mb-3">
              Rows = original acquisition channel &nbsp;·&nbsp; Columns = deal-stamped conversion channel &nbsp;·&nbsp;
              Cell color intensity = deal count &nbsp;·&nbsp; Diagonal = same channel acquisition &amp; conversion
            </p>
            {(() => {
              const origSrcs = handoffData.originalSources
              const dealSrcs = handoffData.dealSources
              // Build lookup
              const lookup: Record<string, { deal_count: number; pct: number }> = {}
              for (const r of handoffData.rows) {
                lookup[`${r.original_lead_source}|||${r.deal_lead_source}`] = {
                  deal_count: r.deal_count,
                  pct: r.pct_of_source,
                }
              }
              // Max for color intensity
              const maxCount = Math.max(...handoffData.rows.map((r) => r.deal_count), 1)
              return (
                <table className="text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-left text-slate-400 font-normal whitespace-nowrap">Original ↓ / Deal →</th>
                      {dealSrcs.map((ds) => (
                        <th key={ds} className="px-2 py-2 text-slate-500 font-semibold whitespace-nowrap text-center max-w-[80px]">
                          <span className="inline-block max-w-[72px] truncate">{ds}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {origSrcs.map((os) => (
                      <tr key={os}>
                        <td className="px-3 py-1.5 font-semibold text-slate-600 whitespace-nowrap border-r border-gray-100">{os}</td>
                        {dealSrcs.map((ds) => {
                          const cell = lookup[`${os}|||${ds}`]
                          const isDiag = os === ds
                          const intensity = cell ? cell.deal_count / maxCount : 0
                          const bgAlpha = Math.round(intensity * 100)
                          return (
                            <td
                              key={ds}
                              title={cell ? `${cell.deal_count} deals (${cell.pct}% of ${os} source)` : '0 deals'}
                              className="text-center py-1.5 px-2 border border-gray-50"
                              style={{
                                backgroundColor: cell
                                  ? isDiag
                                    ? `rgba(99,102,241,${intensity * 0.7 + 0.05})`
                                    : `rgba(16,185,129,${intensity * 0.6 + 0.05})`
                                  : undefined,
                                minWidth: 56,
                              }}
                            >
                              {cell ? (
                                <span className={`font-semibold ${bgAlpha > 40 ? 'text-white' : isDiag ? 'text-indigo-700' : 'text-emerald-700'}`}>
                                  {cell.deal_count}
                                </span>
                              ) : (
                                <span className="text-gray-200">—</span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            })()}
            <p className="text-xs text-slate-400 mt-3">
              <span className="inline-block w-3 h-3 rounded-sm bg-indigo-400 mr-1 align-middle" />Diagonal (same channel) &nbsp;
              <span className="inline-block w-3 h-3 rounded-sm bg-emerald-400 mr-1 align-middle" />Off-diagonal (channel handoff)
            </p>
          </div>
        ) : (
          /* Detail table */
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Original Source</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Deal Source</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Deals</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Closed-Won ARR</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">% of Orig. Source</th>
              </tr>
            </thead>
            <tbody>
              {handoffData.rows.slice(0, 30).map((r, i) => (
                <tr key={i} className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${r.original_lead_source === r.deal_lead_source ? 'bg-indigo-50/30' : ''}`}>
                  <td className="px-4 py-2.5 text-slate-700 font-medium">{r.original_lead_source}</td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {r.original_lead_source === r.deal_lead_source
                      ? <span className="text-indigo-600 font-medium">{r.deal_lead_source} ✓</span>
                      : r.deal_lead_source}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-900 font-semibold">{r.deal_count}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{fmtUSD(r.closed_won_arr)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">{r.pct_of_source}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Source Funnel Conversion Rates ─────────────────────── */}
      <div data-tour="funnel-conversion" className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Funnel Conversion Rates</h3>
            <p className="text-xs text-slate-400 mt-0.5">Trailing 12 months · Lead → MQL → SQL and pipeline stage progressions</p>
          </div>
          <select
            value={convDimension}
            onChange={(e) => setConvDimension(e.target.value as typeof convDimension)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="lead_source">Lead Source</option>
            <option value="company_size">Company Size</option>
            <option value="industry">Industry</option>
          </select>
        </div>
        {loadingConv ? (
          <div className="p-5 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}
          </div>
        ) : (convRates ?? []).length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No conversion rate data.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Source</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">MQLs</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">SQLs</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">MQL → SQL</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">0 → 1</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">1 → 2</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">2 → 3</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">3 → 4</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">4 → 5</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">5 → Won</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide border-l-2 border-gray-200">Win Rate</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Deal Count</th>
              </tr>
            </thead>
            <tbody>
              {(convRates ?? []).map((r, i) => {
                function stageColor(p: number) {
                  return p >= 70 ? 'text-emerald-600' : p >= 50 ? 'text-amber-600' : 'text-red-500'
                }
                function mktColor(p: number) {
                  return p >= 20 ? 'text-emerald-600' : p >= 8 ? 'text-amber-600' : 'text-red-500'
                }
                function winRateColor(p: number) {
                  return p >= 20 ? 'text-emerald-600' : p >= 15 ? 'text-amber-600' : 'text-red-500'
                }
                return (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-700">{r.lead_source}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">{r.trailing_12mo_mqls.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">{r.trailing_12mo_sqls.toLocaleString()}</td>
                    <td className={`px-4 py-3 text-right tabular-nums font-semibold ${mktColor(r.mql_to_sql_pct)}`}>{r.mql_to_sql_pct.toFixed(1)}%</td>
                    <td className={`px-4 py-3 text-right tabular-nums font-semibold ${stageColor(r.s0_to_s1)}`}>{r.s0_to_s1 > 0 ? `${r.s0_to_s1.toFixed(0)}%` : <span className="text-slate-300">—</span>}</td>
                    <td className={`px-4 py-3 text-right tabular-nums font-semibold ${stageColor(r.s1_to_s2)}`}>{r.s1_to_s2 > 0 ? `${r.s1_to_s2.toFixed(0)}%` : <span className="text-slate-300">—</span>}</td>
                    <td className={`px-4 py-3 text-right tabular-nums font-semibold ${stageColor(r.s2_to_s3)}`}>{r.s2_to_s3 > 0 ? `${r.s2_to_s3.toFixed(0)}%` : <span className="text-slate-300">—</span>}</td>
                    <td className={`px-4 py-3 text-right tabular-nums font-semibold ${stageColor(r.s3_to_s4)}`}>{r.s3_to_s4 > 0 ? `${r.s3_to_s4.toFixed(0)}%` : <span className="text-slate-300">—</span>}</td>
                    <td className={`px-4 py-3 text-right tabular-nums font-semibold ${stageColor(r.s4_to_s5)}`}>{r.s4_to_s5 > 0 ? `${r.s4_to_s5.toFixed(0)}%` : <span className="text-slate-300">—</span>}</td>
                    <td className={`px-4 py-3 text-right tabular-nums font-semibold ${stageColor(r.s5_to_s6)}`}>{r.s5_to_s6 > 0 ? `${r.s5_to_s6.toFixed(0)}%` : <span className="text-slate-300">—</span>}</td>
                    <td className={`px-4 py-3 text-right tabular-nums font-semibold border-l-2 border-gray-200 ${winRateColor(r.win_rate)}`}>{r.win_rate > 0 ? `${r.win_rate.toFixed(1)}%` : <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">{r.deal_count > 0 ? r.deal_count : <span className="text-slate-300">—</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Show Me the Path — Deal Journey ───────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-slate-700">Show Me the Path</h3>
          <p className="text-xs text-slate-400 mt-0.5">Trace every marketing touch that led to a deal · search by opportunity name</p>
        </div>
        <div className="p-5">
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search opportunity name…"
              value={journeyInput}
              onChange={(e) => { setJourneyInput(e.target.value); setSelectedDealId(null) }}
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-10"
            />
            {journeyInput && (
              <button
                onClick={() => { setJourneyInput(''); setSelectedDealId(null) }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                ×
              </button>
            )}
          </div>

          {/* Search results dropdown */}
          {!selectedDealId && deferredSearch.length >= 2 && (searchResults ?? []).length > 0 && (
            <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden shadow-sm">
              {(searchResults ?? []).map((r) => (
                <button
                  key={r.id}
                  onClick={() => { setSelectedDealId(r.id); setJourneyInput(r.name) }}
                  className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 border-b border-gray-50 last:border-0 transition-colors"
                >
                  <span className="font-medium text-slate-700 text-sm">{r.name}</span>
                  <span className="ml-3 text-xs text-slate-400">{r.stage} · {r.lead_source ?? '—'} · {r.close_date?.slice(0, 7)}</span>
                </button>
              ))}
            </div>
          )}
          {!selectedDealId && deferredSearch.length >= 2 && (searchResults ?? []).length === 0 && (
            <p className="mt-2 text-sm text-slate-400">No deals found matching &quot;{deferredSearch}&quot;.</p>
          )}

          {/* Journey view */}
          {selectedDealId && (
            loadingJourney ? (
              <div className="mt-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}</div>
            ) : journeyData ? (
              <div className="mt-4 space-y-4">
                {/* Deal summary bar */}
                <div className="flex flex-wrap gap-4 p-4 bg-indigo-50 rounded-lg text-sm">
                  <div><span className="text-xs text-slate-500 block">Opportunity</span><span className="font-semibold text-slate-800">{journeyData.opp.name}</span></div>
                  <div><span className="text-xs text-slate-500 block">ARR</span><span className="font-semibold text-slate-800">{fmtUSD(journeyData.opp.arr)}</span></div>
                  <div><span className="text-xs text-slate-500 block">Stage</span><span className="font-semibold text-slate-800">{journeyData.opp.stage === '6' ? 'Closed Won' : journeyData.opp.stage === '7' ? 'Closed Lost' : `Stage ${journeyData.opp.stage}`}</span></div>
                  <div><span className="text-xs text-slate-500 block">Owner</span><span className="font-semibold text-slate-800">{journeyData.opp.owner_name ?? '—'}</span></div>
                  {journeyData.contact && (
                    <div><span className="text-xs text-slate-500 block">Champion</span><span className="font-semibold text-slate-800">{journeyData.contact.first_name} {journeyData.contact.last_name}{journeyData.contact.title ? ` · ${journeyData.contact.title}` : ''}</span></div>
                  )}
                  <div><span className="text-xs text-slate-500 block">Deal Source</span><span className="font-semibold text-slate-800">{journeyData.opp.lead_source ?? '—'}</span></div>
                  {journeyData.contact?.original_lead_source && (
                    <div><span className="text-xs text-slate-500 block">Contact Orig. Source</span><span className="font-semibold text-slate-800">{journeyData.contact.original_lead_source}</span></div>
                  )}
                </div>

                {/* Timeline */}
                {journeyData.touches.length === 0 && !journeyData.contact ? (
                  <p className="text-sm text-slate-400 text-center py-4">No primary contact linked to this deal — unable to retrieve touch history.</p>
                ) : journeyData.touches.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">No marketing touches recorded for the primary contact on this deal.</p>
                ) : (
                  <div className="relative pl-6">
                    {/* Vertical line */}
                    <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-gray-200" />

                    {journeyData.touches.map((t, i) => {
                      const isPreDeal = t.pre_or_post_deal === 'pre'
                      const isPostDeal = t.pre_or_post_deal === 'post'
                      const dotColor = isPreDeal ? 'bg-indigo-500' : isPostDeal ? 'bg-emerald-500' : 'bg-gray-400'
                      const date = new Date(t.touch_date)
                      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

                      // Insert "Opp Created" milestone before first post-deal touch
                      const prevIsPreDeal = i > 0 ? journeyData.touches[i - 1].pre_or_post_deal === 'pre' || journeyData.touches[i - 1].pre_or_post_deal === 'no_deal' : false
                      const showMilestone = (isPostDeal || t.pre_or_post_deal === 'no_deal') && i > 0 && prevIsPreDeal

                      return (
                        <div key={t.id}>
                          {showMilestone && (
                            <div className="relative mb-3 -ml-1">
                              <div className="absolute -left-5 top-1.5 w-3 h-3 rounded-full bg-teal-500 border-2 border-white shadow-sm" />
                              <div className="bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 text-xs">
                                <span className="font-semibold text-teal-700">Opportunity Created</span>
                                <span className="ml-2 text-teal-500">{journeyData.opp.created_date?.slice(0, 10)}</span>
                              </div>
                            </div>
                          )}
                          <div className="relative mb-3 -ml-1">
                            <div className={`absolute -left-5 top-2 w-2.5 h-2.5 rounded-full ${dotColor} border-2 border-white shadow-sm`} />
                            <div className="flex flex-wrap items-start gap-x-3 gap-y-0.5">
                              <span className="text-xs text-slate-400 whitespace-nowrap mt-0.5 w-24 shrink-0">{dateStr}</span>
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium text-slate-700">{t.touch_type}</span>
                                {t.campaign && (
                                  <span className="ml-2 text-xs text-indigo-600 font-medium">{t.campaign.name}</span>
                                )}
                                <div className="flex gap-3 mt-0.5">
                                  <span className={`text-xs ${isPreDeal ? 'text-indigo-400' : isPostDeal ? 'text-emerald-400' : 'text-gray-400'}`}>
                                    {isPreDeal ? 'Pre-deal' : isPostDeal ? 'Post-deal' : 'No deal'}
                                  </span>
                                  <span className="text-xs text-slate-400">Score: {t.engagement_score}</span>
                                  {t.touch_value != null && t.touch_value > 0 && (
                                    <span className="text-xs text-slate-400">{fmtUSD(t.touch_value)}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}

                    {/* Opp created after all pre-deal touches if no post-deal touches exist */}
                    {journeyData.touches.length > 0 && journeyData.touches.every((t) => t.pre_or_post_deal === 'pre') && (
                      <div className="relative mb-3 -ml-1">
                        <div className="absolute -left-5 top-1.5 w-3 h-3 rounded-full bg-teal-500 border-2 border-white shadow-sm" />
                        <div className="bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 text-xs">
                          <span className="font-semibold text-teal-700">Opportunity Created</span>
                          <span className="ml-2 text-teal-500">{journeyData.opp.created_date?.slice(0, 10)}</span>
                        </div>
                      </div>
                    )}

                    <div className="text-xs text-slate-400 mt-2">
                      <span className="inline-flex items-center gap-1 mr-4"><span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" /> Pre-deal touch</span>
                      <span className="inline-flex items-center gap-1 mr-4"><span className="w-3 h-3 rounded-full bg-teal-500 inline-block" /> Opp created</span>
                      <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Post-deal touch</span>
                    </div>
                  </div>
                )}
              </div>
            ) : null
          )}
        </div>
      </div>
    </div>
  )
}
