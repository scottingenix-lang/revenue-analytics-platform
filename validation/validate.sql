-- ============================================================
-- validate.sql — Distribution checks against Section 9 targets
-- Run after seed completes and materialized views are refreshed.
-- ============================================================

-- ── 1. Customer base ──────────────────────────────────────────
-- Target: ~320 active customers
SELECT 'customer_count' AS check_name,
       count(*) AS actual,
       320 AS target
FROM mkt_companies WHERE is_customer = true;

-- ── 2. Total active ARR ───────────────────────────────────────
-- Target: ~$32M
SELECT 'total_arr' AS check_name,
       round(sum(arr) / 1e6, 2) AS actual_millions,
       32 AS target_millions
FROM sub_subscriptions WHERE status = 'active';

-- ── 3. Vertical mix ───────────────────────────────────────────
-- Target: FinServ 32%, Healthcare 21%, Energy 14%, Federal 12%,
--         Tech 10%, Manufacturing 6%, Other 5%
SELECT
  vertical_tag,
  count(*) AS company_count,
  round(count(*) * 100.0 / sum(count(*)) OVER (), 1) AS actual_pct,
  CASE vertical_tag
    WHEN 'Financial Services'    THEN 32.0
    WHEN 'Healthcare'            THEN 21.0
    WHEN 'Energy & Utilities'    THEN 14.0
    WHEN 'Federal/Public Sector' THEN 12.0
    WHEN 'Technology'            THEN 10.0
    WHEN 'Manufacturing'         THEN  6.0
    WHEN 'Other'                 THEN  5.0
  END AS target_pct,
  round(abs(count(*) * 100.0 / sum(count(*)) OVER () -
    CASE vertical_tag
      WHEN 'Financial Services'    THEN 32.0
      WHEN 'Healthcare'            THEN 21.0
      WHEN 'Energy & Utilities'    THEN 14.0
      WHEN 'Federal/Public Sector' THEN 12.0
      WHEN 'Technology'            THEN 10.0
      WHEN 'Manufacturing'         THEN  6.0
      WHEN 'Other'                 THEN  5.0
    END), 1) AS delta_pct,
  CASE WHEN abs(count(*) * 100.0 / sum(count(*)) OVER () -
    CASE vertical_tag
      WHEN 'Financial Services'    THEN 32.0
      WHEN 'Healthcare'            THEN 21.0
      WHEN 'Energy & Utilities'    THEN 14.0
      WHEN 'Federal/Public Sector' THEN 12.0
      WHEN 'Technology'            THEN 10.0
      WHEN 'Manufacturing'         THEN  6.0
      WHEN 'Other'                 THEN  5.0
    END) <= 5 THEN 'PASS' ELSE 'FAIL' END AS result
FROM mkt_companies
GROUP BY vertical_tag
ORDER BY company_count DESC;

-- ── 4. Segment mix (by customer count) ───────────────────────
-- Target: SMB 10%, Mid-Market 65%, Enterprise 25%
SELECT
  company_size,
  count(*) AS count,
  round(count(*) * 100.0 / sum(count(*)) OVER (), 1) AS actual_pct,
  CASE company_size
    WHEN 'SMB'         THEN 10.0
    WHEN 'Mid-Market'  THEN 65.0
    WHEN 'Enterprise'  THEN 25.0
  END AS target_pct,
  CASE WHEN abs(count(*) * 100.0 / sum(count(*)) OVER () -
    CASE company_size
      WHEN 'SMB'         THEN 10.0
      WHEN 'Mid-Market'  THEN 65.0
      WHEN 'Enterprise'  THEN 25.0
    END) <= 5 THEN 'PASS' ELSE 'FAIL' END AS result
FROM mkt_companies
WHERE is_customer = true
GROUP BY company_size;

-- ── 5. Original lead source mix ───────────────────────────────
-- Target: Website 22%, ZoomInfo 18%, Webinar 15%, Trade Show 10%,
--         PPC 9%, Field Event 8%, Partner 7%, Social Ad 5%, ABM 4%, Sales Generated 2%
SELECT
  original_lead_source,
  count(*) AS contact_count,
  round(count(*) * 100.0 / sum(count(*)) OVER (), 1) AS actual_pct,
  CASE original_lead_source
    WHEN 'Website'         THEN 22.0
    WHEN 'ZoomInfo'        THEN 18.0
    WHEN 'Webinar'         THEN 15.0
    WHEN 'Trade Show'      THEN 10.0
    WHEN 'PPC'             THEN  9.0
    WHEN 'Field Event'     THEN  8.0
    WHEN 'Partner'         THEN  7.0
    WHEN 'Social Ad'       THEN  5.0
    WHEN 'ABM'             THEN  4.0
    WHEN 'Sales Generated' THEN  2.0
  END AS target_pct,
  CASE WHEN abs(count(*) * 100.0 / sum(count(*)) OVER () -
    CASE original_lead_source
      WHEN 'Website'         THEN 22.0
      WHEN 'ZoomInfo'        THEN 18.0
      WHEN 'Webinar'         THEN 15.0
      WHEN 'Trade Show'      THEN 10.0
      WHEN 'PPC'             THEN  9.0
      WHEN 'Field Event'     THEN  8.0
      WHEN 'Partner'         THEN  7.0
      WHEN 'Social Ad'       THEN  5.0
      WHEN 'ABM'             THEN  4.0
      WHEN 'Sales Generated' THEN  2.0
    END) <= 5 THEN 'PASS' ELSE 'FAIL' END AS result
FROM mkt_contacts
WHERE original_lead_source IS NOT NULL
GROUP BY original_lead_source
ORDER BY contact_count DESC;

-- ── 6. Discovery meeting status mix ──────────────────────────
-- Target: Held 65%, No Show 12%, No Show-Rescheduling 8%,
--         Disqualified 5%, Rescheduling 6%, Scheduled 4%
SELECT
  discovery_meeting_status,
  count(*) AS count,
  round(count(*) * 100.0 / sum(count(*)) OVER (), 1) AS actual_pct,
  CASE discovery_meeting_status
    WHEN 'Held'                   THEN 65.0
    WHEN 'No Show'                THEN 12.0
    WHEN 'No Show - Rescheduling' THEN  8.0
    WHEN 'Rescheduling'           THEN  6.0
    WHEN 'Disqualified'           THEN  5.0
    WHEN 'Scheduled'              THEN  4.0
  END AS target_pct
FROM sls_opportunities
WHERE discovery_meeting_date < CURRENT_DATE
GROUP BY discovery_meeting_status
ORDER BY count DESC;

-- ── 7. Win rate (trailing 12 months) ─────────────────────────
-- Target: ~22% overall
SELECT
  'win_rate_overall' AS check_name,
  count(*) FILTER (WHERE stage = '6') AS won,
  count(*) FILTER (WHERE stage = 'Closed Lost') AS lost,
  round(
    count(*) FILTER (WHERE stage = '6') * 100.0 /
    NULLIF(count(*) FILTER (WHERE stage IN ('6', 'Closed Lost')), 0),
    1
  ) AS actual_pct,
  22.0 AS target_pct,
  CASE WHEN abs(
    count(*) FILTER (WHERE stage = '6') * 100.0 /
    NULLIF(count(*) FILTER (WHERE stage IN ('6', 'Closed Lost')), 0) - 22.0
  ) <= 5 THEN 'PASS' ELSE 'FAIL' END AS result
FROM sls_opportunities
WHERE close_date >= CURRENT_DATE - INTERVAL '12 months';

-- ── 8. Champion exists for every open active deal ─────────────
-- Target: 0 deals without a champion
SELECT
  'champion_cardinality' AS check_name,
  count(*) AS deals_missing_champion,
  CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM sls_opportunities o
WHERE stage NOT IN ('Closed Lost')
  AND NOT EXISTS (
    SELECT 1 FROM sls_opportunity_contacts oc
    WHERE oc.opportunity_id = o.id
      AND oc.is_primary = true
      AND oc.removed_at IS NULL
  );

-- ── 9. Inherited fields integrity ─────────────────────────────
-- Target: 0 deals where segment or vertical diverges from company
SELECT
  'inherited_fields_integrity' AS check_name,
  count(*) AS violations,
  CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM sls_opportunities o
JOIN mkt_companies c ON c.id = o.company_id
WHERE o.segment != c.company_size
   OR o.vertical != c.vertical_tag;

-- ── 10. Write-once enforcement: no original_lead_source overwrites ──
-- Verify original_* fields are set and stable (spot check: count NULLs)
SELECT
  'original_lead_source_populated' AS check_name,
  count(*) FILTER (WHERE original_lead_source IS NULL) AS null_count,
  count(*) AS total,
  CASE WHEN count(*) FILTER (WHERE original_lead_source IS NULL) = 0
    THEN 'PASS' ELSE 'WARN' END AS result
FROM mkt_contacts;

-- ── 11. Data quality: malformed emails ~3% ────────────────────
SELECT
  'malformed_email_pct' AS check_name,
  round(
    count(*) FILTER (WHERE email !~ '^[^@]+@[^@]+\.[^@]+$') * 100.0 / count(*),
    1
  ) AS actual_pct,
  3.0 AS target_pct,
  CASE WHEN abs(
    count(*) FILTER (WHERE email !~ '^[^@]+@[^@]+\.[^@]+$') * 100.0 / count(*) - 3.0
  ) <= 2 THEN 'PASS' ELSE 'FAIL' END AS result
FROM mkt_contacts;

-- ── 12. Data quality: missing job titles ~8% ─────────────────
SELECT
  'missing_job_title_pct' AS check_name,
  round(
    count(*) FILTER (WHERE job_title IS NULL) * 100.0 / count(*),
    1
  ) AS actual_pct,
  8.0 AS target_pct,
  CASE WHEN abs(
    count(*) FILTER (WHERE job_title IS NULL) * 100.0 / count(*) - 8.0
  ) <= 3 THEN 'PASS' ELSE 'FAIL' END AS result
FROM mkt_contacts;

-- ── 13. Lead source mismatch ~1% ──────────────────────────────
-- Deals where stamped lead_source ≠ champion's current lead_source
SELECT
  'lead_source_mismatch_pct' AS check_name,
  count(*) AS mismatch_count,
  round(count(*) * 100.0 / (SELECT count(*) FROM sls_opportunities), 2) AS actual_pct,
  1.0 AS target_pct
FROM sls_opportunities o
JOIN sls_opportunity_contacts oc
  ON oc.opportunity_id = o.id AND oc.is_primary = true AND oc.removed_at IS NULL
JOIN mkt_contacts c ON c.id = oc.contact_id
WHERE o.lead_source IS DISTINCT FROM c.lead_source;

-- ── 14. Influence weight view ─────────────────────────────────
-- Target: 10 rows, Website + Webinar near top
SELECT
  'influence_weight_view' AS check_name,
  count(*) AS row_count,
  CASE WHEN count(*) = 10 THEN 'PASS' ELSE 'FAIL' END AS result
FROM mv_lead_source_influence_weights;

SELECT lead_source, round(influence_weight::NUMERIC, 4) AS influence_weight
FROM mv_lead_source_influence_weights
ORDER BY influence_weight DESC;

-- ── 15. Open opportunity count ────────────────────────────────
SELECT
  'open_opps' AS check_name,
  count(*) AS actual,
  80 AS target
FROM sls_opportunities
WHERE stage NOT IN ('6', 'Closed Lost');

-- ── 16. Stage history completeness ───────────────────────────
-- Every closed-won deal should have at least 1 history row
SELECT
  'won_deals_have_history' AS check_name,
  count(*) AS won_deals_missing_history,
  CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result
FROM sls_opportunities o
WHERE o.stage = '6'
  AND NOT EXISTS (
    SELECT 1 FROM sls_opportunity_history h WHERE h.opportunity_id = o.id
  );

-- ── 17. Subscription ARR total ────────────────────────────────
SELECT
  'subscription_arr_total' AS check_name,
  round(sum(arr) / 1e6, 1) AS actual_arr_millions,
  32 AS target_arr_millions
FROM sub_subscriptions
WHERE status = 'active';
