'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import CohortHeatmap from '@/components/charts/CohortHeatmap'
import { fmtUSD, fmtPct } from '@/lib/format'
import type { RetentionKpis, CohortRetentionRow } from '@/lib/types'
import type { MovementsResponse, MovementRow } from '@/app/api/retention/movements/route'

type CohortsResponse = {
  rows: CohortRetentionRow[]
  options: { verticals: string[] }
}

type Period = 'this_quarter' | 'last_quarter' | 'this_fiscal_year'

const PERIOD_LABELS: Record<Period, string> = {
  this_quarter:    'This Quarter',
  last_quarter:    'Last Quarter',
  this_fiscal_year:'This Fiscal Year',
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

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'this_quarter',    label: 'This Quarter' },
  { value: 'last_quarter',    label: 'Last Quarter' },
  { value: 'this_fiscal_year',label: 'This Fiscal Year' },
]

function MovementTable({
  title,
  rows,
  lastColHeader,
  accentColor,
}: {
  title: string
  rows: MovementRow[]
  lastColHeader: string
  accentColor: string
}) {
  if (rows.length === 0) {
    return (
      <div>
        <h4 className="text-sm font-semibold text-slate-700 mb-3">{title}</h4>
        <p className="text-sm text-slate-400 italic">No records in this period.</p>
      </div>
    )
  }

  return (
    <div>
      <h4 className="text-sm font-semibold text-slate-700 mb-3">{title}</h4>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Company Name</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Current ARR</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Size</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Industry</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Billing Start</th>
              <th className={`text-right px-4 py-2.5 text-xs font-semibold uppercase tracking-wide ${accentColor}`}>{lastColHeader}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r, i) => (
              <tr key={`${r.company_id}-${i}`} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-2.5 font-medium text-slate-800">{r.company_name}</td>
                <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">{fmtUSD(r.current_arr)}</td>
                <td className="px-4 py-2.5 text-slate-600">{r.company_size}</td>
                <td className="px-4 py-2.5 text-slate-600">{r.vertical}</td>
                <td className="px-4 py-2.5 text-slate-500 tabular-nums">
                  {r.billing_start_date ? new Date(r.billing_start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                </td>
                <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${accentColor}`}>
                  {fmtUSD(r.movement_arr)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function RetentionPage() {
  const [sizeFilter,     setSizeFilter]     = useState('')
  const [verticalFilter, setVerticalFilter] = useState('')
  const [period,         setPeriod]         = useState<Period>('this_fiscal_year')
  const [mvSizeFilter,     setMvSizeFilter]     = useState('')
  const [mvVerticalFilter, setMvVerticalFilter] = useState('')

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

  const { data: movementsData, isLoading: loadingMovements } = useQuery<MovementsResponse>({
    queryKey: ['retention-movements', period],
    queryFn: () => fetch(`/api/retention/movements?period=${period}`).then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  const verticalOptions = (cohortsData?.options.verticals ?? []).map((v) => ({ value: v, label: v }))
  const k = kpisData
  const mv = movementsData

  const summary = mv?.summary
  const maxVal = summary ? (summary.new_arr + summary.expansion_arr) : 1

  return (
    <div className="space-y-6">
      {/* KPI tiles — always T12 */}
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

      {/* Period + segment filters — control waterfall + movement tables */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Period</span>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                  period === opt.value
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-slate-600 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <FilterSelect
          label="Size"
          value={mvSizeFilter}
          onChange={setMvSizeFilter}
          options={SIZE_OPTIONS}
          allLabel="All Sizes"
        />
        <FilterSelect
          label="Industry"
          value={mvVerticalFilter}
          onChange={setMvVerticalFilter}
          options={verticalOptions}
          allLabel="All Industries"
        />
      </div>

      {/* ARR Waterfall — driven by period filter */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">
          ARR Movement Summary — {PERIOD_LABELS[period]}
        </h3>
        {loadingMovements ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : summary ? (
          <div className="space-y-3">
            {[
              { label: 'New Business', value: summary.new_arr,        color: 'bg-indigo-500', textColor: 'text-slate-700', positive: true },
              { label: 'Expansion',    value: summary.expansion_arr,   color: 'bg-emerald-500', textColor: 'text-slate-700', positive: true },
              { label: 'Contraction',  value: summary.contraction_arr, color: 'bg-amber-400', textColor: 'text-red-500', positive: false },
              { label: 'Churn',        value: summary.churn_arr,       color: 'bg-red-500', textColor: 'text-red-500', positive: false },
            ].map(({ label, value, color, textColor, positive }) => {
              const pct = maxVal > 0 ? Math.abs(value / maxVal) * 100 : 0
              return (
                <div key={label} className="flex items-center gap-3">
                  <div className="w-28 text-xs text-slate-600 font-medium">{label}</div>
                  <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div className={`h-3 rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <div className={`w-20 text-right text-sm font-semibold tabular-nums ${textColor}`}>
                    {positive ? '+' : '-'}{fmtUSD(Math.abs(value))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}
      </div>

      {/* ARR Movement Detail Tables */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-8">
        <h3 className="text-sm font-semibold text-slate-700">
          ARR Movement Detail — {PERIOD_LABELS[period]}
        </h3>

        {loadingMovements ? (
          <div className="space-y-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-32 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : mv ? (
          (() => {
            const filterRows = (rows: MovementRow[]) =>
              rows
                .filter((r) => !mvSizeFilter     || r.company_size === mvSizeFilter)
                .filter((r) => !mvVerticalFilter  || r.vertical     === mvVerticalFilter)
            return (
              <>
                <MovementTable
                  title="New Business"
                  rows={filterRows(mv.new_business)}
                  lastColHeader="New ARR"
                  accentColor="text-indigo-600"
                />
                <MovementTable
                  title="Expansion"
                  rows={filterRows(mv.expansion)}
                  lastColHeader="Expansion ARR"
                  accentColor="text-emerald-600"
                />
                <MovementTable
                  title="Contraction"
                  rows={filterRows(mv.contraction)}
                  lastColHeader="At Risk ARR"
                  accentColor="text-amber-600"
                />
                <MovementTable
                  title="Churn"
                  rows={filterRows(mv.churn)}
                  lastColHeader="Churned ARR"
                  accentColor="text-red-500"
                />
              </>
            )
          })()
        ) : null}
      </div>
    </div>
  )
}
