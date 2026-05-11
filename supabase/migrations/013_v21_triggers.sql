-- ============================================================
-- 013_v21_triggers.sql
-- v2.1 trigger: immutability enforcement on mkt_campaign_forecast.
-- The forecasted_* planning fields are locked at INSERT time.
-- Only actual_* fields and variance_pct may be updated afterward.
-- ============================================================

CREATE OR REPLACE FUNCTION trg_fn_campaign_forecast_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (
    OLD.forecasted_at       IS DISTINCT FROM NEW.forecasted_at       OR
    OLD.forecasted_leads    IS DISTINCT FROM NEW.forecasted_leads    OR
    OLD.forecasted_mqls     IS DISTINCT FROM NEW.forecasted_mqls     OR
    OLD.forecasted_sqls     IS DISTINCT FROM NEW.forecasted_sqls     OR
    OLD.forecasted_pipeline IS DISTINCT FROM NEW.forecasted_pipeline
  ) THEN
    RAISE EXCEPTION
      'mkt_campaign_forecast: forecasted_at and forecasted_* fields are '
      'immutable after insert. Only actual_* fields and variance_pct may '
      'be updated. Attempted change on campaign_id=%, period=%Q%.',
      OLD.campaign_id, OLD.period_year, OLD.period_quarter;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_mkt_campaign_forecast_immutable
  BEFORE UPDATE ON mkt_campaign_forecast
  FOR EACH ROW EXECUTE FUNCTION trg_fn_campaign_forecast_immutable();
