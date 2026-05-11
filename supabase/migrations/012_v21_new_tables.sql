-- ============================================================
-- 012_v21_new_tables.sql
-- v2.1 additions: 3 new enums + 5 new tables
--   mkt_campaign_forecast, sls_quotas, fin_revenue_goals,
--   fin_pipeline_source_goals, ai_panel_summaries
-- Migrations 001–011 are preserved as-is.
-- ============================================================

-- ── New Enums ─────────────────────────────────────────────────

CREATE TYPE ramp_status_enum AS ENUM (
  'Ramped', 'Ramping', 'New'
);

CREATE TYPE source_category_enum AS ENUM (
  'Sales Generated', 'Demand Gen', 'Channel'
);

CREATE TYPE panel_status_enum AS ENUM (
  'Fresh', 'Stale', 'Failed'
);

-- ── mkt_campaign_forecast ─────────────────────────────────────
-- Per-campaign bottom-up pipeline plan, locked at creation time.
-- forecasted_* fields are immutable after INSERT (enforced by trigger in 013).
-- actual_* fields are updated as the quarter progresses.

CREATE TABLE mkt_campaign_forecast (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         UUID NOT NULL REFERENCES mkt_campaigns(id),
  period_year         INT  NOT NULL,
  period_quarter      INT  NOT NULL CHECK (period_quarter BETWEEN 1 AND 4),
  -- Plan inputs (immutable after insert)
  forecasted_leads    INT,
  forecasted_mqls     INT,           -- computed = leads × source.lead_to_mql_rate
  forecasted_sqls     INT,           -- computed = mqls × source.mql_to_sql_rate
  forecasted_pipeline NUMERIC(14,2), -- computed = sqls × assumed_avg_deal_size
  forecasted_at       TIMESTAMPTZ NOT NULL DEFAULT now(),  -- locked at plan creation
  -- Actuals (mutable)
  actual_leads        INT,
  actual_mqls         INT,
  actual_sqls         INT,
  actual_pipeline     NUMERIC(14,2),
  variance_pct        NUMERIC(8,4),  -- computed: (actual - forecasted) / forecasted
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, period_year, period_quarter)
);

-- ── sls_quotas ────────────────────────────────────────────────
-- Per-rep, per-quarter quota tracking.
-- ramp_pct allows partial credit for ramping / new reps.

CREATE TABLE sls_quotas (
  user_id          UUID NOT NULL REFERENCES sls_users(id),
  period_year      INT  NOT NULL,
  period_quarter   INT  NOT NULL CHECK (period_quarter BETWEEN 1 AND 4),
  quota_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  ramp_status      ramp_status_enum NOT NULL DEFAULT 'Ramped',
  ramp_pct         NUMERIC(5,2)  NOT NULL DEFAULT 100
                   CHECK (ramp_pct BETWEEN 0 AND 100),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, period_year, period_quarter)
);

-- ── fin_revenue_goals ─────────────────────────────────────────
-- Annual and quarterly ARR targets, optionally scoped by segment
-- and vertical (NULL = applies to all).
-- pipeline_lag_quarters_override overrides the dynamic lag derived
-- from mv_overall_cycle_stats in mv_pipeline_lag_forecast.

CREATE TABLE fin_revenue_goals (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_year                     INT NOT NULL,
  period_quarter                  INT CHECK (period_quarter BETWEEN 1 AND 4),  -- NULL = annual
  segment                         company_size_enum,   -- NULL = all segments
  vertical                        vertical_tag_enum,   -- NULL = all verticals
  new_business_arr_goal           NUMERIC(14,2) NOT NULL DEFAULT 0,
  expansion_arr_goal              NUMERIC(14,2) NOT NULL DEFAULT 0,
  new_business_deal_count_goal    INT NOT NULL DEFAULT 0,
  expansion_deal_count_goal       INT NOT NULL DEFAULT 0,
  assumed_win_rate                NUMERIC(6,4),        -- e.g. 0.22; defaults from historical
  assumed_sql_to_qo_rate          NUMERIC(6,4),
  assumed_qo_to_won_rate          NUMERIC(6,4),
  assumed_avg_deal_size           NUMERIC(14,2),
  pipeline_lag_quarters_override  INT,                 -- NULL = derive from median cycle
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── fin_pipeline_source_goals ─────────────────────────────────
-- Quarterly source-mix targets: what % of pipeline should come
-- from Sales Generated vs Demand Gen vs Channel.

CREATE TABLE fin_pipeline_source_goals (
  period_year             INT NOT NULL,
  period_quarter          INT NOT NULL CHECK (period_quarter BETWEEN 1 AND 4),
  source_category         source_category_enum NOT NULL,
  pipeline_amount_goal    NUMERIC(14,2) NOT NULL DEFAULT 0,
  pipeline_pct_of_total   NUMERIC(5,4)  NOT NULL DEFAULT 0
                          CHECK (pipeline_pct_of_total BETWEEN 0 AND 1),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (period_year, period_quarter, source_category)
);

-- ── ai_panel_summaries ────────────────────────────────────────
-- Caches the latest per-band AI-generated summary for each
-- dashboard panel.  Written by the Narrative Summary agent (Phase 4).
-- panel_id is a stable slug, e.g. "rev_attainment.band_2_will_we_hit".

CREATE TABLE ai_panel_summaries (
  panel_id                TEXT PRIMARY KEY,
  dashboard_id            TEXT NOT NULL,
  generated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  interpretation_text     TEXT,
  prescriptive_actions    TEXT[],
  input_metrics_snapshot  JSONB,
  model_used              TEXT,
  cost_usd                NUMERIC(8,6),
  status                  panel_status_enum NOT NULL DEFAULT 'Fresh',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
