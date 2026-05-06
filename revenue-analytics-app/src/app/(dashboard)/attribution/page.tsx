'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import AttributionBarChart, { ATTRIBUTION_STAGES, type StageKey } from '@/components/charts/AttributionBarChart'
import { fmtUSD, fmtPct } from '@/lib/format'
import type { AttributionRow } from '@/lib/types'

type Model = 'first_touch' | 'last_touch' | 'linear' | 'time_decay' | 'w_shaped'
type Timeframe = 'this_quarter' | 'last_quarter' | 'this_year' | 'all_time'

const MODELS: { id: Model; label: string }[] = [
  { id: 'first_touch', label: 'First Touch' },
  { id: 'last_touch',  label: 'Last Touch' },
  { id: 'linear',      label: 'Linear' },
  { id: 'time_decay',  label: 'Time Decay' },
  { id: 'w_shaped',    label: 'W-Shaped' },
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
  const [model, setModel]           = useState<Model>('first_touch')
  const [timeframe, setTimeframe]   = useState<Timeframe>('all_time')
  const [visibleStages, setVisible] = useState<Set<StageKey>>(new Set(ALL_STAGE_KEYS))

  const { data, isLoading } = useQuery<AttributionRow[]>({
    queryKey: ['attribution', model, timeframe],
    queryFn: () =>
      fetch(`/api/attribution/by-source?model=${model}&timeframe=${timeframe}`).then((r) => r.json()),
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
      {/* Model selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
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
    </div>
  )
}
