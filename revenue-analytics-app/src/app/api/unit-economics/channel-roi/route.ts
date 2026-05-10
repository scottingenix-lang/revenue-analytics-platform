import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { ChannelRoiRow } from '@/lib/types'

export async function GET() {
  const supabase = await createClient()

  const [weightsRes, cacRes] = await Promise.all([
    supabase.from('mv_lead_source_influence_weights').select('*'),
    supabase
      .from('mv_cac_by_source_quarterly')
      .select('lead_source, close_quarter, cac')
      .order('close_quarter', { ascending: false }),
  ])

  // Latest CAC per source
  const latestCac: Record<string, number> = {}
  for (const r of cacRes.data ?? []) {
    if (!(r.lead_source in latestCac)) latestCac[r.lead_source] = Number(r.cac ?? 0)
  }

  const weights = weightsRes.data ?? []
  if (weights.length === 0) return NextResponse.json([])

  // Thresholds: median influence and median CAC
  const influenceVals = weights.map((w) => Number(w.influence_weight ?? 0)).sort((a, b) => a - b)
  const cacVals = Object.values(latestCac).filter((c) => c > 0).sort((a, b) => a - b)
  const medianInfluence = influenceVals[Math.floor(influenceVals.length / 2)] ?? 0
  const medianCac       = cacVals[Math.floor(cacVals.length / 2)] ?? 0

  const rows: ChannelRoiRow[] = weights
    .map((w) => {
      const cac       = latestCac[w.lead_source] ?? null
      const influence = Number(w.influence_weight ?? 0)
      const highInf   = influence  >= medianInfluence
      const lowCac    = cac != null && cac <= medianCac

      let roi_flag: ChannelRoiRow['roi_flag'] = 'unknown'
      if (cac != null) {
        roi_flag = highInf && lowCac  ? 'green'
                 : !highInf && !lowCac ? 'red'
                 : 'yellow'
      }

      return {
        lead_source:      w.lead_source ?? '',
        influence_weight: Number(w.influence_weight ?? 0),
        win_rate_present: Math.round(Number(w.win_rate_present ?? 0) * 1000) / 10,
        cac,
        roi_flag,
        deals_with_source: Number(w.deals_with_source ?? 0),
      }
    })
    .sort((a, b) => b.influence_weight - a.influence_weight)

  const dateRange = 'Rolling 12 Months'

  return NextResponse.json({ rows, dateRange })
}
