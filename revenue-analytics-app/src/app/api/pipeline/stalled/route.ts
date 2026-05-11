import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { StalledDealRow } from '@/lib/types'

export async function GET() {
  const supabase = await createClient()

  const [dealsRes, usersRes, companiesRes, velocityRes] = await Promise.all([
    supabase
      .from('sls_opportunities')
      .select('id, name, arr, stage, segment, close_date, current_stage_age_days, owner_id, company_id')
      .not('stage', 'in', '("6","Closed Lost")')
      .not('current_stage_age_days', 'is', null),
    supabase.from('sls_users').select('id, name'),
    supabase.from('mkt_companies').select('id, name'),
    supabase.from('mv_stage_velocity_stats').select('from_stage, segment, avg_days, transitions'),
  ])

  const userMap: Record<string, string> = {}
  for (const u of usersRes.data ?? []) userMap[u.id] = u.name
  const companyMap: Record<string, string> = {}
  for (const c of companiesRes.data ?? []) companyMap[c.id] = c.name

  // Weighted-average avg_days per (segment, from_stage) across all to_stages
  const velAcc: Record<string, { days: number; n: number }> = {}
  for (const v of velocityRes.data ?? []) {
    const key = `${v.segment}||${v.from_stage}`
    if (!velAcc[key]) velAcc[key] = { days: 0, n: 0 }
    const t = Number(v.transitions ?? 1)
    velAcc[key].days += Number(v.avg_days ?? 0) * t
    velAcc[key].n    += t
  }
  const avgMap: Record<string, number> = {}
  for (const [k, v] of Object.entries(velAcc)) {
    avgMap[k] = v.n > 0 ? v.days / v.n : 30
  }

  const rows: StalledDealRow[] = []
  for (const d of dealsRes.data ?? []) {
    const key    = `${d.segment}||${d.stage}`
    const avgDays = avgMap[key] ?? 30
    const age     = Number(d.current_stage_age_days ?? 0)
    if (age <= avgDays) continue
    rows.push({
      id:                    d.id,
      name:                  d.name ?? '',
      company_name:          companyMap[d.company_id] ?? '',
      owner_name:            userMap[d.owner_id]  ?? '',
      stage:                 d.stage  ?? '',
      segment:               d.segment ?? '',
      arr:                   Number(d.arr ?? 0),
      close_date:            d.close_date ?? '',
      current_stage_age_days: age,
      avg_days_for_stage:    Math.round(avgDays),
      overage_days:          Math.round(age - avgDays),
      overage_pct:           Math.round(((age - avgDays) / avgDays) * 100),
    })
  }

  rows.sort((a, b) => b.overage_pct - a.overage_pct)
  return NextResponse.json(rows)
}
