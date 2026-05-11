import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { RepAttainmentRow, GoalAttainmentRow, PipelineLagForecastRow } from '@/lib/types'

function currentQuarter(): { year: number; quarter: number } {
  const now = new Date()
  return { year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 }
}

export async function GET() {
  const supabase         = await createClient()
  const { year, quarter } = currentQuarter()

  const [repRes, goalRes, lagRes] = await Promise.all([
    supabase
      .from('mv_rep_attainment')
      .select('user_id, rep_name, rep_segment, period_year, period_quarter, quota_amount, ramp_status, effective_quota, arr_closed, deal_count_closed, pct_attainment, pipeline_2_qtrs_out')
      .eq('period_year', year)
      .eq('period_quarter', quarter)
      .order('pct_attainment', { ascending: false }),
    supabase
      .from('mv_attainment_by_period')
      .select('goal_id, period_year, period_quarter, segment, total_arr_goal, actual_total_arr, actual_total_wins, pct_attainment')
      .eq('period_year', year)
      .order('period_quarter', { ascending: true }),
    supabase
      .from('mv_pipeline_lag_forecast')
      .select('close_quarter, segment, lag_quarters, source_pipeline_arr, assumed_win_rate, projected_arr, projected_wins')
      .order('close_quarter', { ascending: true })
      .order('segment', { ascending: true }),
  ])

  const repAttainment: RepAttainmentRow[] = (repRes.data ?? []).map((r) => ({
    user_id:           r.user_id,
    rep_name:          r.rep_name     ?? '',
    rep_segment:       r.rep_segment  ?? '',
    period_year:       r.period_year,
    period_quarter:    r.period_quarter,
    quota_amount:      Number(r.quota_amount ?? 0),
    ramp_status:       r.ramp_status  ?? '',
    effective_quota:   Number(r.effective_quota ?? 0),
    arr_closed:        Number(r.arr_closed ?? 0),
    deal_count_closed: Number(r.deal_count_closed ?? 0),
    pct_attainment:    Math.round(Number(r.pct_attainment ?? 0) * 1000) / 10,
    pipeline_2_qtrs_out: Number(r.pipeline_2_qtrs_out ?? 0),
  }))

  const goalAttainment: GoalAttainmentRow[] = (goalRes.data ?? []).map((g) => ({
    goal_id:          g.goal_id,
    period_year:      g.period_year,
    period_quarter:   g.period_quarter,
    segment:          g.segment ?? null,
    total_arr_goal:   Number(g.total_arr_goal ?? 0),
    actual_total_arr: Number(g.actual_total_arr ?? 0),
    actual_total_wins: Number(g.actual_total_wins ?? 0),
    pct_attainment:   Math.round(Number(g.pct_attainment ?? 0) * 1000) / 10,
  }))

  const lagForecast: PipelineLagForecastRow[] = (lagRes.data ?? []).map((l) => ({
    close_quarter:       l.close_quarter,
    segment:             l.segment ?? '',
    lag_quarters:        Number(l.lag_quarters ?? 2),
    source_pipeline_arr: Number(l.source_pipeline_arr ?? 0),
    assumed_win_rate:    Math.round(Number(l.assumed_win_rate ?? 0) * 1000) / 10,
    projected_arr:       Number(l.projected_arr ?? 0),
    projected_wins:      Number(l.projected_wins ?? 0),
  }))

  return NextResponse.json({ repAttainment, goalAttainment, lagForecast, currentQuarter: { year, quarter } })
}
