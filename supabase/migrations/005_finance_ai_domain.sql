-- ============================================================
-- 005_finance_ai_domain.sql
-- Tables: fin_spend_monthly, fin_margin,
--         ai_agent_runs, ai_alerts, ai_lead_scores, ai_deal_risks
-- ============================================================

-- ── Enums ────────────────────────────────────────────────────

CREATE TYPE spend_category_enum AS ENUM (
  'Paid Search', 'Social Ads', 'Events', 'Content', 'ABM',
  'Partner', 'Field Marketing', 'Sales Headcount', 'SDR Headcount',
  'Tools & Technology', 'Other'
);

CREATE TYPE ai_agent_name_enum AS ENUM (
  'narrative_summary',
  'anomaly_detection',
  'deal_risk',
  'lead_scoring',
  'data_copilot',
  'forecast_assistant'
);

CREATE TYPE ai_run_status_enum AS ENUM ('success', 'error', 'paused_budget');

CREATE TYPE alert_severity_enum AS ENUM ('Info', 'Warning', 'Critical');

-- ── fin_spend_monthly ─────────────────────────────────────────

CREATE TABLE fin_spend_monthly (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_month  DATE NOT NULL,              -- first day of the month
  category      spend_category_enum NOT NULL,
  channel       lead_source_enum,          -- maps spend to a lead source where possible
  amount        NUMERIC(12,2) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fiscal_month, category)
);

-- ── fin_margin ────────────────────────────────────────────────

CREATE TABLE fin_margin (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_month  DATE NOT NULL UNIQUE,
  gross_margin_pct NUMERIC(5,4) NOT NULL,  -- e.g. 0.72 = 72%
  cogs          NUMERIC(12,2) NOT NULL,
  revenue       NUMERIC(12,2) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── ai_agent_runs ─────────────────────────────────────────────
-- Log of every AI agent execution.

CREATE TABLE ai_agent_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name    ai_agent_name_enum NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  status        ai_run_status_enum NOT NULL DEFAULT 'success',
  input_tokens  INT,
  output_tokens INT,
  cost_usd      NUMERIC(8,6),
  latency_ms    INT,
  records_processed INT,
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── ai_alerts ─────────────────────────────────────────────────

CREATE TABLE ai_alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id  UUID REFERENCES ai_agent_runs(id),
  severity      alert_severity_enum NOT NULL DEFAULT 'Info',
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  metric_name   TEXT,
  metric_value  NUMERIC,
  baseline_value NUMERIC,
  z_score       NUMERIC(6,3),
  acknowledged  BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── ai_lead_scores ────────────────────────────────────────────
-- Historical record of lead scoring runs (current values on mkt_contacts).

CREATE TABLE ai_lead_scores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      UUID NOT NULL REFERENCES mkt_contacts(id),
  agent_run_id    UUID REFERENCES ai_agent_runs(id),
  fit_score       INT CHECK (fit_score BETWEEN 0 AND 100),
  intent_score    INT CHECK (intent_score BETWEEN 0 AND 100),
  rationale       TEXT,
  scored_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── ai_deal_risks ─────────────────────────────────────────────
-- Historical record of deal risk assessments (current values on sls_opportunities).

CREATE TABLE ai_deal_risks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id  UUID NOT NULL REFERENCES sls_opportunities(id),
  agent_run_id    UUID REFERENCES ai_agent_runs(id),
  risk_band       risk_band_enum NOT NULL,
  risk_score      INT CHECK (risk_score BETWEEN 0 AND 100),
  next_action     TEXT,
  close_probability INT CHECK (close_probability BETWEEN 0 AND 100),
  assessed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
