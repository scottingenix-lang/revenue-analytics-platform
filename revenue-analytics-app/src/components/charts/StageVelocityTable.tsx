'use client'

const STAGES = [
  { key: 'stage_0', label: 'Stage 0' },
  { key: 'stage_1', label: 'Stage 1' },
  { key: 'stage_2', label: 'Stage 2' },
  { key: 'stage_3', label: 'Stage 3' },
  { key: 'stage_4', label: 'Stage 4' },
  { key: 'stage_5', label: 'Stage 5' },
] as const

type PivotRow = {
  metric: 'conversion_rate' | 'avg_days'
  [key: string]: string | number | null
}

function convColor(v: number | null) {
  if (v === null) return 'text-slate-300'
  if (v >= 75) return 'text-emerald-700 bg-emerald-50'
  if (v >= 50) return 'text-amber-700 bg-amber-50'
  return 'text-red-600 bg-red-50'
}

function daysColor(v: number | null) {
  if (v === null) return 'text-slate-300'
  if (v <= 14)  return 'text-emerald-700 bg-emerald-50'
  if (v <= 30)  return 'text-amber-700 bg-amber-50'
  return 'text-red-600 bg-red-50'
}

export default function StageVelocityTable({ pivot }: { pivot: PivotRow[] }) {
  const convRow = pivot.find((r) => r.metric === 'conversion_rate')
  const daysRow = pivot.find((r) => r.metric === 'avg_days')

  if (!convRow && !daysRow) {
    return <p className="text-sm text-slate-400 text-center py-8">No velocity data for the selected filters.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-36">
              Metric
            </th>
            {STAGES.map(({ key, label }) => (
              <th key={key} className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Conversion Rate row */}
          <tr className="border-b border-gray-50">
            <td className="px-4 py-3 text-slate-600 font-medium text-xs">Conversion Rate</td>
            {STAGES.map(({ key }) => {
              const v = convRow ? (convRow[key] as number | null) : null
              return (
                <td key={key} className="px-4 py-3 text-center">
                  {v === null ? (
                    <span className="text-slate-300">—</span>
                  ) : (
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold tabular-nums ${convColor(v)}`}>
                      {v}%
                    </span>
                  )}
                </td>
              )
            })}
          </tr>

          {/* Avg Days row */}
          <tr>
            <td className="px-4 py-3 text-slate-600 font-medium text-xs">Avg Days</td>
            {STAGES.map(({ key }) => {
              const v = daysRow ? (daysRow[key] as number | null) : null
              return (
                <td key={key} className="px-4 py-3 text-center">
                  {v === null ? (
                    <span className="text-slate-300">—</span>
                  ) : (
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold tabular-nums ${daysColor(v)}`}>
                      {v}d
                    </span>
                  )}
                </td>
              )
            })}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
