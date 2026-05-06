'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { AttributionRow } from '@/lib/types'

function fmtUSD(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return `$${v}`
}

export const ATTRIBUTION_STAGES = [
  { key: 'stage_0_arr',    label: 'Stage 0', color: '#94a3b8' },
  { key: 'stage_1_arr',    label: 'Stage 1', color: '#38bdf8' },
  { key: 'stage_2_arr',    label: 'Stage 2', color: '#60a5fa' },
  { key: 'stage_3_arr',    label: 'Stage 3', color: '#a78bfa' },
  { key: 'stage_4_arr',    label: 'Stage 4', color: '#c084fc' },
  { key: 'stage_5_arr',    label: 'Stage 5', color: '#fb923c' },
  { key: 'closed_won_arr', label: 'Won',     color: '#059669' },
  { key: 'lost_arr',       label: 'Lost',    color: '#e11d48' },
] as const

export type StageKey = (typeof ATTRIBUTION_STAGES)[number]['key']

export default function AttributionBarChart({
  data,
  visibleStages,
}: {
  data: AttributionRow[]
  visibleStages: Set<StageKey>
}) {
  const visible = ATTRIBUTION_STAGES.filter((s) => visibleStages.has(s.key))
  const lastIdx = visible.length - 1

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 40 + 60)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 16, bottom: 0, left: 8 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
        <XAxis type="number" tickFormatter={fmtUSD} tick={{ fontSize: 11 }} />
        <YAxis
          type="category"
          dataKey="attributed_source"
          width={120}
          tick={{ fontSize: 11 }}
        />
        <Tooltip
          formatter={(v, name) => {
            const stage = ATTRIBUTION_STAGES.find((s) => s.key === name)
            return [fmtUSD(Number(v ?? 0)), stage?.label ?? String(name)]
          }}
          labelFormatter={(l) => l as string}
        />
        <Legend
          formatter={(value) => ATTRIBUTION_STAGES.find((s) => s.key === value)?.label ?? value}
          wrapperStyle={{ fontSize: 11 }}
        />
        {visible.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            stackId="a"
            fill={s.color}
            radius={i === lastIdx ? [0, 4, 4, 0] : undefined}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
