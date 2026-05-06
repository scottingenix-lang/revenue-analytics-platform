-- ============================================================
-- 002_sales_domain.sql
-- Tables: sls_users, sls_opportunities, sls_opportunity_contacts,
--         sls_opportunity_history, sls_activities
-- ============================================================

-- ── Enums ────────────────────────────────────────────────────

CREATE TYPE sls_user_role_enum AS ENUM (
  'SDR', 'AE', 'Account Manager', 'Sales Manager', 'VP Sales'
);

CREATE TYPE pipeline_enum AS ENUM (
  'New Business', 'Expansion', 'Renewal'
);

CREATE TYPE deal_stage_enum AS ENUM (
  '0', '1', '2', '3', '4', '5', '6', 'Closed Lost'
);

CREATE TYPE discovery_status_enum AS ENUM (
  'Scheduled',
  'Rescheduling',
  'No Show - Rescheduling',
  'No Show',
  'Disqualified',
  'Held'
);

CREATE TYPE forecast_category_enum AS ENUM (
  'Pipeline', 'Best Case', 'Commit', 'Closed'
);

CREATE TYPE lost_reason_enum AS ENUM (
  'Lost to Competitor',
  'No Decision',
  'Price',
  'Timing/Budget',
  'Lack of Fit',
  'Internal Build',
  'Discovery Meeting No Show',
  'Disqualified Pre-Discovery',
  'Other'
);

CREATE TYPE product_line_enum AS ENUM (
  'GRC Suite',
  'IT Risk Management',
  'Vendor Risk Management',
  'Audit Management',
  'Policy Management',
  'Compliance Management',
  'Business Continuity',
  'ESG/Sustainability'
);

CREATE TYPE competitor_enum AS ENUM (
  'ServiceNow GRC', 'Archer', 'AuditBoard', 'LogicGate',
  'MetricStream', 'OneTrust', 'Diligent', 'Workiva',
  'Hyperproof', 'Internal Build'
);

CREATE TYPE deal_type_enum AS ENUM (
  'New Business',
  'Expansion (Cross-sell)',
  'Expansion (Upsell)',
  'Renewal',
  'Renewal-Uplift'
);

CREATE TYPE buying_role_enum AS ENUM (
  'Champion (Primary)',
  'Economic Buyer',
  'Decision Maker',
  'Influencer',
  'Evaluator',
  'End User',
  'Blocker'
);

CREATE TYPE risk_band_enum AS ENUM ('Low', 'Medium', 'High');

-- ── sls_users ─────────────────────────────────────────────────

CREATE TABLE sls_users (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name      TEXT NOT NULL,
  email     TEXT NOT NULL UNIQUE,
  role      sls_user_role_enum NOT NULL,
  segment   company_size_enum,
  quota     NUMERIC(12,2),
  hire_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Back-fill FK on mkt_companies and mkt_contacts now that sls_users exists
ALTER TABLE mkt_companies
  ADD CONSTRAINT fk_mkt_companies_hubspot_owner
  FOREIGN KEY (hubspot_owner_id) REFERENCES sls_users(id);

ALTER TABLE mkt_contacts
  ADD CONSTRAINT fk_mkt_contacts_owner
  FOREIGN KEY (owner_id) REFERENCES sls_users(id);

-- ── sls_opportunities ─────────────────────────────────────────

CREATE TABLE sls_opportunities (
  id                               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                             TEXT NOT NULL,
  company_id                       UUID NOT NULL REFERENCES mkt_companies(id),
  primary_contact_id               UUID REFERENCES mkt_contacts(id),
  owner_id                         UUID NOT NULL REFERENCES sls_users(id),    -- AE
  sdr_id                           UUID REFERENCES sls_users(id),             -- SDR, never overwritten
  pipeline                         pipeline_enum NOT NULL DEFAULT 'New Business',
  stage                            deal_stage_enum NOT NULL DEFAULT '0',
  amount                           NUMERIC(12,2),       -- TCV
  arr                              NUMERIC(12,2),       -- Annualized
  term_months                      INT NOT NULL DEFAULT 12,
  close_date                       DATE,
  created_date                     DATE NOT NULL DEFAULT CURRENT_DATE,
  -- Discovery meeting fields
  discovery_meeting_status         discovery_status_enum,
  discovery_meeting_date           DATE,
  discovery_meeting_held_date      DATE,
  discovery_meeting_reschedule_count INT NOT NULL DEFAULT 0,
  -- Lead source (stamp-once at INSERT via trigger)
  lead_source                      lead_source_enum,
  lead_source_detail               TEXT,
  -- Inherited fields (set at INSERT via trigger)
  segment                          company_size_enum,
  vertical                         vertical_tag_enum,
  inherited_at                     TIMESTAMPTZ,
  -- Deal metadata
  deal_type                        deal_type_enum,
  product_line                     product_line_enum,
  probability                      INT CHECK (probability BETWEEN 0 AND 100),
  forecast_category                forecast_category_enum NOT NULL DEFAULT 'Pipeline',
  next_step                        TEXT,
  lost_reason                      lost_reason_enum,
  competitor                       competitor_enum,
  -- Derived counts (updated by triggers/periodic refresh)
  stakeholder_count                INT NOT NULL DEFAULT 0,
  has_economic_buyer_engaged       BOOLEAN NOT NULL DEFAULT false,
  activity_count_last_30           INT NOT NULL DEFAULT 0,
  -- Computed age fields (updated by trigger on stage change / seed)
  deal_age_days                    INT,
  last_stage_change_date           DATE,
  current_stage_age_days           INT,                 -- Updated by trigger on stage change
  -- AI fields (written by Phase 4 agents, NULL after seed)
  ai_risk_band                     risk_band_enum,
  ai_risk_score                    INT CHECK (ai_risk_score BETWEEN 0 AND 100),
  ai_next_action                   TEXT,
  ai_close_probability             INT CHECK (ai_close_probability BETWEEN 0 AND 100),
  created_at                       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── sls_opportunity_contacts ──────────────────────────────────

CREATE TABLE sls_opportunity_contacts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID NOT NULL REFERENCES sls_opportunities(id),
  contact_id     UUID NOT NULL REFERENCES mkt_contacts(id),
  buying_role    buying_role_enum NOT NULL,
  is_primary     BOOLEAN NOT NULL DEFAULT false,
  added_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Exactly one Champion per deal (partial unique index — enforced in 007_indexes.sql)

-- ── sls_opportunity_history ───────────────────────────────────

CREATE TABLE sls_opportunity_history (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id   UUID NOT NULL REFERENCES sls_opportunities(id),
  from_stage       deal_stage_enum,
  to_stage         deal_stage_enum NOT NULL,
  changed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  days_in_prior_stage INT,
  changed_by       UUID REFERENCES sls_users(id)
);

-- ── sls_activities ────────────────────────────────────────────

CREATE TABLE sls_activities (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id UUID REFERENCES sls_opportunities(id),
  contact_id     UUID REFERENCES mkt_contacts(id),
  type           TEXT NOT NULL,    -- 'Call', 'Email', 'Meeting', 'Note'
  occurred_at    TIMESTAMPTZ NOT NULL,
  owner_id       UUID REFERENCES sls_users(id),
  subject        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
