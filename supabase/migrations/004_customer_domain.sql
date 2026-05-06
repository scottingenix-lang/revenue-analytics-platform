-- ============================================================
-- 004_customer_domain.sql
-- Tables: cs_health_scores, cs_tickets, prod_usage_daily
-- ============================================================

-- ── Enums ────────────────────────────────────────────────────

CREATE TYPE health_tier_enum AS ENUM ('Green', 'Yellow', 'Red');

CREATE TYPE ticket_status_enum AS ENUM (
  'Open', 'Pending', 'On Hold', 'Solved', 'Closed'
);

CREATE TYPE ticket_priority_enum AS ENUM ('Low', 'Normal', 'High', 'Urgent');

-- ── cs_health_scores ──────────────────────────────────────────
-- Daily snapshot — one row per company per day.

CREATE TABLE cs_health_scores (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              UUID NOT NULL REFERENCES mkt_companies(id),
  snapshot_date           DATE NOT NULL,
  overall_score           INT NOT NULL CHECK (overall_score BETWEEN 0 AND 100),
  health_tier             health_tier_enum NOT NULL,
  -- Component scores (0–100)
  usage_score             INT CHECK (usage_score BETWEEN 0 AND 100),
  support_load_score      INT CHECK (support_load_score BETWEEN 0 AND 100),
  exec_sponsor_score      INT CHECK (exec_sponsor_score BETWEEN 0 AND 100),
  renewal_proximity_score INT CHECK (renewal_proximity_score BETWEEN 0 AND 100),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, snapshot_date)
);

-- ── cs_tickets ────────────────────────────────────────────────

CREATE TABLE cs_tickets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES mkt_companies(id),
  contact_id     UUID REFERENCES mkt_contacts(id),
  subject        TEXT NOT NULL,
  status         ticket_status_enum NOT NULL DEFAULT 'Open',
  priority       ticket_priority_enum NOT NULL DEFAULT 'Normal',
  created_date   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_date  TIMESTAMPTZ,
  csat_score     INT CHECK (csat_score BETWEEN 1 AND 5),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── prod_usage_daily ──────────────────────────────────────────
-- Daily product usage snapshot per company.

CREATE TABLE prod_usage_daily (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES mkt_companies(id),
  snapshot_date      DATE NOT NULL,
  active_users       INT NOT NULL DEFAULT 0,
  sessions           INT NOT NULL DEFAULT 0,
  features_used      INT NOT NULL DEFAULT 0,  -- count of distinct features touched
  api_calls          INT NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, snapshot_date)
);
