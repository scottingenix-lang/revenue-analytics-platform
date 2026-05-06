-- ============================================================
-- 006_triggers_constraints.sql
-- All triggers and constraints per the brief:
--   1. mkt_companies.company_size derived from employee_count
--   2. mkt_contacts.original_lead_source write-once enforcement
--   3. sls_opportunities: inherited fields + lead source stamp-once at INSERT
--   4. sls_opportunities: stage change → sls_opportunity_history + current_stage_age_days
--   5. updated_at auto-refresh on all tables
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. mkt_companies — derive company_size from employee_count
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_derive_company_size()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.employee_count >= 5000 THEN
    NEW.company_size := 'Enterprise';
  ELSIF NEW.employee_count >= 500 THEN
    NEW.company_size := 'Mid-Market';
  ELSE
    NEW.company_size := 'SMB';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_derive_company_size
  BEFORE INSERT OR UPDATE OF employee_count ON mkt_companies
  FOR EACH ROW EXECUTE FUNCTION fn_derive_company_size();

-- ─────────────────────────────────────────────────────────────
-- 2. mkt_contacts — write-once enforcement on original_lead_source fields
--    Uses COALESCE(OLD.original_*, NEW.original_*) so once set, never overwritten.
--    On INSERT: copy lead_source → original_lead_source if not supplied.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_contact_lead_source_write_once()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- On insert: stamp original_* from lead_source if not explicitly provided
    NEW.original_lead_source        := COALESCE(NEW.original_lead_source, NEW.lead_source);
    NEW.original_lead_source_detail := COALESCE(NEW.original_lead_source_detail, NEW.lead_source_detail);
  ELSIF TG_OP = 'UPDATE' THEN
    -- On update: protect original_* — once non-null, never overwrite
    NEW.original_lead_source        := COALESCE(OLD.original_lead_source, NEW.original_lead_source);
    NEW.original_lead_source_detail := COALESCE(OLD.original_lead_source_detail, NEW.original_lead_source_detail);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_contact_lead_source_write_once
  BEFORE INSERT OR UPDATE ON mkt_contacts
  FOR EACH ROW EXECUTE FUNCTION fn_contact_lead_source_write_once();

-- ─────────────────────────────────────────────────────────────
-- 3. sls_opportunities — BEFORE INSERT trigger
--    a) Inherit segment + vertical from mkt_companies
--    b) Stamp lead_source + lead_source_detail from Champion contact
--    c) Block lead_source / lead_source_detail updates after INSERT
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_opportunity_before_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_company mkt_companies%ROWTYPE;
  v_contact mkt_contacts%ROWTYPE;
BEGIN
  -- a) Inherit segment and vertical from company
  SELECT * INTO v_company FROM mkt_companies WHERE id = NEW.company_id;
  NEW.segment      := v_company.company_size;
  NEW.vertical     := v_company.vertical_tag;
  NEW.inherited_at := now();

  -- b) Stamp lead_source from Champion contact (primary_contact_id must be set at insert time)
  IF NEW.primary_contact_id IS NOT NULL THEN
    SELECT * INTO v_contact FROM mkt_contacts WHERE id = NEW.primary_contact_id;
    NEW.lead_source        := v_contact.lead_source;
    NEW.lead_source_detail := v_contact.lead_source_detail;
  END IF;

  -- c) Initialize stage tracking and computed age fields
  NEW.last_stage_change_date  := CURRENT_DATE;
  NEW.current_stage_age_days  := 0;
  NEW.deal_age_days           := 0;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_opportunity_before_insert
  BEFORE INSERT ON sls_opportunities
  FOR EACH ROW EXECUTE FUNCTION fn_opportunity_before_insert();

-- Block lead_source / lead_source_detail updates on opportunities
-- unless an explicit unlock flag is set via session variable.
CREATE OR REPLACE FUNCTION fn_opportunity_protect_lead_source()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Allow unlock via: SET LOCAL app.unlock_deal_lead_source = 'true';
  IF current_setting('app.unlock_deal_lead_source', true) = 'true' THEN
    RETURN NEW;
  END IF;

  IF (NEW.lead_source IS DISTINCT FROM OLD.lead_source) OR
     (NEW.lead_source_detail IS DISTINCT FROM OLD.lead_source_detail) THEN
    RAISE EXCEPTION
      'sls_opportunities.lead_source and lead_source_detail are stamp-once. '
      'Set app.unlock_deal_lead_source=true to override.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_opportunity_protect_lead_source
  BEFORE UPDATE OF lead_source, lead_source_detail ON sls_opportunities
  FOR EACH ROW EXECUTE FUNCTION fn_opportunity_protect_lead_source();

-- ─────────────────────────────────────────────────────────────
-- 4. sls_opportunities — stage change → history + current_stage_age_days
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_opportunity_stage_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_days_in_prior INT;
BEGIN
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    -- Calculate days spent in prior stage
    v_days_in_prior := COALESCE(
      EXTRACT(DAY FROM now() - OLD.last_stage_change_date::TIMESTAMPTZ)::INT,
      0
    );

    -- Insert history row
    INSERT INTO sls_opportunity_history (
      opportunity_id, from_stage, to_stage,
      changed_at, days_in_prior_stage, changed_by
    ) VALUES (
      NEW.id, OLD.stage, NEW.stage,
      now(), v_days_in_prior, NEW.owner_id
    );

    -- Reset stage age tracking
    NEW.last_stage_change_date := CURRENT_DATE;
    NEW.current_stage_age_days := 0;
  ELSE
    -- Update age fields on any update
    NEW.current_stage_age_days := COALESCE(
      EXTRACT(DAY FROM now() - NEW.last_stage_change_date::TIMESTAMPTZ)::INT,
      0
    );
    NEW.deal_age_days := COALESCE(
      EXTRACT(DAY FROM now() - NEW.created_date::TIMESTAMPTZ)::INT,
      0
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_opportunity_stage_change
  BEFORE UPDATE OF stage ON sls_opportunities
  FOR EACH ROW EXECUTE FUNCTION fn_opportunity_stage_change();

-- ─────────────────────────────────────────────────────────────
-- 5. Champion cardinality enforcement via trigger
--    (Partial unique index in 007_indexes.sql also enforces this,
--     but the trigger provides a clear error message.)
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_enforce_single_champion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_primary = true THEN
    -- Check no other primary exists for this opportunity (excluding current row on UPDATE)
    IF EXISTS (
      SELECT 1 FROM sls_opportunity_contacts
      WHERE opportunity_id = NEW.opportunity_id
        AND is_primary = true
        AND id IS DISTINCT FROM NEW.id
        AND removed_at IS NULL
    ) THEN
      RAISE EXCEPTION
        'Opportunity % already has a Champion (is_primary=true). '
        'Remove the existing Champion before assigning a new one.', NEW.opportunity_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_single_champion
  BEFORE INSERT OR UPDATE OF is_primary ON sls_opportunity_contacts
  FOR EACH ROW EXECUTE FUNCTION fn_enforce_single_champion();

-- ─────────────────────────────────────────────────────────────
-- 6. updated_at auto-refresh for all tables that need it
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_mkt_companies_updated_at
  BEFORE UPDATE ON mkt_companies
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_mkt_contacts_updated_at
  BEFORE UPDATE ON mkt_contacts
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_mkt_campaigns_updated_at
  BEFORE UPDATE ON mkt_campaigns
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_mkt_campaign_members_updated_at
  BEFORE UPDATE ON mkt_campaign_members
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_sls_users_updated_at
  BEFORE UPDATE ON sls_users
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_sls_opportunities_updated_at
  BEFORE UPDATE ON sls_opportunities
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_sls_opportunity_contacts_updated_at
  BEFORE UPDATE ON sls_opportunity_contacts
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_sub_subscriptions_updated_at
  BEFORE UPDATE ON sub_subscriptions
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_cs_tickets_updated_at
  BEFORE UPDATE ON cs_tickets
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
