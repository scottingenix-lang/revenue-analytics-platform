import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { FastPacingDealRow } from '@/lib/types'

export async function GET() {
  const supabase = await createClient()

  const [dealsRes, usersRes, companiesRes, cycleRes] = await Promise.all([
    supabase
      .from('sls_opportunities')
      .select('id, name, arr, stage, segment, close_date, deal_age_days, owner_id, company_id')
      .not('stage', 'in', '("6","Closed Lost")')
      .not('deal_age_days', 'is', null),
    supabase.from('sls_users').select('id, name'),
    supabase.from('mkt_companies').select('id, name'),
    supabase.from('mv_overall_cycle_stats').select('segment, reached_stage, p25_days'),
  ])

  const userMap: Record<string, string> = {}
  for (const u of usersRes.data ?? []) userMap[u.id] = u.name
  const companyMap: Record<string, string> = {}
  for (const c of companiesRes.data ?? []) companyMap[c.id] = c.name

  const p25Map: Record<string, number> = {}
  for (const s of cycleRes.data ?? []) {
    p25Map[`${s.segment}||${s.reached_stage}`] = Number(s.p25_days ?? 0)
  }

  const rows: FastPacingDealRow[] = []
  for (const d of dealsRes.data ?? []) {
    const p25 = p25Map[`${d.segment}||${d.stage}`]
    if (p25 === undefined || p25 <= 0) continue
    const age = Number(d.deal_age_days ?? 0)
    if (age <= 0 || age >= p25) continue
    rows.push({
      id:                 d.id,
      name:               d.name ?? '',
      company_name:       companyMap[d.company_id] ?? '',
      owner_name:         userMap[d.owner_id]  ?? '',
      stage:              d.stage  ?? '',
      segment:            d.segment ?? '',
      arr:                Number(d.arr ?? 0),
      close_date:         d.close_date ?? '',
      deal_age_days:      age,
      p25_days_to_stage:  Math.round(p25),
      days_ahead:         Math.round(p25 - age),
    })
  }

  rows.sort((a, b) => b.days_ahead - a.days_ahead)
  return NextResponse.json(rows)
}
