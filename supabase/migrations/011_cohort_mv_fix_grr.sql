-- ============================================================
-- 011_cohort_mv_fix_grr.sql
-- Fix mv_cohort_retention_monthly: use churned_at for point-in-time
-- retention instead of current s.status (which is always 'active'
-- with 90% 36-month terms, causing GRR = 100% on every row).
-- ============================================================

DROP MATERIALIZED VIEW IF EXISTS mv_cohort_retention_monthly CASCADE;

CREATE MATERIALIZED VIEW mv_cohort_retention_monthly AS
SELECT
  DATE_TRUNC('month', s.start_date::TIMESTAMPTZ)::DATE AS cohort_month,
  c.company_size,
  c.vertical_tag::TEXT                                  AS vertical,
  m.fiscal_month,
  COUNT(DISTINCT s.company_id)                          AS companies_at_start,
  SUM(s.arr)                                            AS arr_at_start,
  COUNT(DISTINCT s.company_id) FILTER (
    WHERE s.churned_at IS NULL OR s.churned_at > m.fiscal_month
  )                                                     AS companies_retained,
  SUM(s.arr) FILTER (
    WHERE s.churned_at IS NULL OR s.churned_at > m.fiscal_month
  )                                                     AS arr_retained,
  SUM(s.arr) FILTER (
    WHERE s.churned_at IS NULL OR s.churned_at > m.fiscal_month
  )
    / NULLIF(SUM(s.arr), 0)                             AS grr
FROM sub_subscriptions s
JOIN mkt_companies c ON c.id = s.company_id
JOIN (SELECT DISTINCT DATE_TRUNC('month', effective_date::TIMESTAMPTZ)::DATE AS fiscal_month
      FROM sub_arr_movements) m
  ON m.fiscal_month >= DATE_TRUNC('month', s.start_date::TIMESTAMPTZ)
GROUP BY 1, 2, 3, 4
WITH NO DATA;

CREATE UNIQUE INDEX idx_mv_cohort_ret ON mv_cohort_retention_monthly
  (cohort_month, company_size, vertical, fiscal_month);
