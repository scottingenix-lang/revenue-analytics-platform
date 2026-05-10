export type NavItem = {
  label: string
  href: string
  icon: string
}

export type StatTile = {
  label: string
  value: string | null
  phase?: string
}

// ── Executive Cockpit ─────────────────────────────────────────

export type CockpitKpis = {
  total_arr: number
  nrr_pct: number
  grr_pct: number
  pipeline_coverage: number
  win_rate_pct: number
  avg_deal_arr: number
  deal_count: number
  avg_cycle_days: number
  cac_payback_months: number
  blended_cac: number
  gross_margin_pct: number
  magic_number: number
  arr_growth_pct: number
  rule_of_40: number
}

export type ArrDailyRow = {
  snapshot_date: string
  total_arr: number
  arr_smb: number
  arr_midmarket: number
  arr_enterprise: number
}

export type ArrMovementRow = {
  movement_type: 'New' | 'Expansion' | 'Reactivation' | 'Contraction' | 'Churn'
  arr_value: number
  fiscal_quarter: string
}

// ── Attribution ───────────────────────────────────────────────

export type AttributionRow = {
  attributed_source: string
  deal_count: number
  stage_0_arr: number
  stage_1_arr: number
  stage_2_arr: number
  stage_3_arr: number
  stage_4_arr: number
  stage_5_arr: number
  closed_won_arr: number
  lost_arr: number
  pct_of_total_arr: number
}

export type InfluenceWeightRow = {
  lead_source: string
  deals_with_source: number
  closed_won_with_source: number
  win_rate_present: number
  influence_weight: number
}

// ── Pipeline ──────────────────────────────────────────────────

export type PipelineKpis = {
  open_deals: number
  pipeline_arr: number
  weighted_arr: number
  pipeline_coverage: number
  win_rate_pct: number
  avg_deal_arr: number
  avg_cycle_days: number
  won_arr_qtd: number
}

export type StageVelocityRow = {
  from_stage: string
  to_stage: string
  segment: string
  transitions: number
  avg_days: number
  conversion_rate: number
}

export type RepLeaderboardRow = {
  owner_id: string
  owner_name: string
  closed_won_count: number
  closed_won_arr: number
  quota: number
  attainment_pct: number
  avg_deal_arr: number
  win_rate_pct: number
  avg_age_days: number
}

// ── Retention ─────────────────────────────────────────────────

export type RetentionKpis = {
  nrr_pct: number
  grr_pct: number
  expansion_arr: number
  churn_arr: number
  contraction_arr: number
  net_new_arr: number
}

export type CohortRetentionRow = {
  cohort_month: string
  company_size: string
  vertical: string
  fiscal_month: string
  arr_at_start: number
  arr_retained: number
  grr: number
  period_offset: number
}

export type ArrMovementSummary = {
  label: string
  arr_value: number
  color: string
}

// ── Unit Economics ────────────────────────────────────────────

export type UnitEconomicsKpis = {
  blended_cac: number
  cac_payback_months: number
  ltv: number
  ltv_cac: number
  gross_margin_pct: number
  magic_number: number
  arr_growth_pct: number
  rule_of_40: number
}

export type CacBySourceRow = {
  close_quarter: string
  lead_source: string
  new_customers: number
  new_arr: number
  total_spend: number
  cac: number
}

// ── Pipeline — new panels ──────────────────────────────────────

export type StalledDealRow = {
  id: string
  name: string
  company_name: string
  owner_name: string
  stage: string
  segment: string
  arr: number
  close_date: string
  current_stage_age_days: number
  avg_days_for_stage: number
  overage_days: number
  overage_pct: number
}

export type FastPacingDealRow = {
  id: string
  name: string
  company_name: string
  owner_name: string
  stage: string
  segment: string
  arr: number
  close_date: string
  deal_age_days: number
  p25_days_to_stage: number
  days_ahead: number
}

export type CloseDateDeal = {
  id: string
  name: string
  company_name: string
  owner_name: string
  stage: string
  segment: string
  arr: number
  close_date: string
  probability: number
  forecast_category: string
  ai_close_probability: number | null
}

export type CloseDateWeek = {
  week_start: string
  week_label: string
  deals: CloseDateDeal[]
  total_arr: number
  weighted_arr: number
}

export type ForecastMonth = {
  label: string
  month: string
  committed_arr: number
  pipeline_arr: number
  deals: CloseDateDeal[]
}

export type QuarterForecast = {
  label: string
  quota: number
  closed_arr: number
  committed_arr: number
  pipeline_arr: number
  gap: number
  months: ForecastMonth[]
}

export type DiscoveryOpsRow = {
  sdr_id: string
  sdr_name: string
  sdr_segment: string
  total_scheduled: number
  held: number
  hard_no_show: number
  recoverable_no_show: number
  reschedules: number
  disqualified: number
  held_rate: number
  hard_no_show_rate: number
  reschedule_rate: number
  disqualification_rate: number
  avg_reschedules_per_held: number | null
}

export type DiscoveryBookingWeek = {
  week_start: string
  week_label: string
  sdrs: Record<string, number>
  total: number
}

// ── v2.1 — attainment & lag forecast ──────────────────────────

export type RepAttainmentRow = {
  user_id: string
  rep_name: string
  rep_segment: string
  period_year: number
  period_quarter: number
  quota_amount: number
  ramp_status: string
  effective_quota: number
  arr_closed: number
  deal_count_closed: number
  pct_attainment: number
  pipeline_2_qtrs_out: number
}

export type GoalAttainmentRow = {
  goal_id: string
  period_year: number
  period_quarter: number | null
  segment: string | null
  total_arr_goal: number
  actual_total_arr: number
  actual_total_wins: number
  pct_attainment: number
}

export type PipelineLagForecastRow = {
  close_quarter: string
  segment: string
  lag_quarters: number
  source_pipeline_arr: number
  assumed_win_rate: number
  projected_arr: number
  projected_wins: number
}

// ── Attribution — channel handoff ─────────────────────────────

export type ChannelHandoffRow = {
  original_lead_source: string
  deal_lead_source: string
  deal_count: number
  closed_won_arr: number
  pct_of_source: number
}

// ── Unit Economics — channel ROI ──────────────────────────────

export type ChannelRoiRow = {
  lead_source: string
  influence_weight: number
  win_rate_present: number
  cac: number | null
  roi_flag: 'green' | 'yellow' | 'red' | 'unknown'
  deals_with_source: number
}

// ── Attribution — source conversion funnel ─────────────────────

export type SourceConversionRow = {
  lead_source: string
  trailing_12mo_mqls: number
  trailing_12mo_sqls: number
  lead_to_mql_pct: number
  mql_to_sql_pct: number
  s0_to_s1: number
  s1_to_s2: number
  s2_to_s3: number
  s3_to_s4: number
  s4_to_s5: number
  s5_to_s6: number
  win_rate: number
  deal_count: number
}

// ── Attribution — company size × industry cross-section ────────

export type CrossSectionRow = {
  company_size: string
  industry: string
  wins: number
  total_decided: number
  win_rate: number
  avg_arr: number
  avg_days_to_win: number
}

// ── Attribution — deal journey ─────────────────────────────────

export type DealSearchResult = {
  id: string
  name: string
  arr: number
  stage: string
  close_date: string
  lead_source: string | null
}

export type DealJourneyTouch = {
  id: string
  touch_type: string
  touch_date: string
  pre_or_post_deal: 'pre' | 'post' | 'no_deal'
  engagement_score: number
  touch_value: number | null
  campaign_id: string | null
  campaign: { name: string; campaign_type: string } | null
}

export type DealJourneyResponse = {
  opp: {
    id: string
    name: string
    arr: number
    stage: string
    created_date: string
    close_date: string
    lead_source: string | null
    segment: string | null
    owner_name: string | null
  }
  contact: {
    id: string
    first_name: string
    last_name: string
    title: string | null
    lead_source: string | null
    original_lead_source: string | null
  } | null
  touches: DealJourneyTouch[]
}
