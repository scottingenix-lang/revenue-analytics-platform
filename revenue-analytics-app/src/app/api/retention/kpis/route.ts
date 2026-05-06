import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { RetentionKpis } from '@/lib/types'

export async function GET() {
  const supabase = await createClient()

  const trailing12 = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const { data: movements } = await supabase
    .from('sub_arr_movements')
    .select('movement_type, arr_delta')
    .gte('effective_date', trailing12)

  const { data: currentArr } = await supabase
    .from('sub_subscriptions')
    .select('arr')
    .eq('status', 'active')

  const { data: arrDaily } = await supabase
    .from('mv_arr_daily')
    .select('total_arr')
    .lte('snapshot_date', trailing12)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const mvs = movements ?? []
  const expansion = mvs.filter((m) => m.movement_type === 'Expansion').reduce((s, m) => s + Number(m.arr_delta), 0)
  const contraction = mvs.filter((m) => m.movement_type === 'Contraction').reduce((s, m) => s + Math.abs(Number(m.arr_delta)), 0)
  const churn = mvs.filter((m) => m.movement_type === 'Churn').reduce((s, m) => s + Math.abs(Number(m.arr_delta)), 0)
  const new_arr = mvs.filter((m) => m.movement_type === 'New').reduce((s, m) => s + Number(m.arr_delta), 0)

  const starting_arr = Number((arrDaily as { total_arr?: number } | null)?.total_arr ?? 0)
  const total_arr = (currentArr ?? []).reduce((s, r) => s + Number(r.arr), 0)

  const nrr_pct = starting_arr > 0 ? ((starting_arr + expansion - contraction - churn) / starting_arr) * 100 : 0
  const grr_pct = starting_arr > 0 ? ((starting_arr - contraction - churn) / starting_arr) * 100 : 0

  const kpis: RetentionKpis = {
    nrr_pct: Math.round(nrr_pct * 10) / 10,
    grr_pct: Math.round(grr_pct * 10) / 10,
    expansion_arr: Math.round(expansion),
    churn_arr: Math.round(churn),
    contraction_arr: Math.round(contraction),
    net_new_arr: Math.round(new_arr),
  }

  return NextResponse.json(kpis)
}
