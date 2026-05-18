'use client'

import { useState, useEffect } from 'react'
import {
  BarChart, Bar,
  XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'

// ── Types ──────────────────────────────────────────────────────────────────────

type Series = { name: string; color: string; data: number[] }

type ChartData = {
  quarters: string[]
  companySizeSeries: Series[]
  industrySeries:    Series[]
  revenueTypeSeries: Series[]
}

type Segment = 'company_size' | 'industry' | 'revenue_type'

const SEGMENT_OPTIONS: { value: Segment; label: string }[] = [
  { value: 'company_size',  label: 'Company Size'  },
  { value: 'industry',      label: 'Industry'      },
  { value: 'revenue_type',  label: 'Revenue Type'  },
]

// ── Formatters ─────────────────────────────────────────────────────────────────

function fmt(v: number) {
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `${sign}$${(abs / 1_000).toFixed(0)}K`
  return `${sign}$${abs}`
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ArrSegmentBarChart() {
  const [data,    setData]    = useState<ChartData | null>(null)
  const [segment, setSegment] = useState<Segment>('company_size')
  const [error,   setError]   = useState(false)

  useEffect(() => {
    fetch('/api/executive-overview/arr-by-quarter')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(setData)
      .catch(() => setError(true))
  }, [])

  if (error)   return <p className="text-sm text-red-400 text-center py-16">Failed to load</p>
  if (!data)   return <div className="h-60 flex items-center justify-center text-sm text-slate-400">Loading…</div>

  const seriesMap: Record<Segment, Series[]> = {
    company_size:  data.companySizeSeries,
    industry:      data.industrySeries,
    revenue_type:  data.revenueTypeSeries,
  }

  const activeSeries = seriesMap[segment]
  const hasNegative  = activeSeries.some(s => s.data.some(v => v < 0))

  // Recharts wants [{quarter, SMB: 1234, ...}, ...]
  const chartData = data.quarters.map((q, i) => {
    const row: Record<string, string | number> = { quarter: q }
    for (const s of activeSeries) row[s.name] = s.data[i] ?? 0
    return row
  })

  return (
    <div>
      {/* Dropdown */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-slate-400">Rolling 4 quarters</span>
        <select
          value={segment}
          onChange={e => setSegment(e.target.value as Segment)}
          className="text-xs border border-gray-200 rounded-md px-2.5 py-1.5 text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400 cursor-pointer"
        >
          {SEGMENT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }} barSize={36}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          {hasNegative && <ReferenceLine y={0} stroke="#e2e8f0" strokeWidth={1.5} />}
          <XAxis dataKey="quarter" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis
            tickFormatter={fmt}
            tick={{ fontSize: 11 }}
            width={56}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(v, name) => [fmt(Number(v ?? 0)), name as string]}
            cursor={{ fill: '#f8fafc' }}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
          {activeSeries.map(s => (
            <Bar key={s.name} dataKey={s.name} stackId="stack" fill={s.color} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
