-- ============================================================
-- 007_indexes.sql
-- All performance indexes per the brief, plus the partial unique
-- index enforcing one Champion per deal.
-- ============================================================

-- ── Champion cardinality (partial unique index) ───────────────
-- Exactly one is_primary=true row per opportunity_id among active contacts.
CREATE UNIQUE INDEX idx_one_champion_per_deal
  ON sls_opportunity_contacts (opportunity_id)
  WHERE is_primary = true AND removed_at IS NULL;

-- ── sls_opportunity_history ───────────────────────────────────
CREATE INDEX idx_opp_history_opp_changed
  ON sls_opportunity_history (opportunity_id, changed_at);

-- ── mkt_campaign_members ──────────────────────────────────────
CREATE INDEX idx_campaign_members_contact_campaign
  ON mkt_campaign_members (contact_id, campaign_id);

-- ── mkt_touches ───────────────────────────────────────────────
CREATE INDEX idx_touches_contact_date
  ON mkt_touches (contact_id, touch_date DESC);

CREATE INDEX idx_touches_campaign_date
  ON mkt_touches (campaign_id, touch_date DESC);

-- ── sls_opportunities ─────────────────────────────────────────
CREATE INDEX idx_opps_close_date
  ON sls_opportunities (close_date);

CREATE INDEX idx_opps_stage_owner
  ON sls_opportunities (stage, owner_id);

CREATE INDEX idx_opps_sdr_discovery_date
  ON sls_opportunities (sdr_id, discovery_meeting_date);

-- ── sls_opportunity_contacts ──────────────────────────────────
CREATE INDEX idx_opp_contacts_opp_primary
  ON sls_opportunity_contacts (opportunity_id, is_primary);

-- ── Additional supporting indexes ─────────────────────────────

-- Company lookups
CREATE INDEX idx_companies_vertical
  ON mkt_companies (vertical_tag);

CREATE INDEX idx_companies_size
  ON mkt_companies (company_size);

CREATE INDEX idx_companies_is_customer
  ON mkt_companies (is_customer);

-- Contact lookups
CREATE INDEX idx_contacts_company
  ON mkt_contacts (company_id);

CREATE INDEX idx_contacts_lifecycle
  ON mkt_contacts (lifecycle_stage);

CREATE INDEX idx_contacts_lead_source
  ON mkt_contacts (lead_source);

CREATE INDEX idx_contacts_original_lead_source
  ON mkt_contacts (original_lead_source);

-- Subscription lookups
CREATE INDEX idx_subscriptions_company
  ON sub_subscriptions (company_id);

CREATE INDEX idx_subscriptions_status
  ON sub_subscriptions (status);

-- ARR movement lookups
CREATE INDEX idx_arr_movements_company_date
  ON sub_arr_movements (company_id, effective_date);

CREATE INDEX idx_arr_movements_type_date
  ON sub_arr_movements (movement_type, effective_date);

-- Health scores
CREATE INDEX idx_health_scores_company_date
  ON cs_health_scores (company_id, snapshot_date DESC);

-- Product usage
CREATE INDEX idx_prod_usage_company_date
  ON prod_usage_daily (company_id, snapshot_date DESC);

-- AI agent runs
CREATE INDEX idx_ai_runs_agent_started
  ON ai_agent_runs (agent_name, started_at DESC);

-- Touches — source-based attribution lookups
CREATE INDEX idx_touches_pre_post_deal
  ON mkt_touches (pre_or_post_deal, touch_date DESC);

-- Opportunities — pipeline & forecast
CREATE INDEX idx_opps_forecast_category
  ON sls_opportunities (forecast_category, close_date);

CREATE INDEX idx_opps_company
  ON sls_opportunities (company_id);

CREATE INDEX idx_opps_created_date
  ON sls_opportunities (created_date);
