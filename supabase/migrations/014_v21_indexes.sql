-- ============================================================
-- 014_v21_indexes.sql
-- Indexes for the 5 new v2.1 tables.
-- UNIQUE indexes on the 4 new materialized views are created in
-- 015_v21_materialized_views.sql alongside the view definitions.
-- ============================================================

-- ── mkt_campaign_forecast ─────────────────────────────────────
-- UNIQUE already enforced by table constraint (campaign_id, year, quarter).
-- Additional index for period-range queries.
CREATE INDEX idx_campaign_forecast_period
  ON mkt_campaign_forecast (period_year, period_quarter);

-- ── sls_quotas ────────────────────────────────────────────────
-- PK is already (user_id, period_year, period_quarter).
-- Reverse index for period-first queries (e.g., all reps in Q1 2026).
CREATE INDEX idx_sls_quotas_period
  ON sls_quotas (period_year, period_quarter, user_id);

-- ── fin_revenue_goals ─────────────────────────────────────────
-- NULL values in segment/vertical mean "all" — standard UNIQUE won't work
-- with NULLs, so we use a regular index for query performance.
CREATE INDEX idx_fin_revenue_goals_period
  ON fin_revenue_goals (period_year, period_quarter NULLS LAST);

CREATE INDEX idx_fin_revenue_goals_segment
  ON fin_revenue_goals (segment NULLS FIRST, vertical NULLS FIRST);

-- ── fin_pipeline_source_goals ─────────────────────────────────
-- PK is already (period_year, period_quarter, source_category).
-- No additional indexes needed.

-- ── ai_panel_summaries ────────────────────────────────────────
-- PK is already panel_id (text).
-- Index for dashboard-level queries.
CREATE INDEX idx_ai_panel_summaries_dashboard
  ON ai_panel_summaries (dashboard_id, generated_at DESC);

CREATE INDEX idx_ai_panel_summaries_status
  ON ai_panel_summaries (status, generated_at DESC);
