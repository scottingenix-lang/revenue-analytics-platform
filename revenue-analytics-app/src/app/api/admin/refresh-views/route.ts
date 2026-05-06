import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const VIEWS = [
  'mv_arr_daily',
  'mv_funnel_conversion_monthly',
  'mv_attribution_first_touch',
  'mv_attribution_last_touch',
  'mv_attribution_linear',
  'mv_attribution_time_decay',
  'mv_attribution_w_shaped',
  'mv_pipeline_coverage_weekly',
  'mv_cohort_retention_monthly',
  'mv_lead_source_influence_weights',
  'mv_cac_by_source_quarterly',
  'mv_stage_velocity_stats',
  'mv_overall_cycle_stats',
  'mv_discovery_meeting_ops',
]

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabase = await createClient()
  const results: Record<string, string> = {}

  for (const view of VIEWS) {
    const { error } = await supabase.rpc('exec_sql' as never, {
      sql: `REFRESH MATERIALIZED VIEW ${view}`,
    } as never).maybeSingle()
    results[view] = error ? `error: ${error.message}` : 'ok'
  }

  return NextResponse.json({ refreshed_at: new Date().toISOString(), results })
}
