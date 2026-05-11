-- ============================================================
-- 015_v21_materialized_views.sql
-- v2.1 materialized views (4 new):
--   mv_attainment_by_period      Daily refresh
--   mv_pipeline_lag_forecast     Daily refresh
--   mv_rep_attainment            Daily refresh
--   mv_source_conversion_rates   Monthly refresh
--
-- All created WITH NO DATA; refresh after seed via:
--   REFRESH MATERIALIZED VIEW CONCURRENTLY <view>;
-- CONCURRENT refresh requires the UNIQUE index defined below each view.
--
-- Refresh dependency order (mv_pipeline_lag_forecast reads
-- mv_overall_cycle_stats, so refresh 008 views first):
--   1. mv_overall_cycle_stats
--   2. mv_source_conversion_rates
--   3. mv_attainment_by_period
--   4. mv_pipeline_lag_forecast
--   5. mv_rep_attainment
-- ============================================================


-- ── mv_attainment_by_period ───────────────────────────────────
-- Per (period_year, period_quarter, segment, vertical):
-- goal vs actual closed-won ARR and deal count.
-- NULL segment/vertical in fin_revenue_goals means "all" — the
-- join predicate handles this with IS NULL OR equality checks.

CREATE MATERIALIZED VIEW mv_attainment_by_period AS
SELECT
  frg.id                                                      AS goal_id,
  frg.period_year,
  frg.period_quarter,
  frg.segment,
  frg.vertical,
  frg.new_business_arr_goal,
  frg.expansion_arr_goal,
  frg.new_business_arr_goal + frg.expansion_arr_goal          AS total_arr_goal,
  frg.new_business_deal_count_goal,
  frg.expansion_deal_count_goal,
  -- Actuals: closed-won deals in the matching period/segment/vertical
  COALESCE(SUM(o.arr) FILTER (WHERE o.pipeline = 'New Business'), 0)
                                                              AS actual_new_business_arr,
  COALESCE(SUM(o.arr) FILTER (WHERE o.pipeline != 'New Business'), 0)
                                                              AS actual_expansion_arr,
  COALESCE(SUM(o.arr), 0)                                    AS actual_total_arr,
  COUNT(o.id) FILTER (WHERE o.pipeline = 'New Business')     AS actual_new_business_wins,
  COUNT(o.id) FILTER (WHERE o.pipeline != 'New Business')    AS actual_expansion_wins,
  COUNT(o.id)                                                AS actual_total_wins,
  -- Attainment %
  COALESCE(SUM(o.arr), 0)
    / NULLIF(frg.new_business_arr_goal + frg.expansion_arr_goal, 0)
                                                              AS pct_attainment
  -- source_breakdown (JSON by lead_source) omitted here; computed on-demand
  -- in the Phase 3 dashboard query to avoid nested-aggregate restriction.
FROM fin_revenue_goals frg
LEFT JOIN sls_opportunities o
  ON o.stage = '6'
  AND EXTRACT(YEAR    FROM o.close_date::TIMESTAMPTZ)::INT = frg.period_year
  AND (
    frg.period_quarter IS NULL
    OR EXTRACT(QUARTER FROM o.close_date::TIMESTAMPTZ)::INT = frg.period_quarter
  )
  AND (frg.segment  IS NULL OR o.segment  = frg.segment)
  AND (frg.vertical IS NULL OR o.vertical = frg.vertical)
GROUP BY frg.id, frg.period_year, frg.period_quarter, frg.segment, frg.vertical,
  frg.new_business_arr_goal, frg.expansion_arr_goal,
  frg.new_business_deal_count_goal, frg.expansion_deal_count_goal
WITH NO DATA;

-- UNIQUE index: goal_id is UUID PK of fin_revenue_goals, guaranteed unique.
CREATE UNIQUE INDEX idx_mv_attainment_goal ON mv_attainment_by_period (goal_id);

-- Supporting index for period-first dashboard queries.
CREATE INDEX idx_mv_attainment_period ON mv_attainment_by_period
  (period_year, period_quarter NULLS LAST, segment NULLS FIRST);


-- ── mv_pipeline_lag_forecast ──────────────────────────────────
-- For each of the next 4 close quarters × each segment:
--   projected_wins  = open pipeline created N quarters ago × win_rate
--   N (lag_quarters) = COALESCE(
--       fin_revenue_goals.pipeline_lag_quarters_override (segment-matched),
--       ROUND(mv_overall_cycle_stats.median_days / 90)   (segment median),
--       2                                                  (global fallback)
--     )
-- Reads mv_overall_cycle_stats (from 008); refresh that view first.

CREATE MATERIALIZED VIEW mv_pipeline_lag_forecast AS
WITH lag_by_segment AS (
  -- Effective lag per segment: override → mv_overall_cycle_stats → fallback 2
  SELECT
    cs.segment,
    cs.median_days::NUMERIC                              AS median_cycle_days,
    ROUND(cs.median_days / 90.0)::INT                   AS cycle_derived_lag,
    COALESCE(
      (
        SELECT frg.pipeline_lag_quarters_override
        FROM fin_revenue_goals frg
        WHERE frg.segment = cs.segment
          AND frg.pipeline_lag_quarters_override IS NOT NULL
        ORDER BY frg.period_year DESC, frg.period_quarter DESC NULLS LAST
        LIMIT 1
      ),
      ROUND(cs.median_days / 90.0)::INT,
      2
    )                                                    AS lag_quarters
  FROM mv_overall_cycle_stats cs
  WHERE cs.reached_stage = '6'
),
future_close_quarters AS (
  SELECT
    (DATE_TRUNC('quarter', CURRENT_DATE)
      + n * INTERVAL '3 months')::DATE                  AS close_quarter
  FROM generate_series(1, 4) n
),
historical_win_rates AS (
  SELECT
    o.segment,
    COUNT(*) FILTER (WHERE o.stage = '6') * 1.0
      / NULLIF(COUNT(*) FILTER (WHERE o.stage IN ('6','Closed Lost')), 0)
                                                         AS win_rate
  FROM sls_opportunities o
  WHERE o.close_date >= CURRENT_DATE - INTERVAL '365 days'
  GROUP BY o.segment
),
source_pipeline AS (
  SELECT
    fq.close_quarter,
    lbs.segment,
    lbs.lag_quarters,
    lbs.median_cycle_days,
    lbs.cycle_derived_lag,
    (DATE_TRUNC('quarter', fq.close_quarter::TIMESTAMPTZ)
      - lbs.lag_quarters * INTERVAL '3 months')::DATE   AS source_created_quarter,
    COALESCE(SUM(o.arr), 0)                             AS source_pipeline_arr,
    COUNT(o.id)                                         AS source_deal_count
  FROM future_close_quarters fq
  CROSS JOIN lag_by_segment lbs
  LEFT JOIN sls_opportunities o
    ON o.segment = lbs.segment
    AND o.stage NOT IN ('6', 'Closed Lost')
    AND DATE_TRUNC('quarter', o.created_date::TIMESTAMPTZ)::DATE =
        (DATE_TRUNC('quarter', fq.close_quarter::TIMESTAMPTZ)
          - lbs.lag_quarters * INTERVAL '3 months')::DATE
  GROUP BY fq.close_quarter, lbs.segment, lbs.lag_quarters,
    lbs.median_cycle_days, lbs.cycle_derived_lag
)
SELECT
  sp.close_quarter,
  sp.segment,
  sp.lag_quarters,
  sp.median_cycle_days,
  sp.cycle_derived_lag,
  sp.source_created_quarter,
  sp.source_pipeline_arr,
  sp.source_deal_count,
  COALESCE(wr.win_rate, 0.22)                           AS assumed_win_rate,
  sp.source_pipeline_arr * COALESCE(wr.win_rate, 0.22) AS projected_arr,
  ROUND(sp.source_deal_count * COALESCE(wr.win_rate, 0.22))
                                                        AS projected_wins
FROM source_pipeline sp
LEFT JOIN historical_win_rates wr ON wr.segment = sp.segment
WITH NO DATA;

CREATE UNIQUE INDEX idx_mv_pipeline_lag ON mv_pipeline_lag_forecast
  (close_quarter, segment);


-- ── mv_rep_attainment ─────────────────────────────────────────
-- Per (rep × quarter): quota, closed ARR, deal count, pct_attainment,
-- plus a forward-looking pipeline_2_qtrs_out metric.
-- Only covers reps with a sls_quotas row (AEs).

CREATE MATERIALIZED VIEW mv_rep_attainment AS
SELECT
  q.user_id,
  u.name                                                         AS rep_name,
  u.role                                                         AS rep_role,
  u.segment                                                      AS rep_segment,
  q.period_year,
  q.period_quarter,
  q.quota_amount,
  q.ramp_status,
  q.ramp_pct,
  q.quota_amount * q.ramp_pct / 100.0                           AS effective_quota,
  -- Closed-won ARR in this rep's quota period
  COALESCE(
    SUM(o.arr) FILTER (WHERE
      o.stage = '6'
      AND EXTRACT(YEAR    FROM o.close_date::TIMESTAMPTZ)::INT = q.period_year
      AND EXTRACT(QUARTER FROM o.close_date::TIMESTAMPTZ)::INT = q.period_quarter
    ), 0
  )                                                              AS arr_closed,
  -- Deal count in this rep's quota period
  COUNT(o.id) FILTER (WHERE
    o.stage = '6'
    AND EXTRACT(YEAR    FROM o.close_date::TIMESTAMPTZ)::INT = q.period_year
    AND EXTRACT(QUARTER FROM o.close_date::TIMESTAMPTZ)::INT = q.period_quarter
  )                                                              AS deal_count_closed,
  -- Attainment % vs effective quota
  COALESCE(
    SUM(o.arr) FILTER (WHERE
      o.stage = '6'
      AND EXTRACT(YEAR    FROM o.close_date::TIMESTAMPTZ)::INT = q.period_year
      AND EXTRACT(QUARTER FROM o.close_date::TIMESTAMPTZ)::INT = q.period_quarter
    ), 0
  ) / NULLIF(q.quota_amount * q.ramp_pct / 100.0, 0)           AS pct_attainment,
  -- Open pipeline closing in the next 2 quarters (forward indicator)
  COALESCE(
    SUM(o.arr) FILTER (WHERE
      o.stage NOT IN ('6', 'Closed Lost')
      AND o.close_date >= DATE_TRUNC('quarter', CURRENT_DATE)::DATE
      AND o.close_date < (DATE_TRUNC('quarter', CURRENT_DATE)
                          + INTERVAL '6 months')::DATE
    ), 0
  )                                                              AS pipeline_2_qtrs_out
FROM sls_quotas q
JOIN sls_users u ON u.id = q.user_id
LEFT JOIN sls_opportunities o ON o.owner_id = q.user_id
GROUP BY q.user_id, u.name, u.role, u.segment,
  q.period_year, q.period_quarter,
  q.quota_amount, q.ramp_status, q.ramp_pct
WITH NO DATA;

CREATE UNIQUE INDEX idx_mv_rep_attainment ON mv_rep_attainment
  (user_id, period_year, period_quarter);

CREATE INDEX idx_mv_rep_attainment_period ON mv_rep_attainment
  (period_year, period_quarter, pct_attainment DESC NULLS LAST);


-- ── mv_source_conversion_rates ────────────────────────────────
-- Per (lead_source × cohort_month): lead→MQL and MQL→SQL conversion
-- rates, current month and trailing-12-month rolling averages.
-- Drives the forecasted_mqls / forecasted_sqls calculations in
-- mkt_campaign_forecast and the Phase 3 Channel ROI dashboard.
--
-- Approximation: uses mkt_contacts.lifecycle_stage as a proxy for
-- conversion status (current stage, not stage-at-time). This is
-- appropriate for the synthetic dataset where lifecycle stages are
-- set to reflect each contact's highest achieved stage.

CREATE MATERIALIZED VIEW mv_source_conversion_rates AS
-- Pure subquery form — avoids CTE + WITH NO DATA parse issues and
-- the reserved keyword TRAILING.  Self-join for rolling 12-month sums.
SELECT
  c.lead_source,
  c.cohort_month,
  c.leads,
  c.mqls,
  c.sqls,
  c.mqls::NUMERIC / NULLIF(c.leads, 0)                        AS lead_to_mql_pct,
  c.sqls::NUMERIC / NULLIF(c.mqls, 0)                         AS mql_to_sql_pct,
  r.rolling_leads                                             AS trailing_12mo_leads,
  r.rolling_mqls                                              AS trailing_12mo_mqls,
  r.rolling_sqls                                              AS trailing_12mo_sqls,
  r.rolling_mqls::NUMERIC
    / NULLIF(r.rolling_leads, 0)                              AS trailing_12mo_lead_to_mql_pct,
  r.rolling_sqls::NUMERIC
    / NULLIF(r.rolling_mqls, 0)                               AS trailing_12mo_mql_to_sql_pct
FROM (
  SELECT
    original_lead_source                                       AS lead_source,
    DATE_TRUNC('month', created_date)::DATE                   AS cohort_month,
    COUNT(*)                                                   AS leads,
    COUNT(*) FILTER (WHERE lifecycle_stage IN (
      'MQL', 'SQL', 'Opportunity', 'Customer', 'Evangelist'
    ))                                                         AS mqls,
    COUNT(*) FILTER (WHERE lifecycle_stage IN (
      'SQL', 'Opportunity', 'Customer', 'Evangelist'
    ))                                                         AS sqls
  FROM mkt_contacts
  WHERE original_lead_source IS NOT NULL
  GROUP BY 1, 2
) c
JOIN (
  SELECT
    base.lead_source,
    base.cohort_month,
    SUM(hist.leads) AS rolling_leads,
    SUM(hist.mqls)  AS rolling_mqls,
    SUM(hist.sqls)  AS rolling_sqls
  FROM (
    SELECT
      original_lead_source                                     AS lead_source,
      DATE_TRUNC('month', created_date)::DATE                 AS cohort_month,
      COUNT(*)                                                 AS leads,
      COUNT(*) FILTER (WHERE lifecycle_stage IN (
        'MQL', 'SQL', 'Opportunity', 'Customer', 'Evangelist'
      ))                                                       AS mqls,
      COUNT(*) FILTER (WHERE lifecycle_stage IN (
        'SQL', 'Opportunity', 'Customer', 'Evangelist'
      ))                                                       AS sqls
    FROM mkt_contacts
    WHERE original_lead_source IS NOT NULL
    GROUP BY 1, 2
  ) base
  JOIN (
    SELECT
      original_lead_source                                     AS lead_source,
      DATE_TRUNC('month', created_date)::DATE                 AS cohort_month,
      COUNT(*)                                                 AS leads,
      COUNT(*) FILTER (WHERE lifecycle_stage IN (
        'MQL', 'SQL', 'Opportunity', 'Customer', 'Evangelist'
      ))                                                       AS mqls,
      COUNT(*) FILTER (WHERE lifecycle_stage IN (
        'SQL', 'Opportunity', 'Customer', 'Evangelist'
      ))                                                       AS sqls
    FROM mkt_contacts
    WHERE original_lead_source IS NOT NULL
    GROUP BY 1, 2
  ) hist
    ON  hist.lead_source  = base.lead_source
    AND hist.cohort_month >= (base.cohort_month - INTERVAL '11 months')::DATE
    AND hist.cohort_month <= base.cohort_month
  GROUP BY base.lead_source, base.cohort_month
) r
  ON  r.lead_source  = c.lead_source
  AND r.cohort_month = c.cohort_month
WITH NO DATA;

CREATE UNIQUE INDEX idx_mv_source_conv ON mv_source_conversion_rates
  (lead_source, cohort_month);

CREATE INDEX idx_mv_source_conv_source ON mv_source_conversion_rates
  (lead_source, cohort_month DESC);
