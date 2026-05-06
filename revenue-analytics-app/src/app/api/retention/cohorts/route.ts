import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { CohortRetentionRow } from '@/lib/types'

export async function GET() {
  const supabase = await createClient()

  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - 24)
  const cutoffStr = cutoff.toISOString().split('T')[0]

  const { data } = await supabase
    .from('mv_cohort_retention_monthly')
    .select('cohort_month, company_size, fiscal_month, arr_at_start, arr_retained, grr')
    .gte('cohort_month', cutoffStr)
    .order('cohort_month', { ascending: true })
    .order('fiscal_month', { ascending: true })

  const rows: CohortRetentionRow[] = (data ?? []).map((r) => {
    const cohort = new Date(r.cohort_month)
    const fiscal = new Date(r.fiscal_month)
    const period_offset = Math.round(
      (fiscal.getFullYear() - cohort.getFullYear()) * 12 +
      (fiscal.getMonth() - cohort.getMonth())
    )
    return {
      cohort_month: r.cohort_month,
      company_size: r.company_size ?? 'Unknown',
      fiscal_month: r.fiscal_month,
      arr_at_start: Number(r.arr_at_start ?? 0),
      arr_retained: Number(r.arr_retained ?? 0),
      grr: Math.round(Number(r.grr ?? 0) * 1000) / 10,
      period_offset,
    }
  })

  return NextResponse.json(rows)
}
