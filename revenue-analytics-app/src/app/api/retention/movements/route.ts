import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function getPeriodDates(period: string): { start: string; end: string } {
  const now = new Date()
  const year = now.getFullYear()
  const q = Math.floor(now.getMonth() / 3)

  if (period === 'this_quarter') {
    const start = new Date(year, q * 3, 1)
    return { start: start.toISOString().split('T')[0], end: now.toISOString().split('T')[0] }
  }

  if (period === 'last_quarter') {
    const prevQ = q - 1
    const startYear = prevQ < 0 ? year - 1 : year
    const startMonth = prevQ < 0 ? 9 : prevQ * 3
    const start = new Date(startYear, startMonth, 1)
    const end = new Date(year, q * 3, 0)
    return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] }
  }

  // this_fiscal_year
  return { start: `${year}-01-01`, end: now.toISOString().split('T')[0] }
}

type RawMovement = {
  movement_type: string
  arr_delta: number
  effective_date: string
  company_id: string
  subscription_id: string
  company: { name: string; company_size: string | null; vertical_tag: string | null } | null
  subscription: { arr: number; start_date: string; status: string } | null
}

export type MovementRow = {
  company_id: string
  company_name: string
  company_size: string
  vertical: string
  current_arr: number
  billing_start_date: string
  movement_arr: number
}

export type MovementsResponse = {
  period: { start: string; end: string }
  summary: {
    new_arr: number
    expansion_arr: number
    contraction_arr: number
    churn_arr: number
    net_new_arr: number
  }
  new_business: MovementRow[]
  expansion: MovementRow[]
  contraction: MovementRow[]
  churn: MovementRow[]
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const period = searchParams.get('period') ?? 'this_fiscal_year'

  const supabase = await createClient()
  const dates = getPeriodDates(period)

  const { data: raw } = await supabase
    .from('sub_arr_movements')
    .select(`
      movement_type,
      arr_delta,
      effective_date,
      company_id,
      subscription_id,
      company:mkt_companies!company_id(name, company_size, vertical_tag),
      subscription:sub_subscriptions!subscription_id(arr, start_date, status)
    `)
    .gte('effective_date', dates.start)
    .lte('effective_date', dates.end)
    .order('arr_delta', { ascending: false })

  const movements = (raw ?? []) as unknown as RawMovement[]

  function toRow(m: RawMovement): MovementRow {
    const sub = m.subscription
    const isChurned = sub?.status === 'churned'
    return {
      company_id: m.company_id,
      company_name: m.company?.name ?? '—',
      company_size: m.company?.company_size ?? '—',
      vertical: m.company?.vertical_tag ?? '—',
      current_arr: isChurned ? 0 : Number(sub?.arr ?? 0),
      billing_start_date: sub?.start_date ?? '',
      movement_arr: Math.abs(Number(m.arr_delta)),
    }
  }

  const newBusiness = movements.filter((m) => m.movement_type === 'New').map(toRow)
  const expansion   = movements.filter((m) => m.movement_type === 'Expansion').map(toRow)
  const contraction = movements.filter((m) => m.movement_type === 'Contraction').map(toRow)
  const churn       = movements.filter((m) => m.movement_type === 'Churn').map(toRow)

  const summary = {
    new_arr:         newBusiness.reduce((s, r) => s + r.movement_arr, 0),
    expansion_arr:   expansion.reduce((s, r) => s + r.movement_arr, 0),
    contraction_arr: contraction.reduce((s, r) => s + r.movement_arr, 0),
    churn_arr:       churn.reduce((s, r) => s + r.movement_arr, 0),
    net_new_arr:
      newBusiness.reduce((s, r) => s + r.movement_arr, 0) +
      expansion.reduce((s, r) => s + r.movement_arr, 0) -
      contraction.reduce((s, r) => s + r.movement_arr, 0) -
      churn.reduce((s, r) => s + r.movement_arr, 0),
  }

  const response: MovementsResponse = {
    period: dates,
    summary,
    new_business: newBusiness,
    expansion,
    contraction,
    churn,
  }

  return NextResponse.json(response)
}
