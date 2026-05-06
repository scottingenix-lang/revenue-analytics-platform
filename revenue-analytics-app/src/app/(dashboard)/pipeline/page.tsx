'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import StageVelocityTable from '@/components/charts/StageVelocityTable'
import { fmtUSD, fmtPct, fmtMultiple, fmtDays } from '@/lib/format'
import type { PipelineKpis, RepLeaderboardRow } from '@/lib/types'

type PipelineData = { kpis: PipelineKpis }

type VelocityOptions = {
  reps: { id: string; name: string }[]
  segments: string[]
  verticals: string[]
}

type PivotRow = {
  metric: 'conversion_rate' | 'avg_days'
  [key: string]: string | number | null
}

type VelocityResponse = {
  pivot: PivotRow[]
  options: VelocityOptions
}

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
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  allLabel: string
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

export default function PipelinePage() {
  const [ownerId,   setOwnerId]   = useState('')
  const [segment,   setSegment]   = useState('')
  const [vertical,  setVertical]  = useState('')
  const [dealStage, setDealStage] = useState<'all' | 'open' | 'won'>('all')

  type SortField = 'attainment_pct' | 'closed_won_count' | 'avg_deal_arr' | 'win_rate_pct' | 'avg_age_days'
  const [sortBy,      setSortBy]      = useState<SortField>('attainment_pct')
  const [lbSegment,   setLbSegment]   = useState('')
  const [lbVertical,  setLbVertical]  = useState('')

  const { data: pipelineData, isLoading: loadingPipeline } = useQuery<PipelineData>({
    queryKey: ['pipeline-kpis'],
    queryFn: () => fetch('/api/pipeline/kpis').then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  const repsParams = new URLSearchParams()
  if (lbSegment)  repsParams.set('segment',  lbSegment)
  if (lbVertical) repsParams.set('vertical', lbVertical)

  const { data: repsData, isLoading: loadingReps } = useQuery<RepLeaderboardRow[]>({
    queryKey: ['pipeline-reps', lbSegment, lbVertical],
    queryFn: () => fetch(`/api/pipeline/reps?${repsParams}`).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  const velocityParams = new URLSearchParams()
  if (ownerId)              velocityParams.set('owner_id',   ownerId)
  if (segment)              velocityParams.set('segment',    segment)
  if (vertical)             velocityParams.set('vertical',   vertical)
  if (dealStage !== 'all')  velocityParams.set('deal_stage', dealStage)
  const velocityUrl = `/api/pipeline/velocity?${velocityParams}`

  const { data: velocityData, isLoading: loadingVelocity } = useQuery<VelocityResponse>({
    queryKey: ['pipeline-velocity', ownerId, segment, vertical, dealStage],
    queryFn: () => fetch(velocityUrl).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  // Keep options stable from first load
  const opts = velocityData?.options
  const repOptions      = (opts?.reps ?? []).map((r) => ({ value: r.id, label: r.name }))
  const segmentOptions  = (opts?.segments ?? []).map((s) => ({ value: s, label: s }))
  const verticalOptions = (opts?.verticals ?? []).map((v) => ({ value: v, label: v }))

  const k = pipelineData?.kpis

  return (
    <div className="space-y-6">
      {/* KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {loadingPipeline ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-24 animate-pulse" />
          ))
        ) : k ? (
          <>
            <KpiTile label="Open Deals"        value={k.open_deals.toString()}      sub="Current quarter" />
            <KpiTile label="Pipeline ARR"      value={fmtUSD(k.pipeline_arr)}       sub="Current quarter" />
            <KpiTile label="Weighted ARR"      value={fmtUSD(k.weighted_arr)}       sub="Probability-adjusted" />
            <KpiTile label="Pipeline Coverage" value={fmtMultiple(k.pipeline_coverage)} sub="vs quarterly quota" />
            <KpiTile label="Win Rate"          value={fmtPct(k.win_rate_pct)}       sub="Trailing 12 months" />
            <KpiTile label="Avg Deal Size"     value={fmtUSD(k.avg_deal_arr)}       sub="Closed-won, T12M" />
            <KpiTile label="Avg Sales Cycle"   value={fmtDays(k.avg_cycle_days)}    sub="Closed-won, T12M" />
            <KpiTile label="Won ARR QTD"       value={fmtUSD(k.won_arr_qtd)}        sub="Current quarter" />
          </>
        ) : null}
      </div>

      {/* Stage velocity table */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <h3 className="text-sm font-semibold text-slate-700">Stage Velocity</h3>
          <div className="flex flex-wrap gap-4">
            <FilterSelect
              label="Rep"
              value={ownerId}
              onChange={setOwnerId}
              options={repOptions}
              allLabel="All Reps"
            />
            <FilterSelect
              label="Size"
              value={segment}
              onChange={setSegment}
              options={segmentOptions}
              allLabel="All Sizes"
            />
            <FilterSelect
              label="Industry"
              value={vertical}
              onChange={setVertical}
              options={verticalOptions}
              allLabel="All Industries"
            />
            <FilterSelect
              label="Deal Stage"
              value={dealStage}
              onChange={(v) => setDealStage(v as 'all' | 'open' | 'won')}
              options={[
                { value: 'open', label: 'Open Pipeline Only' },
                { value: 'won',  label: 'Won Deals Only' },
              ]}
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

        {/* Color legend */}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-400">
          <span>Conv. Rate: <span className="text-emerald-600 font-medium">≥75%</span> · <span className="text-amber-600 font-medium">50–74%</span> · <span className="text-red-500 font-medium">&lt;50%</span></span>
          <span>Avg Days: <span className="text-emerald-600 font-medium">≤14d</span> · <span className="text-amber-600 font-medium">15–30d</span> · <span className="text-red-500 font-medium">&gt;30d</span></span>
        </div>
      </div>

      {/* Rep leaderboard */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-4">
          <h3 className="text-sm font-semibold text-slate-700">Rep Leaderboard — QTD Attainment</h3>
          <div className="flex flex-wrap gap-4">
            <FilterSelect
              label="Size"
              value={lbSegment}
              onChange={setLbSegment}
              options={segmentOptions}
              allLabel="All Sizes"
            />
            <FilterSelect
              label="Industry"
              value={lbVertical}
              onChange={setLbVertical}
              options={verticalOptions}
              allLabel="All Industries"
            />
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
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
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
    </div>
  )
}
