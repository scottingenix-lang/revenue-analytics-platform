-- ============================================================
-- 001_marketing_domain.sql
-- Tables: mkt_companies, mkt_contacts, mkt_campaigns,
--         mkt_campaign_members, mkt_touches,
--         mkt_form_submissions, mkt_web_sessions
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Enums ────────────────────────────────────────────────────

CREATE TYPE vertical_tag_enum AS ENUM (
  'Financial Services',
  'Healthcare',
  'Energy & Utilities',
  'Federal/Public Sector',
  'Technology',
  'Manufacturing',
  'Other'
);

CREATE TYPE company_size_enum AS ENUM ('SMB', 'Mid-Market', 'Enterprise');

CREATE TYPE revenue_band_enum AS ENUM (
  '<$100M', '$100M–$500M', '$500M–$1B', '$1B–$5B', '$5B+'
);

CREATE TYPE lifecycle_stage_enum AS ENUM (
  'Subscriber', 'Lead', 'MQL', 'SQL', 'Opportunity', 'Customer', 'Evangelist'
);

CREATE TYPE lead_source_enum AS ENUM (
  'ZoomInfo', 'Website', 'Webinar', 'Trade Show', 'Field Event',
  'PPC', 'Social Ad', 'Partner', 'ABM', 'Sales Generated'
);

CREATE TYPE seniority_enum AS ENUM (
  'IC', 'Manager', 'Director', 'VP', 'C-Level'
);

CREATE TYPE contact_function_enum AS ENUM (
  'Compliance', 'IT Security', 'Internal Audit', 'Risk Management',
  'Legal', 'IT Ops', 'Privacy', 'Procurement'
);

CREATE TYPE hs_persona_enum AS ENUM (
  'GRC Leader', 'Security Practitioner', 'Auditor',
  'Risk Officer', 'IT Buyer', 'Legal/Privacy Counsel'
);

CREATE TYPE lead_status_enum AS ENUM (
  'New', 'Open', 'Working', 'Nurturing', 'Connected', 'Unqualified', 'Bad Timing'
);

CREATE TYPE campaign_type_enum AS ENUM (
  'Webinar', 'eBook', 'Trade Show', 'Field Event',
  'PPC', 'Social', 'Email', 'ABM', 'Partner'
);

CREATE TYPE touch_type_enum AS ENUM (
  'Email Click',
  'Webinar Registration',
  'Webinar Attendance',
  'Form: Demo Request',
  'Form: Contact Us',
  'Form: Content Download',
  'Trade Show: Booked Meeting',
  'Trade Show: Badge Scan',
  'Field Event Attendance',
  'Pricing Page View',
  'ROI Calculator Use',
  'Demo Video View (>50%)',
  'Partner Referral Submitted',
  'Sales-Generated Touch',
  'ABM Account Visit',
  'PPC Click',
  'Social Ad Click',
  'Website Direct Visit (key page)',
  'ZoomInfo Add'
);

CREATE TYPE pre_post_deal_enum AS ENUM ('pre', 'post', 'no_deal');

-- ── mkt_companies ─────────────────────────────────────────────

CREATE TABLE mkt_companies (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT NOT NULL,
  domain                  TEXT,
  industry                TEXT,
  vertical_tag            vertical_tag_enum NOT NULL,
  employee_count          INT NOT NULL,
  company_size            company_size_enum,           -- Derived by trigger from employee_count
  annual_revenue          NUMERIC(15,2),
  revenue_band            revenue_band_enum,
  country                 TEXT NOT NULL DEFAULT 'US',
  state                   TEXT,
  city                    TEXT,
  lifecycle_stage         lifecycle_stage_enum NOT NULL DEFAULT 'Lead',
  hubspot_owner_id        UUID,                        -- FK to sls_users added in 002
  is_customer             BOOLEAN NOT NULL DEFAULT false,
  num_associated_contacts INT NOT NULL DEFAULT 0,
  num_associated_deals    INT NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── mkt_contacts ─────────────────────────────────────────────

CREATE TABLE mkt_contacts (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                    TEXT,                        -- 3% malformed intentionally
  first_name               TEXT NOT NULL,
  last_name                TEXT NOT NULL,
  company_id               UUID NOT NULL REFERENCES mkt_companies(id),
  job_title                TEXT,                        -- 8% null intentionally
  seniority                seniority_enum,
  function                 contact_function_enum,
  lifecycle_stage          lifecycle_stage_enum NOT NULL DEFAULT 'Lead',
  hs_persona               hs_persona_enum,
  -- Lead source four-field model
  original_lead_source     lead_source_enum,            -- WRITE-ONCE (trigger enforced)
  original_lead_source_detail TEXT,                     -- WRITE-ONCE (trigger enforced)
  lead_source              lead_source_enum,            -- Overwritten on each engagement
  lead_source_detail       TEXT,                        -- Overwritten on each engagement
  lead_status              lead_status_enum NOT NULL DEFAULT 'New',
  lead_score               INT NOT NULL DEFAULT 0 CHECK (lead_score BETWEEN 0 AND 100),
  ai_fit_score             INT CHECK (ai_fit_score BETWEEN 0 AND 100),
  ai_intent_score          INT CHECK (ai_intent_score BETWEEN 0 AND 100),
  ai_score_rationale       TEXT,
  created_date             TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_date       TIMESTAMPTZ,
  num_form_submissions     INT NOT NULL DEFAULT 0,
  num_page_views           INT NOT NULL DEFAULT 0,
  num_email_clicks         INT NOT NULL DEFAULT 0,
  attended_webinar         BOOLEAN NOT NULL DEFAULT false,
  demo_requested           BOOLEAN NOT NULL DEFAULT false,
  downloaded_content       BOOLEAN NOT NULL DEFAULT false,
  gdpr_consent             BOOLEAN NOT NULL DEFAULT true,
  owner_id                 UUID,                        -- FK to sls_users added in 002
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── mkt_campaigns ─────────────────────────────────────────────

CREATE TABLE mkt_campaigns (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  type        campaign_type_enum NOT NULL,
  channel     lead_source_enum,
  program     TEXT,
  start_date  DATE,
  end_date    DATE,
  cost        NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── mkt_campaign_members ──────────────────────────────────────

CREATE TABLE mkt_campaign_members (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id           UUID NOT NULL REFERENCES mkt_campaigns(id),
  contact_id            UUID NOT NULL REFERENCES mkt_contacts(id),
  added_at              TIMESTAMPTZ NOT NULL,
  last_engagement_at    TIMESTAMPTZ,
  touch_count           INT NOT NULL DEFAULT 0,
  total_engagement_score INT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, contact_id)
);

-- ── mkt_touches ───────────────────────────────────────────────

CREATE TABLE mkt_touches (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id       UUID NOT NULL REFERENCES mkt_contacts(id),
  campaign_id      UUID REFERENCES mkt_campaigns(id),   -- nullable for non-campaign touches
  touch_type       touch_type_enum NOT NULL,
  engagement_score INT NOT NULL CHECK (engagement_score > 0),  -- 0-score touches not inserted
  pre_or_post_deal pre_post_deal_enum NOT NULL DEFAULT 'no_deal',
  touch_date       TIMESTAMPTZ NOT NULL,
  touch_value      NUMERIC(10,2),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── mkt_form_submissions ──────────────────────────────────────

CREATE TABLE mkt_form_submissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id  UUID NOT NULL REFERENCES mkt_contacts(id),
  campaign_id UUID REFERENCES mkt_campaigns(id),
  form_type   TEXT NOT NULL,   -- e.g. 'Demo Request', 'Content Download', 'Contact Us'
  submitted_at TIMESTAMPTZ NOT NULL,
  page_url    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── mkt_web_sessions ─────────────────────────────────────────

CREATE TABLE mkt_web_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      UUID REFERENCES mkt_contacts(id),  -- nullable (anonymous sessions)
  session_start   TIMESTAMPTZ NOT NULL,
  session_end     TIMESTAMPTZ,
  pages_viewed    INT NOT NULL DEFAULT 1,
  source_medium   TEXT,   -- e.g. 'organic/google', 'cpc/google', 'email/hubspot'
  landing_page    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
