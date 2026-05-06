import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { RepLeaderboardRow } from '@/lib/types'

function quarterStart(): string {
  const now = new Date()
  const q = Math.floor(now.getMonth() / 3)
  return new Date(now.getFullYear(), q * 3, 1).toISOString().split('T')[0]
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const segmentFilter  = searchParams.get('segment')  ?? ''
  const verticalFilter = searchParams.get('vertical') ?? ''

  const supabase = await createClient()

  const today = Date.now()
  const trailing12 = new Date(today - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const qStart = quarterStart()

  // T12M closed deals (won + lost) for win rate & avg deal
  let closedQ = supabase
    .from('sls_opportunities')
    .select('owner_id, arr, stage')
    .in('stage', ['6', 'Closed Lost'])
    .gte('close_date', trailing12)
  if (segmentFilter)  closedQ = closedQ.eq('segment', segmentFilter)
  if (verticalFilter) closedQ = closedQ.eq('vertical', verticalFilter)

  // Current open deals for avg age
  let openQ = supabase
    .from('sls_opportunities')
    .select('owner_id, created_date')
    .not('stage', 'in', '("6","Closed Lost")')
  if (segmentFilter)  openQ = openQ.eq('segment', segmentFilter)
  if (verticalFilter) openQ = openQ.eq('vertical', verticalFilter)

  // QTD won for attainment
  let qtdQ = supabase
    .from('sls_opportunities')
    .select('owner_id, arr')
    .eq('stage', '6')
    .gte('close_date', qStart)
  if (segmentFilter)  qtdQ = qtdQ.eq('segment', segmentFilter)
  if (verticalFilter) qtdQ = qtdQ.eq('vertical', verticalFilter)

  const [aeData, oppsData, openData, wonQtdData] = await Promise.all([
    supabase.from('sls_users').select('id, name, quota').eq('role', 'AE'),
    closedQ,
    openQ,
    qtdQ,
  ])

  const aes = aeData.data ?? []

  const opps = oppsData.data ?? []
  const byRep: Record<string, { won: number[]; lost: number }> = {}
  for (const o of opps) {
    if (!byRep[o.owner_id]) byRep[o.owner_id] = { won: [], lost: 0 }
    if (o.stage === '6') byRep[o.owner_id].won.push(Number(o.arr ?? 0))
    else byRep[o.owner_id].lost++
  }

  // Avg age of current open deals per rep (computed from created_date)
  const ageByRep: Record<string, number[]> = {}
  for (const o of openData.data ?? []) {
    if (!o.created_date) continue
    const ageDays = Math.floor((today - new Date(o.created_date).getTime()) / (1000 * 60 * 60 * 24))
    if (!ageByRep[o.owner_id]) ageByRep[o.owner_id] = []
    ageByRep[o.owner_id].push(ageDays)
  }

  const qtdByRep: Record<string, number> = {}
  for (const o of wonQtdData.data ?? []) {
    qtdByRep[o.owner_id] = (qtdByRep[o.owner_id] ?? 0) + Number(o.arr ?? 0)
  }

  const rows: RepLeaderboardRow[] = aes
    .map((ae) => {
      const rep = byRep[ae.id] ?? { won: [], lost: 0 }
      const total = rep.won.length + rep.lost
      const closed_won_arr = rep.won.reduce((s, v) => s + v, 0)
      const quota = Number(ae.quota ?? 0)
      const quarterly_quota = quota / 4
      const ages = ageByRep[ae.id] ?? []
      const avg_age_days = ages.length > 0
        ? Math.round(ages.reduce((s, v) => s + v, 0) / ages.length)
        : 0
      return {
        owner_id: ae.id,
        owner_name: ae.name,
        closed_won_count: rep.won.length,
        closed_won_arr: Math.round(closed_won_arr),
        quota: Math.round(quarterly_quota),
        attainment_pct: quarterly_quota > 0
          ? Math.round(((qtdByRep[ae.id] ?? 0) / quarterly_quota) * 1000) / 10
          : 0,
        avg_deal_arr: rep.won.length > 0 ? Math.round(closed_won_arr / rep.won.length) : 0,
        win_rate_pct: total > 0 ? Math.round((rep.won.length / total) * 1000) / 10 : 0,
        avg_age_days,
      }
    })
    .sort((a, b) => b.attainment_pct - a.attainment_pct)

  return NextResponse.json(rows)
}
