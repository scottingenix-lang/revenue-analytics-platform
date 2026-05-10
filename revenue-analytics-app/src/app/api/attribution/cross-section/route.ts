import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { CrossSectionRow } from '@/lib/types'

export async function GET() {
  const supabase = await createClient()

  const [oppsRes, companiesRes] = await Promise.all([
    supabase
      .from('sls_opportunities')
      .select('company_id, stage, arr, created_date, close_date')
      .in('stage', ['6', 'Closed Lost'])
      .limit(50000),
    supabase
      .from('mkt_companies')
      .select('id, company_size, vertical_tag')
      .limit(10000),
  ])

  const companyMap: Record<string, { company_size: string; vertical_tag: string }> = {}
  for (const c of companiesRes.data ?? []) {
    companyMap[c.id] = { company_size: c.company_size ?? '', vertical_tag: c.vertical_tag ?? '' }
  }

  type Bucket = { wins: number; total: number; arr_sum: number; days_sum: number }
  const buckets: Record<string, Bucket> = {}

  for (const o of oppsRes.data ?? []) {
    const co = companyMap[o.company_id]
    if (!co || !co.company_size || !co.vertical_tag) continue
    const key = `${co.company_size}|||${co.vertical_tag}`
    if (!buckets[key]) buckets[key] = { wins: 0, total: 0, arr_sum: 0, days_sum: 0 }
    buckets[key].total++
    if (o.stage === '6') {
      buckets[key].wins++
      buckets[key].arr_sum += Number(o.arr ?? 0)
      if (o.close_date && o.created_date) {
        const days = Math.round(
          (new Date(o.close_date).getTime() - new Date(o.created_date).getTime()) /
            (1000 * 60 * 60 * 24),
        )
        if (days >= 0) buckets[key].days_sum += days
      }
    }
  }

  const rows: CrossSectionRow[] = Object.entries(buckets)
    .filter(([, b]) => b.total >= 5)
    .map(([key, b]) => {
      const [company_size, industry] = key.split('|||')
      return {
        company_size,
        industry,
        wins:             b.wins,
        total_decided:    b.total,
        win_rate:         b.total > 0 ? Math.round((b.wins / b.total) * 1000) / 10 : 0,
        avg_arr:          b.wins > 0 ? Math.round(b.arr_sum / b.wins) : 0,
        avg_days_to_win:  b.wins > 0 ? Math.round(b.days_sum / b.wins) : 0,
      }
    })

  const byWinRateDesc = [...rows].sort((a, b) => b.win_rate - a.win_rate)
  const byWinRateAsc  = [...rows].sort((a, b) => a.win_rate - b.win_rate)

  return NextResponse.json({
    top5:    byWinRateDesc.slice(0, 5),
    bottom5: byWinRateAsc.slice(0, 5),
  })
}
