'use client'

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { DiscoveryBookingWeek } from '@/lib/types'

const PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#14b8a6']

export default function DiscoveryBookingChart({
  weeks,
  sdrFilter,
}: {
  weeks: DiscoveryBookingWeek[]
  sdrFilter: string
}) {
  const allSdrs     = Array.from(new Set(weeks.flatMap((w) => Object.keys(w.sdrs)))).sort()
  const visibleSdrs = sdrFilter ? allSdrs.filter((n) => n === sdrFilter) : allSdrs

  const chartData = weeks.map((w) => ({
    name: w.week_label,
    ...Object.fromEntries(visibleSdrs.map((sdr) => [sdr, w.sdrs[sdr] ?? 0])),
  }))

  const totalBookings = weeks.reduce((s, w) => s + w.total, 0)
  if (totalBookings === 0) {
    return (
      <p className="text-sm text-slate-400 text-center py-10">
        No upcoming discovery bookings in the next 4 weeks.
      </p>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={24} />
        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {visibleSdrs.map((sdr, i) => (
          <Bar
            key={sdr}
            dataKey={sdr}
            stackId="a"
            fill={PALETTE[i % PALETTE.length]}
            radius={i === visibleSdrs.length - 1 ? [4, 4, 0, 0] : undefined}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}
