import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { CloseDateDeal, ForecastMonth, QuarterForecast } from '@/lib/types'

export async function GET() {
  const supabase = await createClient()

  const today = new Date()
  const year  = today.getFullYear()
  const qIdx  = Math.floor(today.getMonth() / 3)
  const qLabel = `Q${qIdx + 1} ${year}`

  // Quarter bounds (local calendar)
  const qStartDate = new Date(year, qIdx * 3, 1)
  const qEndDate   = new Date(year, qIdx * 3 + 3, 0) // last day of last month in quarter
  const qStart = qStartDate.toISOString().slice(0, 10)
  const qEnd   = qEndDate.toISOString().slice(0, 10)

  // Month definitions for the quarter
  const monthDefs = [0, 1, 2].map((i) => {
    const m  = qIdx * 3 + i
    const d  = new Date(year, m, 1)
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    const month = `${year}-${String(m + 1).padStart(2, '0')}`
    return { label, month }
  })

  const [closedRes, openRes, usersRes, companiesRes, goalRes] = await Promise.all([
    supabase
      .from('sls_opportunities')
      .select('arr')
      .eq('stage', '6')
      .gte('close_date', qStart)
      .lte('close_date', qEnd),
    supabase
      .from('sls_opportunities')
      .select('id, name, arr, stage, segment, close_date, probability, forecast_category, ai_close_probability, owner_id, company_id')
      .not('stage', 'in', '("6","Closed Lost")')
      .gte('close_date', qStart)
      .lte('close_date', qEnd)
      .order('close_date', { ascending: true }),
    supabase.from('sls_users').select('id, name, quota, role'),
    supabase.from('mkt_companies').select('id, name'),
    supabase
      .from('fin_revenue_goals')
      .select('new_business_arr_goal, expansion_arr_goal')
      .eq('period_year', year)
      .eq('period_quarter', qIdx + 1)
      .is('segment', null)
      .maybeSingle(),
  ])

  // Quarterly goal: use fin_revenue_goals if available, else fall back to AE quotas / 4
  const goalRow = goalRes.data
  const quarterlyQuota = goalRow
    ? Number(goalRow.new_business_arr_goal ?? 0)
    : (usersRes.data ?? [])
        .filter((u) => u.role === 'AE' && u.quota)
        .reduce((s, u) => s + Number(u.quota ?? 0), 0) / 4

  const userMap: Record<string, string> = {}
  for (const u of usersRes.data ?? []) userMap[u.id] = u.name ?? ''
  const companyMap: Record<string, string> = {}
  for (const c of companiesRes.data ?? []) companyMap[c.id] = c.name ?? ''

  const closedArr = (closedRes.data ?? []).reduce((s, d) => s + Number(d.arr ?? 0), 0)

  // Build month buckets
  const buckets: Record<string, { committed_arr: number; pipeline_arr: number; deals: CloseDateDeal[] }> = {}
  for (const { month } of monthDefs) buckets[month] = { committed_arr: 0, pipeline_arr: 0, deals: [] }

  for (const d of openRes.data ?? []) {
    const mKey = d.close_date?.slice(0, 7)
    if (!mKey || !buckets[mKey]) continue
    const arr         = Number(d.arr ?? 0)
    const isCommitted = d.forecast_category === 'Commit'
    if (isCommitted) buckets[mKey].committed_arr += arr
    else             buckets[mKey].pipeline_arr  += arr
    buckets[mKey].deals.push({
      id:                   d.id,
      name:                 d.name ?? '',
      company_name:         companyMap[d.company_id] ?? '',
      owner_name:           userMap[d.owner_id]      ?? '',
      stage:                d.stage ?? '',
      segment:              d.segment ?? '',
      arr,
      close_date:           d.close_date ?? '',
      probability:          Number(d.probability ?? 0),
      forecast_category:    d.forecast_category ?? '',
      ai_close_probability: d.ai_close_probability != null ? Number(d.ai_close_probability) : null,
    })
  }

  const committedArr = monthDefs.reduce((s, { month }) => s + buckets[month].committed_arr, 0)
  const pipelineArr  = monthDefs.reduce((s, { month }) => s + buckets[month].pipeline_arr,  0)
  const gap = Math.max(0, quarterlyQuota - closedArr - committedArr - pipelineArr)

  const quarter: QuarterForecast = {
    label:         qLabel,
    quota:         Math.round(quarterlyQuota),
    closed_arr:    Math.round(closedArr),
    committed_arr: Math.round(committedArr),
    pipeline_arr:  Math.round(pipelineArr),
    gap:           Math.round(gap),
    months: monthDefs.map(({ label, month }) => ({
      label,
      month,
      committed_arr: Math.round(buckets[month].committed_arr),
      pipeline_arr:  Math.round(buckets[month].pipeline_arr),
      deals:         buckets[month].deals,
    } satisfies ForecastMonth)),
  }

  return NextResponse.json({ quarter })
}
