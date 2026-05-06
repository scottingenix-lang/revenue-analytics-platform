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
