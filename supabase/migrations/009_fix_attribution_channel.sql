-- ============================================================
-- 009_fix_attribution_channel.sql
-- Fix mv_attribution_first_touch and mv_attribution_last_touch to
-- derive attributed_source from the touch's campaign channel rather
-- than the contact's fixed lead_source field.  This allows first-touch
-- and last-touch to produce different source distributions.
-- ============================================================

DROP MATERIALIZED VIEW IF EXISTS mv_attribution_first_touch CASCADE;
DROP MATERIALIZED VIEW IF EXISTS mv_attribution_last_touch CASCADE;

-- ── mv_attribution_first_touch ────────────────────────────────
-- attributed_source = campaign.channel of the earliest pre-deal touch,
-- falling back to contact.lead_source when no campaign is linked.

CREATE MATERIALIZED VIEW mv_attribution_first_touch AS
SELECT
  o.id                                                      AS opportunity_id,
  o.arr,
  o.stage,
  o.vertical,
  o.segment,
  t.contact_id,
  t.campaign_id,
  t.touch_type,
  COALESCE(camp.channel, ls_src.lead_source)                AS attributed_source,
  t.touch_date
FROM sls_opportunities o
JOIN LATERAL (
  SELECT mt.contact_id, mt.campaign_id, mt.touch_type, mt.touch_date
  FROM mkt_touches mt
  WHERE mt.contact_id IN (
    SELECT contact_id FROM sls_opportunity_contacts WHERE opportunity_id = o.id
  )
    AND mt.touch_date < o.created_date::TIMESTAMPTZ
    AND mt.pre_or_post_deal = 'pre'
  ORDER BY mt.touch_date ASC
  LIMIT 1
) t ON true
LEFT JOIN mkt_campaigns camp   ON camp.id    = t.campaign_id
JOIN      mkt_contacts  ls_src ON ls_src.id  = t.contact_id
WITH NO DATA;

CREATE UNIQUE INDEX idx_mv_attr_first ON mv_attribution_first_touch (opportunity_id);

-- ── mv_attribution_last_touch ─────────────────────────────────
-- attributed_source = campaign.channel of the latest pre-deal touch,
-- falling back to contact.lead_source when no campaign is linked.

CREATE MATERIALIZED VIEW mv_attribution_last_touch AS
SELECT
  o.id                                                      AS opportunity_id,
  o.arr,
  o.stage,
  o.vertical,
  o.segment,
  t.contact_id,
  t.campaign_id,
  t.touch_type,
  COALESCE(camp.channel, ls_src.lead_source)                AS attributed_source,
  t.touch_date
FROM sls_opportunities o
JOIN LATERAL (
  SELECT mt.contact_id, mt.campaign_id, mt.touch_type, mt.touch_date
  FROM mkt_touches mt
  WHERE mt.contact_id IN (
    SELECT contact_id FROM sls_opportunity_contacts WHERE opportunity_id = o.id
  )
    AND mt.touch_date < o.created_date::TIMESTAMPTZ
    AND mt.pre_or_post_deal = 'pre'
  ORDER BY mt.touch_date DESC
  LIMIT 1
) t ON true
LEFT JOIN mkt_campaigns camp   ON camp.id    = t.campaign_id
JOIN      mkt_contacts  ls_src ON ls_src.id  = t.contact_id
WITH NO DATA;

CREATE UNIQUE INDEX idx_mv_attr_last ON mv_attribution_last_touch (opportunity_id);
