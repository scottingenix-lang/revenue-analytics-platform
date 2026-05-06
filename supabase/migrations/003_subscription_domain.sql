-- ============================================================
-- 003_subscription_domain.sql
-- Tables: sub_subscriptions, sub_arr_movements
-- ============================================================

-- ── Enums ────────────────────────────────────────────────────

CREATE TYPE subscription_status_enum AS ENUM (
  'active', 'churned', 'expired', 'pending'
);

CREATE TYPE arr_movement_type_enum AS ENUM (
  'New', 'Expansion', 'Reactivation', 'Contraction', 'Churn'
);

-- ── sub_subscriptions ─────────────────────────────────────────

CREATE TABLE sub_subscriptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES mkt_companies(id),
  opportunity_id  UUID REFERENCES sls_opportunities(id),
  product_line    product_line_enum NOT NULL,
  status          subscription_status_enum NOT NULL DEFAULT 'active',
  arr             NUMERIC(12,2) NOT NULL,
  mrr             NUMERIC(12,2) GENERATED ALWAYS AS (arr / 12) STORED,
  tcv             NUMERIC(12,2),
  term_months     INT NOT NULL DEFAULT 12,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  renewal_date    DATE,
  contracted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  churned_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── sub_arr_movements ─────────────────────────────────────────
-- Immutable event ledger — one row per ARR change event.

CREATE TABLE sub_arr_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES mkt_companies(id),
  subscription_id UUID NOT NULL REFERENCES sub_subscriptions(id),
  movement_type   arr_movement_type_enum NOT NULL,
  arr_delta       NUMERIC(12,2) NOT NULL,   -- positive = growth, negative = contraction/churn
  arr_before      NUMERIC(12,2) NOT NULL,
  arr_after       NUMERIC(12,2) NOT NULL,
  effective_date  DATE NOT NULL,
  fiscal_quarter  TEXT,                     -- e.g. 'Q1-2025'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
