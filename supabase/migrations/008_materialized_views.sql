-- ============================================================
-- 008_materialized_views.sql
-- All mv_* materialized views per the spec.
-- Unique indexes added on each view to support CONCURRENT refresh in Phase 3.
-- Views are created empty here; seeded data populates them via REFRESH.
-- ============================================================

-- ── mv_arr_daily ──────────────────────────────────────────────
-- Point-in-time ARR per day (trailing 3 years).

CREATE MATERIALIZED VIEW mv_arr_daily AS
SELECT
  d::DATE                              AS snapshot_date,
  SUM(s.arr)                           AS total_arr,
  COUNT(DISTINCT s.company_id)         AS customer_count,
  SUM(s.arr) FILTER (WHERE c.company_size = 'SMB')         AS arr_smb,
  SUM(s.arr) FILTER (WHERE c.company_size = 'Mid-Market')  AS arr_midmarket,
  SUM(s.arr) FILTER (WHERE c.company_size = 'Enterprise')  AS arr_enterprise
FROM
  generate_series(
    (SELECT MIN(start_date) FROM sub_subscriptions),
    CURRENT_DATE,
    '1 day'::INTERVAL
  ) d
JOIN sub_subscriptions s
  ON s.start_date <= d::DATE
 AND (s.end_date >= d::DATE OR s.status = 'active')
JOIN mkt_companies c ON c.id = s.company_id
GROUP BY d
WITH NO DATA;

CREATE UNIQUE INDEX idx_mv_arr_daily_date ON mv_arr_daily (snapshot_date);

-- ── mv_funnel_conversion_monthly ──────────────────────────────
-- Stage-to-stage conversion by lead-creation cohort (monthly).

CREATE MATERIALIZED VIEW mv_funnel_conversion_monthly AS
SELECT
  DATE_TRUNC('month', o.created_date::TIMESTAMPTZ)::DATE AS cohort_month,
  o.segment,
  h.from_stage,
  h.to_stage,
  COUNT(DISTINCT o.id)                          AS deals,
  AVG(h.days_in_prior_stage)::NUMERIC(8,2)      AS avg_days_in_prior,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY h.days_in_prior_stage) AS median_days
FROM sls_opportunities o
JOIN sls_opportunity_history h ON h.opportunity_id = o.id
WHERE h.to_stage != 'Closed Lost'
GROUP BY 1, 2, 3, 4
WITH NO DATA;

CREATE UNIQUE INDEX idx_mv_funnel_conv_month ON mv_funnel_conversion_monthly
  (cohort_month, segment, from_stage, to_stage);

-- ── mv_attribution_first_touch ────────────────────────────────

CREATE MATERIALIZED VIEW mv_attribution_first_touch AS
SELECT
  o.id                   AS opportunity_id,
  o.arr,
  o.stage,
  o.vertical,
  o.segment,
  t.contact_id,
  t.campaign_id,
  t.touch_type,
  ls_src.lead_source     AS attributed_source,
  t.touch_date
FROM sls_opportunities o
JOIN LATERAL (
  SELECT mt.*, mc.lead_source
  FROM mkt_touches mt
  JOIN mkt_contacts mc ON mc.id = mt.contact_id
  WHERE mt.contact_id IN (
    SELECT contact_id FROM sls_opportunity_contacts WHERE opportunity_id = o.id
  )
    AND mt.touch_date < o.created_date::TIMESTAMPTZ
    AND mt.pre_or_post_deal = 'pre'
  ORDER BY mt.touch_date ASC
  LIMIT 1
) t ON true
JOIN mkt_contacts ls_src ON ls_src.id = t.contact_id
WITH NO DATA;

CREATE UNIQUE INDEX idx_mv_attr_first ON mv_attribution_first_touch (opportunity_id);

-- ── mv_attribution_last_touch ─────────────────────────────────

CREATE MATERIALIZED VIEW mv_attribution_last_touch AS
SELECT
  o.id                   AS opportunity_id,
  o.arr,
  o.stage,
  o.vertical,
  o.segment,
  t.contact_id,
  t.campaign_id,
  t.touch_type,
  ls_src.lead_source     AS attributed_source,
  t.touch_date
FROM sls_opportunities o
JOIN LATERAL (
  SELECT mt.*, mc.lead_source
  FROM mkt_touches mt
  JOIN mkt_contacts mc ON mc.id = mt.contact_id
  WHERE mt.contact_id IN (
    SELECT contact_id FROM sls_opportunity_contacts WHERE opportunity_id = o.id
  )
    AND mt.touch_date < o.created_date::TIMESTAMPTZ
    AND mt.pre_or_post_deal = 'pre'
  ORDER BY mt.touch_date DESC
  LIMIT 1
) t ON true
JOIN mkt_contacts ls_src ON ls_src.id = t.contact_id
WITH NO DATA;

CREATE UNIQUE INDEX idx_mv_attr_last ON mv_attribution_last_touch (opportunity_id);

-- ── mv_attribution_linear ─────────────────────────────────────
-- Equal credit to all pre-deal touches per opportunity.

CREATE MATERIALIZED VIEW mv_attribution_linear AS
SELECT
  o.id                           AS opportunity_id,
  o.arr,
  o.stage,
  o.segment,
  o.vertical,
  mt.contact_id,
  mt.campaign_id,
  mc.lead_source                 AS attributed_source,
  mt.touch_date,
  o.arr / NULLIF(touch_counts.total, 0) AS attributed_arr
FROM sls_opportunities o
JOIN sls_opportunity_contacts oc ON oc.opportunity_id = o.id
JOIN mkt_touches mt
  ON mt.contact_id = oc.contact_id
 AND mt.pre_or_post_deal = 'pre'
 AND mt.touch_date < o.created_date::TIMESTAMPTZ
JOIN mkt_contacts mc ON mc.id = mt.contact_id
JOIN LATERAL (
  SELECT COUNT(*) AS total
  FROM mkt_touches mt2
  JOIN sls_opportunity_contacts oc2 ON oc2.contact_id = mt2.contact_id
  WHERE oc2.opportunity_id = o.id
    AND mt2.pre_or_post_deal = 'pre'
    AND mt2.touch_date < o.created_date::TIMESTAMPTZ
) touch_counts ON true
WITH NO DATA;

CREATE INDEX idx_mv_attr_linear_opp ON mv_attribution_linear (opportunity_id);

-- ── mv_attribution_time_decay ─────────────────────────────────
-- Weighted credit with 0.5^(days_old/90) decay, 365-day lookback.

CREATE MATERIALIZED VIEW mv_attribution_time_decay AS
SELECT
  o.id                               AS opportunity_id,
  o.arr,
  o.stage,
  o.segment,
  o.vertical,
  mt.contact_id,
  mt.campaign_id,
  mc.lead_source                     AS attributed_source,
  mt.touch_date,
  mt.engagement_score,
  EXTRACT(DAY FROM (o.created_date::TIMESTAMPTZ - mt.touch_date))::INT
                                     AS days_before_deal,
  mt.engagement_score
    * POWER(0.5,
        EXTRACT(DAY FROM (o.created_date::TIMESTAMPTZ - mt.touch_date)) / 90.0
      )                              AS touch_weight
FROM sls_opportunities o
JOIN sls_opportunity_contacts oc ON oc.opportunity_id = o.id
JOIN mkt_touches mt
  ON mt.contact_id = oc.contact_id
 AND mt.pre_or_post_deal = 'pre'
 AND mt.touch_date >= o.created_date::TIMESTAMPTZ - INTERVAL '365 days'
 AND mt.touch_date < o.created_date::TIMESTAMPTZ
JOIN mkt_contacts mc ON mc.id = mt.contact_id
WITH NO DATA;

CREATE INDEX idx_mv_attr_decay_opp ON mv_attribution_time_decay (opportunity_id);

-- ── mv_attribution_w_shaped ───────────────────────────────────
-- W-shaped: 30% first touch, 30% lead creation touch, 30% opp creation touch,
-- 10% distributed equally among all other touches.

CREATE MATERIALIZED VIEW mv_attribution_w_shaped AS
WITH ranked AS (
  SELECT
    o.id                AS opportunity_id,
    o.arr,
    o.stage,
    o.segment,
    o.vertical,
    mt.id               AS touch_id,
    mt.contact_id,
    mt.campaign_id,
    mc.lead_source      AS attributed_source,
    mt.touch_date,
    ROW_NUMBER() OVER (PARTITION BY o.id ORDER BY mt.touch_date ASC)  AS rn_asc,
    ROW_NUMBER() OVER (PARTITION BY o.id ORDER BY mt.touch_date DESC) AS rn_desc,
    COUNT(*) OVER (PARTITION BY o.id)                                  AS total_touches
  FROM sls_opportunities o
  JOIN sls_opportunity_contacts oc ON oc.opportunity_id = o.id
  JOIN mkt_touches mt
    ON mt.contact_id = oc.contact_id
   AND mt.pre_or_post_deal = 'pre'
   AND mt.touch_date < o.created_date::TIMESTAMPTZ
  JOIN mkt_contacts mc ON mc.id = mt.contact_id
)
SELECT
  opportunity_id,
  arr,
  stage,
  segment,
  vertical,
  touch_id,
  contact_id,
  campaign_id,
  attributed_source,
  touch_date,
  CASE
    WHEN total_touches = 1 THEN arr
    WHEN rn_asc = 1                              THEN arr * 0.30  -- first touch
    WHEN rn_desc = 1                             THEN arr * 0.30  -- last touch before deal
    WHEN rn_asc = CEIL(total_touches / 2.0)::INT THEN arr * 0.30  -- mid-funnel
    ELSE arr * 0.10 / NULLIF(total_touches - 3, 0)               -- remainder
  END AS attributed_arr
FROM ranked
WITH NO DATA;

CREATE INDEX idx_mv_attr_wshaped_opp ON mv_attribution_w_shaped (opportunity_id);

-- ── mv_pipeline_coverage_weekly ───────────────────────────────

CREATE MATERIALIZED VIEW mv_pipeline_coverage_weekly AS
SELECT
  DATE_TRUNC('week', now())::DATE     AS week_start,
  o.segment,
  DATE_TRUNC('quarter', o.close_date::TIMESTAMPTZ)::DATE AS close_quarter,
  COUNT(*)                            AS open_deals,
  SUM(o.arr)                          AS pipeline_arr,
  AVG(o.probability)::NUMERIC(5,2)    AS avg_probability,
  SUM(o.arr * o.probability / 100.0)  AS weighted_pipeline_arr
FROM sls_opportunities o
WHERE o.stage NOT IN ('6', 'Closed Lost')
  AND o.close_date >= CURRENT_DATE
GROUP BY 2, 3
WITH NO DATA;

CREATE UNIQUE INDEX idx_mv_pipeline_cov ON mv_pipeline_coverage_weekly
  (week_start, segment, close_quarter);

-- ── mv_cohort_retention_monthly ───────────────────────────────

CREATE MATERIALIZED VIEW mv_cohort_retention_monthly AS
SELECT
  DATE_TRUNC('month', s.start_date::TIMESTAMPTZ)::DATE AS cohort_month,
  c.company_size,
  m.fiscal_month,
  COUNT(DISTINCT s.company_id)                          AS companies_at_start,
  SUM(s.arr)                                            AS arr_at_start,
  COUNT(DISTINCT s.company_id) FILTER (WHERE s.status = 'active') AS companies_retained,
  SUM(s.arr) FILTER (WHERE s.status = 'active')        AS arr_retained,
  SUM(s.arr) FILTER (WHERE s.status = 'active')
    / NULLIF(SUM(s.arr), 0)                            AS grr
FROM sub_subscriptions s
JOIN mkt_companies c ON c.id = s.company_id
JOIN (SELECT DISTINCT DATE_TRUNC('month', effective_date::TIMESTAMPTZ)::DATE AS fiscal_month
      FROM sub_arr_movements) m
  ON m.fiscal_month >= DATE_TRUNC('month', s.start_date::TIMESTAMPTZ)
GROUP BY 1, 2, 3
WITH NO DATA;

CREATE UNIQUE INDEX idx_mv_cohort_ret ON mv_cohort_retention_monthly
  (cohort_month, company_size, fiscal_month);

-- ── mv_lead_source_influence_weights ─────────────────────────
-- Per Lead Source: win_rate × sqrt(deals_with_source) over trailing 12 months.

CREATE MATERIALIZED VIEW mv_lead_source_influence_weights AS
WITH deal_sources AS (
  -- For each deal, find all lead sources touched by any associated contact
  -- within 365 days before deal creation
  SELECT DISTINCT
    o.id                AS opportunity_id,
    o.stage,
    mc.lead_source      AS touch_source
  FROM sls_opportunities o
  JOIN sls_opportunity_contacts oc ON oc.opportunity_id = o.id
  JOIN mkt_touches mt
    ON mt.contact_id = oc.contact_id
   AND mt.touch_date >= o.created_date::TIMESTAMPTZ - INTERVAL '365 days'
   AND mt.touch_date < o.created_date::TIMESTAMPTZ
  JOIN mkt_contacts mc ON mc.id = mt.contact_id
  WHERE o.created_date >= CURRENT_DATE - INTERVAL '365 days'
    AND mc.lead_source IS NOT NULL
)
SELECT
  touch_source                                              AS lead_source,
  COUNT(DISTINCT opportunity_id)                            AS deals_with_source,
  COUNT(DISTINCT opportunity_id) FILTER (WHERE stage = '6') AS closed_won_with_source,
  COUNT(DISTINCT opportunity_id) FILTER (WHERE stage = 'Closed Lost') AS closed_lost_with_source,
  COUNT(DISTINCT opportunity_id) FILTER (WHERE stage = '6')
    / NULLIF(
        COUNT(DISTINCT opportunity_id) FILTER (WHERE stage IN ('6', 'Closed Lost')),
        0
      )::NUMERIC                                            AS win_rate_present,
  SQRT(COUNT(DISTINCT opportunity_id)::NUMERIC)             AS volume_factor,
  COUNT(DISTINCT opportunity_id) FILTER (WHERE stage = '6')
    / NULLIF(
        COUNT(DISTINCT opportunity_id) FILTER (WHERE stage IN ('6', 'Closed Lost')),
        0
      )::NUMERIC
    * SQRT(COUNT(DISTINCT opportunity_id)::NUMERIC)         AS influence_weight
FROM deal_sources
GROUP BY touch_source
WITH NO DATA;

CREATE UNIQUE INDEX idx_mv_influence_weights ON mv_lead_source_influence_weights (lead_source);

-- ── mv_cac_by_source_quarterly ────────────────────────────────

CREATE MATERIALIZED VIEW mv_cac_by_source_quarterly AS
WITH new_logos AS (
  SELECT
    DATE_TRUNC('quarter', s.start_date::TIMESTAMPTZ)::DATE AS close_quarter,
    o.lead_source,
    COUNT(DISTINCT s.company_id) AS new_customers,
    SUM(s.arr)                   AS new_arr
  FROM sub_subscriptions s
  JOIN sls_opportunities o ON o.id = s.opportunity_id
  WHERE o.stage = '6'
    AND o.pipeline = 'New Business'
  GROUP BY 1, 2
),
spend AS (
  SELECT
    DATE_TRUNC('quarter', fiscal_month::TIMESTAMPTZ)::DATE AS close_quarter,
    channel,
    SUM(amount) AS total_spend
  FROM fin_spend_monthly
  WHERE channel IS NOT NULL
  GROUP BY 1, 2
)
SELECT
  n.close_quarter,
  n.lead_source,
  n.new_customers,
  n.new_arr,
  s.total_spend,
  s.total_spend / NULLIF(n.new_customers, 0) AS cac
FROM new_logos n
LEFT JOIN spend s
  ON s.close_quarter = n.close_quarter
 AND s.channel = n.lead_source
WITH NO DATA;

CREATE UNIQUE INDEX idx_mv_cac_source ON mv_cac_by_source_quarterly
  (close_quarter, lead_source);

-- ── mv_stage_velocity_stats ───────────────────────────────────
-- Per (segment, from_stage, to_stage): conversion rate + time stats.

CREATE MATERIALIZED VIEW mv_stage_velocity_stats AS
SELECT
  o.segment,
  h.from_stage,
  h.to_stage,
  COUNT(*)                                                       AS transitions,
  AVG(h.days_in_prior_stage)::NUMERIC(8,2)                      AS avg_days,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY h.days_in_prior_stage) AS median_days,
  PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY h.days_in_prior_stage) AS p75_days,
  PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY h.days_in_prior_stage) AS p90_days,
  -- Conversion rate: transitions that progressed (not Closed Lost) vs total entering from_stage
  COUNT(*) FILTER (WHERE h.to_stage != 'Closed Lost')
    / NULLIF(COUNT(*), 0)::NUMERIC                               AS conversion_rate
FROM sls_opportunity_history h
JOIN sls_opportunities o ON o.id = h.opportunity_id
WHERE h.from_stage IS NOT NULL
GROUP BY 1, 2, 3
WITH NO DATA;

CREATE UNIQUE INDEX idx_mv_stage_vel ON mv_stage_velocity_stats
  (segment, from_stage, to_stage);

-- ── mv_overall_cycle_stats ────────────────────────────────────
-- Per (segment, current_stage): avg/median/p25 days to reach current stage
-- from deal creation.

CREATE MATERIALIZED VIEW mv_overall_cycle_stats AS
WITH stage_entry AS (
  SELECT
    o.id              AS opportunity_id,
    o.segment,
    h.to_stage        AS reached_stage,
    SUM(h2.days_in_prior_stage) AS days_to_reach
  FROM sls_opportunities o
  JOIN sls_opportunity_history h ON h.opportunity_id = o.id
  -- Sum all days across prior stages to get total days from creation to this stage
  JOIN sls_opportunity_history h2
    ON h2.opportunity_id = o.id
   AND h2.changed_at <= h.changed_at
  GROUP BY o.id, o.segment, h.to_stage
)
SELECT
  segment,
  reached_stage,
  AVG(days_to_reach)::NUMERIC(8,2)                               AS avg_days,
  PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY days_to_reach)   AS median_days,
  PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY days_to_reach)   AS p25_days,
  COUNT(*)                                                        AS sample_size
FROM stage_entry
GROUP BY 1, 2
WITH NO DATA;

CREATE UNIQUE INDEX idx_mv_cycle_stats ON mv_overall_cycle_stats (segment, reached_stage);

-- ── mv_discovery_meeting_ops ──────────────────────────────────
-- SDR-level discovery meeting metrics.

CREATE MATERIALIZED VIEW mv_discovery_meeting_ops AS
SELECT
  o.sdr_id,
  u.name                                          AS sdr_name,
  u.segment                                       AS sdr_segment,
  COUNT(*)                                        AS total_scheduled,
  COUNT(*) FILTER (WHERE o.discovery_meeting_status = 'Held')                  AS held,
  COUNT(*) FILTER (WHERE o.discovery_meeting_status = 'No Show')               AS hard_no_show,
  COUNT(*) FILTER (WHERE o.discovery_meeting_status = 'No Show - Rescheduling') AS recoverable_no_show,
  COUNT(*) FILTER (WHERE o.discovery_meeting_status IN ('Rescheduling', 'No Show - Rescheduling')) AS reschedules,
  COUNT(*) FILTER (WHERE o.discovery_meeting_status = 'Disqualified')          AS disqualified,
  COUNT(*) FILTER (WHERE o.discovery_meeting_status = 'Held')
    / NULLIF(COUNT(*), 0)::NUMERIC                AS held_rate,
  COUNT(*) FILTER (WHERE o.discovery_meeting_status = 'No Show')
    / NULLIF(COUNT(*), 0)::NUMERIC                AS hard_no_show_rate,
  COUNT(*) FILTER (WHERE o.discovery_meeting_status IN ('Rescheduling', 'No Show - Rescheduling'))
    / NULLIF(COUNT(*), 0)::NUMERIC                AS reschedule_rate,
  COUNT(*) FILTER (WHERE o.discovery_meeting_status = 'Disqualified')
    / NULLIF(COUNT(*), 0)::NUMERIC                AS disqualification_rate,
  AVG(o.discovery_meeting_reschedule_count)
    FILTER (WHERE o.discovery_meeting_status = 'Held')::NUMERIC(5,2)
                                                  AS avg_reschedules_per_held
FROM sls_opportunities o
JOIN sls_users u ON u.id = o.sdr_id
WHERE o.sdr_id IS NOT NULL
  AND o.discovery_meeting_date < CURRENT_DATE   -- past meetings only
GROUP BY 1, 2, 3
WITH NO DATA;

CREATE UNIQUE INDEX idx_mv_discovery_ops ON mv_discovery_meeting_ops (sdr_id);
