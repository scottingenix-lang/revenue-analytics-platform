'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { StageVelocityRow } from '@/lib/types'

const STAGE_LABELS: Record<string, string> = {
  '0': 'Stage 0',
  '1': 'Stage 1',
  '2': 'Stage 2',
  '3': 'Stage 3',
  '4': 'Stage 4',
  '5': 'Stage 5',
  '6': 'Won',
  'Closed Lost': 'Lost',
}

type FunnelItem = {
  stage: string
  avg_days: number
  conversion_rate: number
}

function buildFunnelData(rows: StageVelocityRow[], segment: string): FunnelItem[] {
  const filtered = rows.filter((r) => r.segment === segment || segment === 'All')
  const byFromStage: Record<string, { days: number[]; rates: number[] }> = {}
  for (const r of filtered) {
    if (!byFromStage[r.from_stage]) byFromStage[r.from_stage] = { days: [], rates: [] }
    byFromStage[r.from_stage].days.push(r.avg_days)
    byFromStage[r.from_stage].rates.push(r.conversion_rate)
  }
  return Object.entries(byFromStage).map(([stage, { days, rates }]) => ({
    stage: STAGE_LABELS[stage] ?? stage,
    avg_days: Math.round(days.reduce((s, v) => s + v, 0) / days.length),
    conversion_rate: Math.round((rates.reduce((s, v) => s + v, 0) / rates.length) * 10) / 10,
  }))
}

export default function StageFunnelChart({
  data,
  segment = 'All',
}: {
  data: StageVelocityRow[]
  segment?: string
}) {
  const chartData = buildFunnelData(data, segment)

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="days" orientation="left" tick={{ fontSize: 11 }} label={{ value: 'Avg Days', angle: -90, position: 'insideLeft', style: { fontSize: 10 } }} />
          <YAxis yAxisId="conv" orientation="right" tick={{ fontSize: 11 }} domain={[0, 100]} label={{ value: 'Conv %', angle: 90, position: 'insideRight', style: { fontSize: 10 } }} />
          <Tooltip formatter={(v, name) => [name === 'avg_days' ? `${v} days` : `${v}%`, name === 'avg_days' ? 'Avg Days' : 'Conversion']} />
          <Bar yAxisId="days" dataKey="avg_days" fill="#6366f1" radius={[4, 4, 0, 0]} name="avg_days" />
          <Bar yAxisId="conv" dataKey="conversion_rate" fill="#a5b4fc" radius={[4, 4, 0, 0]} name="conversion_rate" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
