'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import CohortHeatmap from '@/components/charts/CohortHeatmap'
import { fmtUSD, fmtPct } from '@/lib/format'
import type { RetentionKpis, CohortRetentionRow } from '@/lib/types'

type CohortsResponse = {
  rows: CohortRetentionRow[]
  options: { verticals: string[] }
}

function KpiTile({ label, value, sub, color = 'text-slate-900' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 truncate">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
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

const SIZE_OPTIONS = [
  { value: 'SMB',         label: 'SMB' },
  { value: 'Mid-Market',  label: 'Mid-Market' },
  { value: 'Enterprise',  label: 'Enterprise' },
]

export default function RetentionPage() {
  const [sizeFilter,     setSizeFilter]     = useState('')
  const [verticalFilter, setVerticalFilter] = useState('')

  const { data: kpisData, isLoading: loadingKpis } = useQuery<RetentionKpis>({
    queryKey: ['retention-kpis'],
    queryFn: () => fetch('/api/retention/kpis').then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  const { data: cohortsData, isLoading: loadingCohorts } = useQuery<CohortsResponse>({
    queryKey: ['retention-cohorts'],
    queryFn: () => fetch('/api/retention/cohorts').then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  const verticalOptions = (cohortsData?.options.verticals ?? []).map((v) => ({ value: v, label: v }))
  const k = kpisData

  return (
    <div className="space-y-6">
      {/* KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {loadingKpis ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-24 animate-pulse" />
          ))
        ) : k ? (
          <>
            <KpiTile label="Net Revenue Retention" value={fmtPct(k.nrr_pct)} sub="Trailing 12 months" color={k.nrr_pct >= 100 ? 'text-emerald-600' : 'text-amber-600'} />
            <KpiTile label="Gross Revenue Retention" value={fmtPct(k.grr_pct)} sub="Trailing 12 months" color={k.grr_pct >= 90 ? 'text-emerald-600' : 'text-amber-600'} />
            <KpiTile label="Expansion ARR" value={fmtUSD(k.expansion_arr)} sub="Trailing 12 months" color="text-emerald-600" />
            <KpiTile label="Churn ARR" value={fmtUSD(k.churn_arr)} sub="Trailing 12 months" color="text-red-500" />
            <KpiTile label="Contraction ARR" value={fmtUSD(k.contraction_arr)} sub="Trailing 12 months" color="text-amber-600" />
            <KpiTile label="New Bookings ARR" value={fmtUSD(k.net_new_arr)} sub="Trailing 12 months" color="text-indigo-600" />
          </>
        ) : null}
      </div>

      {/* Cohort heatmap */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h3 className="text-sm font-semibold text-slate-700">GRR Cohort Heatmap</h3>
          <div className="flex flex-wrap gap-4">
            <FilterSelect
              label="Size"
              value={sizeFilter}
              onChange={setSizeFilter}
              options={SIZE_OPTIONS}
              allLabel="All Sizes"
            />
            <FilterSelect
              label="Industry"
              value={verticalFilter}
              onChange={setVerticalFilter}
              options={verticalOptions}
              allLabel="All Industries"
            />
          </div>
        </div>
        {loadingCohorts ? (
          <div className="h-64 animate-pulse bg-gray-100 rounded" />
        ) : (
          <CohortHeatmap
            data={cohortsData?.rows ?? []}
            sizeFilter={sizeFilter}
            verticalFilter={verticalFilter}
          />
        )}
      </div>

      {/* ARR Waterfall explanation */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">ARR Movement Summary — Trailing 12 Months</h3>
        {k && (
          <div className="space-y-3">
            {[
              { label: 'New Business', value: k.net_new_arr,        color: 'bg-indigo-500' },
              { label: 'Expansion',    value: k.expansion_arr,      color: 'bg-emerald-500' },
              { label: 'Contraction',  value: -k.contraction_arr,   color: 'bg-amber-400' },
              { label: 'Churn',        value: -k.churn_arr,         color: 'bg-red-500' },
            ].map(({ label, value, color }) => {
              const maxVal = k.net_new_arr + k.expansion_arr
              const pct = maxVal > 0 ? Math.abs(value / maxVal) * 100 : 0
              return (
                <div key={label} className="flex items-center gap-3">
                  <div className="w-28 text-xs text-slate-600 font-medium">{label}</div>
                  <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-3 rounded-full ${color}`}
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <div className={`w-20 text-right text-sm font-semibold tabular-nums ${value >= 0 ? 'text-slate-700' : 'text-red-500'}`}>
                    {value >= 0 ? '+' : ''}{fmtUSD(Math.abs(value))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
