'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from 'recharts'

type WaterfallItem = {
  name: string
  value: number
  color: string
}

function fmt(v: number) {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return `$${v}`
}

export default function ArrWaterfallChart({ items }: { items: WaterfallItem[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={items} margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
        <YAxis tickFormatter={fmt} tick={{ fontSize: 11 }} width={52} />
        <Tooltip formatter={(v) => [fmt(Number(v ?? 0))]} />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {items.map((item, i) => (
            <Cell key={i} fill={item.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

export type { WaterfallItem }
