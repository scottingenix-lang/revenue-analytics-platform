'use client'

import type { CohortRetentionRow } from '@/lib/types'

function grrColor(grr: number): string {
  if (grr >= 95) return 'bg-emerald-500 text-white'
  if (grr >= 85) return 'bg-emerald-300 text-emerald-900'
  if (grr >= 75) return 'bg-yellow-200 text-yellow-900'
  if (grr >= 60) return 'bg-orange-300 text-orange-900'
  return 'bg-red-400 text-white'
}

export default function CohortHeatmap({
  data,
  sizeFilter = '',
  verticalFilter = '',
}: {
  data: CohortRetentionRow[]
  sizeFilter?: string
  verticalFilter?: string
}) {
  const filtered = data
    .filter((r) => !sizeFilter     || r.company_size === sizeFilter)
    .filter((r) => !verticalFilter || r.vertical     === verticalFilter)

  // Pivot: cohort_month → offset → grr
  const cohorts = [...new Set(filtered.map((r) => r.cohort_month))].sort()
  const maxOffset = Math.max(...filtered.map((r) => r.period_offset), 0)
  const offsets = Array.from({ length: Math.min(maxOffset + 1, 13) }, (_, i) => i)

  const pivot: Record<string, Record<number, number>> = {}
  for (const r of filtered) {
    if (!pivot[r.cohort_month]) pivot[r.cohort_month] = {}
    // Average grr across company sizes if not filtered
    const existing = pivot[r.cohort_month][r.period_offset]
    pivot[r.cohort_month][r.period_offset] = existing != null ? (existing + r.grr) / 2 : r.grr
  }

  if (cohorts.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-8">No cohort data available</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse min-w-full">
        <thead>
          <tr>
            <th className="text-left px-2 py-1 text-slate-500 font-medium whitespace-nowrap">Cohort</th>
            {offsets.map((o) => (
              <th key={o} className="px-2 py-1 text-slate-500 font-medium text-center">
                M{o}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.slice(-12).map((cohort) => (
            <tr key={cohort}>
              <td className="px-2 py-1 text-slate-600 font-medium whitespace-nowrap">
                {new Date(cohort).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
              </td>
              {offsets.map((o) => {
                const val = pivot[cohort]?.[o]
                return (
                  <td key={o} className="p-0.5">
                    {val != null ? (
                      <div
                        className={`rounded text-center py-1 px-1 font-medium ${grrColor(val)}`}
                        title={`${val.toFixed(1)}%`}
                      >
                        {val.toFixed(0)}%
                      </div>
                    ) : (
                      <div className="text-center text-slate-200 py-1">—</div>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-3 mt-3 text-xs text-slate-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> ≥95%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-300 inline-block" /> 85–95%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-200 inline-block" /> 75–85%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-300 inline-block" /> 60–75%</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-400 inline-block" /> &lt;60%</span>
      </div>
    </div>
  )
}
