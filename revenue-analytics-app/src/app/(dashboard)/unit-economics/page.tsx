'use client'

import { useQuery } from '@tanstack/react-query'
import { fmtUSD, fmtPct, fmtMultiple, fmtMonths } from '@/lib/format'
import type { UnitEconomicsKpis, CacBySourceRow } from '@/lib/types'

type UEData = { kpis: UnitEconomicsKpis; cacBySource: CacBySourceRow[] }

function KpiTile({
  label,
  value,
  sub,
  accent,
  color,
}: {
  label: string
  value: string
  sub?: string
  accent?: boolean
  color?: string
}) {
  return (
    <div className={`bg-white rounded-xl border p-5 ${accent ? 'border-indigo-200 shadow-sm' : 'border-gray-200'}`}>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 truncate">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${color ?? (accent ? 'text-indigo-700' : 'text-slate-900')}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
    </div>
  )
}

function Rule40Gauge({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(value, 80))
  const passing = value >= 40
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Rule of 40</p>
      <div className="flex items-end gap-3">
        <p className={`text-4xl font-bold tabular-nums ${passing ? 'text-emerald-600' : 'text-amber-600'}`}>
          {value.toFixed(0)}
        </p>
        <p className="text-sm text-slate-500 mb-1">{passing ? '✓ Passing' : '↓ Below benchmark'}</p>
      </div>
      <div className="mt-3 relative h-3 bg-gray-100 rounded-full overflow-hidden">
        <div className="absolute inset-y-0 left-0 right-1/2 bg-amber-100 rounded-l-full" />
        <div className="absolute inset-y-0 left-1/2 right-0 bg-emerald-100 rounded-r-full" />
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${passing ? 'bg-emerald-500' : 'bg-amber-500'}`}
          style={{ width: `${(clamped / 80) * 100}%` }}
        />
        <div className="absolute inset-y-0 left-1/2 w-0.5 bg-slate-400" />
      </div>
      <div className="flex justify-between text-xs text-slate-400 mt-1">
        <span>0</span>
        <span>40 (benchmark)</span>
        <span>80</span>
      </div>
    </div>
  )
}

export default function UnitEconomicsPage() {
  const { data, isLoading } = useQuery<UEData>({
    queryKey: ['unit-economics-kpis'],
    queryFn: () => fetch('/api/unit-economics/kpis').then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  })

  const k = data?.kpis
  const cacBySource = data?.cacBySource ?? []

  // Group CAC by source (latest quarter per source)
  const latestCac: Record<string, CacBySourceRow> = {}
  for (const row of cacBySource) {
    if (!latestCac[row.lead_source] || row.close_quarter > latestCac[row.lead_source].close_quarter) {
      latestCac[row.lead_source] = row
    }
  }
  const cacRows = Object.values(latestCac).sort((a, b) => b.cac - a.cac).slice(0, 8)

  return (
    <div className="space-y-6">
      {/* Primary KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-24 animate-pulse" />
          ))
        ) : k ? (
          <>
            <KpiTile label="Blended CAC" value={fmtUSD(k.blended_cac)} sub="Trailing 12 months, new logos" />
            <KpiTile label="CAC Payback" value={fmtMonths(k.cac_payback_months)} sub="Months to recover CAC" />
            <KpiTile label="Customer LTV" value={fmtUSD(k.ltv)} sub="Based on avg churn" />
            <KpiTile label="LTV / CAC" value={fmtMultiple(k.ltv_cac)} sub="Target: >3x" accent={k.ltv_cac >= 3} />
            <KpiTile label="Gross Margin" value={fmtPct(k.gross_margin_pct)} sub="Last 3 months avg" color={k.gross_margin_pct >= 70 ? 'text-emerald-600' : 'text-amber-600'} />
            <KpiTile label="ARR Growth" value={fmtPct(k.arr_growth_pct)} sub="Year over year" color="text-indigo-600" />
            <KpiTile label="Magic Number" value={k.magic_number.toFixed(2)} sub="Net new ARR / prior-Q spend" color={k.magic_number >= 0.75 ? 'text-emerald-600' : 'text-amber-600'} />
          </>
        ) : null}
      </div>

      {/* Rule of 40 gauge + CAC by source */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div>
          {isLoading ? (
            <div className="bg-white rounded-xl border border-gray-200 p-5 h-40 animate-pulse" />
          ) : k ? (
            <Rule40Gauge value={k.rule_of_40} />
          ) : null}
        </div>

        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-slate-700">CAC by Lead Source (Latest Quarter)</h3>
          </div>
          {isLoading ? (
            <div className="p-5 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : cacRows.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Source</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">New Customers</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">New ARR</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Spend</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">CAC</th>
                </tr>
              </thead>
              <tbody>
                {cacRows.map((row, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-700">{row.lead_source}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{row.new_customers}</td>
                    <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{fmtUSD(row.new_arr)}</td>
                    <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{fmtUSD(row.total_spend)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums">{fmtUSD(row.cac)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-slate-400 text-center py-8">No CAC data available.</p>
          )}
        </div>
      </div>
    </div>
  )
}
