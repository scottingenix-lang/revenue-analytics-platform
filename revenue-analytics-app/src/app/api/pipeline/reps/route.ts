import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { RepLeaderboardRow } from '@/lib/types'

function quarterStart(): string {
  const now = new Date()
  const q = Math.floor(now.getMonth() / 3)
  return new Date(now.getFullYear(), q * 3, 1).toISOString().split('T')[0]
}

export async function GET() {
  const supabase = await createClient()

  const [aeData, oppsData] = await Promise.all([
    supabase.from('sls_users').select('id, name, quota').eq('role', 'AE'),
    supabase
      .from('sls_opportunities')
      .select('owner_id, arr, stage, deal_age_days')
      .in('stage', ['6', 'Closed Lost'])
      .gte('close_date', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]),
  ])

  const aes = aeData.data ?? []
  const opps = oppsData.data ?? []

  const byRep: Record<string, { won: number[]; lost: number }> = {}
  for (const o of opps) {
    if (!byRep[o.owner_id]) byRep[o.owner_id] = { won: [], lost: 0 }
    if (o.stage === '6') byRep[o.owner_id].won.push(Number(o.arr ?? 0))
    else byRep[o.owner_id].lost++
  }

  const qStart = quarterStart()
  const { data: wonQtd } = await supabase
    .from('sls_opportunities')
    .select('owner_id, arr')
    .eq('stage', '6')
    .gte('close_date', qStart)

  const qtdByRep: Record<string, number> = {}
  for (const o of wonQtd ?? []) {
    qtdByRep[o.owner_id] = (qtdByRep[o.owner_id] ?? 0) + Number(o.arr ?? 0)
  }

  const rows: RepLeaderboardRow[] = aes
    .map((ae) => {
      const rep = byRep[ae.id] ?? { won: [], lost: 0 }
      const total = rep.won.length + rep.lost
      const closed_won_arr = rep.won.reduce((s, v) => s + v, 0)
      const quota = Number(ae.quota ?? 0)
      const quarterly_quota = quota / 4
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
      }
    })
    .sort((a, b) => b.attainment_pct - a.attainment_pct)

  return NextResponse.json(rows)
}
