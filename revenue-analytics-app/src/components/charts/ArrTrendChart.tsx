'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { ArrDailyRow } from '@/lib/types'

function fmt(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`
  return `$${v}`
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

export default function ArrTrendChart({ data }: { data: ArrDailyRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id="smb" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#a5b4fc" stopOpacity={0.6} />
            <stop offset="95%" stopColor="#a5b4fc" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="mid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.7} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="ent" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3730a3" stopOpacity={0.8} />
            <stop offset="95%" stopColor="#3730a3" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="snapshot_date" tickFormatter={fmtDate} tick={{ fontSize: 11 }} interval="preserveStartEnd" />
        <YAxis tickFormatter={fmt} tick={{ fontSize: 11 }} width={52} />
        <Tooltip
          formatter={(v, name) => [fmt(Number(v ?? 0)), name as string]}
          labelFormatter={(l) => fmtDate(l as string)}
        />
        <Legend />
        <Area type="monotone" dataKey="arr_smb" name="SMB" stackId="1" stroke="#a5b4fc" fill="url(#smb)" />
        <Area type="monotone" dataKey="arr_midmarket" name="Mid-Market" stackId="1" stroke="#6366f1" fill="url(#mid)" />
        <Area type="monotone" dataKey="arr_enterprise" name="Enterprise" stackId="1" stroke="#3730a3" fill="url(#ent)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}
