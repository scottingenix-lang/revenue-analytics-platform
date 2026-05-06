# Phase 1 Build Brief — Data Foundation

**For:** Claude Code agent executing Phase 1 of the Revenue Analytics Platform build
**Project owner:** Scott Logan
**Master spec:** `Revenue_Analytics_Platform_Scoping_Doc.md` (in this same folder)
**Phase budget:** ~4 working days at evening/weekend pace

---

## Your role

You are taking over **Phase 1 — Data Foundation** of a portfolio-quality prototype that demonstrates an AI-augmented revenue analytics platform tailored to Onspring (a B2B GRC SaaS at www.onspring.com). Phase 1 is the entire data layer: Supabase project, schema, triggers, indexes, materialized views, synthetic data generator, seed, validation. **No frontend, no AI agents, no dashboards in Phase 1** — those are Phases 2, 3, and 4.

The full spec is the master scoping doc in this folder. This brief is a focused pointer to what matters for Phase 1 specifically and the non-obvious decisions you must honor.

## Phase 1 exit criterion

> SQL queries against Supabase return realistic Onspring-shaped data with correct distributions and referential integrity. The `mv_lead_source_influence_weights` view computes successfully and produces sensible numbers.

When you can run a handful of test queries (examples at the bottom of this brief) and the answers match the targets in Section 9 of the spec within reasonable tolerance, you're done.

## Recommended working order

1. **Environment setup.** Decision is locked: **local Supabase first via `supabase start`**, push to Scott's cloud project only after Phase 1 validation passes. Use the Supabase CLI; put migrations under `supabase/migrations/`. Before writing code, verify (a) Docker is running, (b) the Supabase CLI is installed and reasonably current, (c) `supabase init` has been run in the project root. If any of those are missing, walk Scott through installing them — don't try to work around the absence.

2. **Schema migration files** (one logical migration per domain, in this order so FKs resolve):
   - `001_marketing_domain.sql` — `mkt_companies`, `mkt_contacts`, `mkt_campaigns`, `mkt_campaign_members`, `mkt_touches`, `mkt_form_submissions`, `mkt_web_sessions`
   - `002_sales_domain.sql` — `sls_users`, `sls_opportunities`, `sls_opportunity_contacts`, `sls_opportunity_history`, `sls_activities`
   - `003_subscription_domain.sql` — `sub_subscriptions`, `sub_arr_movements`
   - `004_customer_domain.sql` — `cs_health_scores`, `cs_tickets`, `prod_usage_daily`
   - `005_finance_ai_domain.sql` — `fin_spend_monthly`, `fin_margin`, `ai_agent_runs`, `ai_alerts`, `ai_lead_scores`, `ai_deal_risks`
   - `006_triggers_constraints.sql` — all triggers (see "Non-obvious decisions" below)
   - `007_indexes.sql` — all indexes
   - `008_materialized_views.sql` — all `mv_*` views

3. **Synthetic data generator** as a standalone Python project under `data-generator/` — single command (`python seed.py`) reproduces the entire dataset. Use a fixed random seed for reproducibility. Generate to CSVs first, then COPY into Postgres (much faster than INSERTs at scale). Generate in dependency order.

4. **Seed Supabase** and refresh all materialized views.

5. **Validation script** (`validate.py` or `validate.sql`) that runs distribution checks and reports pass/fail against Section 9 targets.

## Non-obvious decisions you MUST honor

These are the parts of the spec where the wrong-default-from-instinct will produce wrong-looking data. Read carefully.

### Lead source four-field model on `mkt_contacts`

Four fields, two with **write-once** semantics:

```
original_lead_source         -- WRITE-ONCE. Stamped on first engagement. Never overwritten.
original_lead_source_detail  -- WRITE-ONCE. Same rule.
lead_source                  -- Overwritten on every engagement. Latest source.
lead_source_detail           -- Overwritten on every engagement. Latest detail.
```

Implement write-once via an **INSERT/UPDATE trigger** that uses `COALESCE(OLD.original_lead_source, NEW.original_lead_source)`. NOT NULL won't work because they're allowed to be NULL initially. The synthetic data generator must populate both `original_*` and current `lead_source` simultaneously when a contact is first created.

### Lead source two-field model on `sls_opportunities` — stamp-once

`sls_opportunities.lead_source` and `lead_source_detail` are **populated at INSERT only**, sourced from the Champion contact's then-current `mkt_contacts.lead_source` and `lead_source_detail`. Subsequent updates to the contact do NOT propagate to the deal. Implement via a BEFORE INSERT trigger that does the lookup. UPDATEs to these two fields on the deal must be blocked unless explicitly unlocked (see Section 7.4 of the spec).

### Champion = `is_primary` on the join table

The `sls_opportunity_contacts` join table has `is_primary BOOLEAN`. Exactly one row per `opportunity_id` may have `is_primary = true` — that row is the Champion. The deal's `primary_contact_id` always points to that contact. Enforce with a trigger (a partial UNIQUE index on `(opportunity_id) WHERE is_primary = true` is the simplest enforcement).

### Inherited deal fields from Company and Champion

`sls_opportunities.segment` is **derived from `mkt_companies.company_size`** at INSERT. `sls_opportunities.vertical` is derived from `mkt_companies.vertical_tag`. The deal's `lead_source` is from the Champion contact (see above). Implement these in the same BEFORE INSERT trigger — easier than separate triggers.

### `company_size` is derived from `employee_count`

Trigger on `mkt_companies` BEFORE INSERT/UPDATE:

```
employee_count 100–499    → 'SMB'
employee_count 500–4,999  → 'Mid-Market'
employee_count 5,000+     → 'Enterprise'
```

Don't let the synthetic data generator set `company_size` directly — let the trigger compute it.

### Engagement scores from Appendix B drive `mkt_touches.engagement_score`

The values are locked. Build a lookup table or a CASE statement in the seed generator. **Touches with engagement_score = 0 are NOT inserted** — Email Open, webinar replays under 5 minutes, etc. don't generate rows.

### Discovery meeting status determines deal stage

See Appendix C of the spec. The synthetic data generator should populate `discovery_meeting_status` first, then derive the initial `stage` from the mapping table (Scheduled/Rescheduling/No Show - Rescheduling → Stage 0; Held → Stage 1; No Show / Disqualified → Closed Lost).

### `sls_opportunity_history` should be auto-populated on stage change

Add a trigger on UPDATE of `sls_opportunities.stage` that inserts a row into `sls_opportunity_history` with the from/to stage, timestamp, and `days_in_prior_stage`. This way, when the synthetic data generator simulates stage progression over time, history is captured automatically.

The seed should walk each historical opportunity through realistic stage progressions (Stage 0 → 1 → 2 → ... → 6 or → Closed Lost) with realistic dwell times per Section 9 distributions. Don't shortcut by setting current stage and skipping history — the velocity charts depend on the history table.

### Indexes that matter for performance

These are not optional — the materialized views and the dashboards in Phase 3 will be slow without them:

- `sls_opportunity_history (opportunity_id, changed_at)` — composite, for time-in-stage queries
- `mkt_campaign_members (contact_id, campaign_id)` — composite, for buyer's journey
- `mkt_touches (contact_id, touch_date DESC)` — for top-N-recent touches per contact
- `mkt_touches (campaign_id, touch_date DESC)` — for campaign engagement velocity
- `sls_opportunities (close_date)` — for close-date forecast view
- `sls_opportunities (stage, owner_id)` — for pipeline-by-rep queries
- `sls_opportunities (sdr_id, discovery_meeting_date)` — for the discovery booking forward chart
- `sls_opportunity_contacts (opportunity_id, is_primary)` — for Champion lookups

### Materialized view refresh strategy

For Phase 1, just create them. Phase 3 will wire scheduled refresh. Use `REFRESH MATERIALIZED VIEW CONCURRENTLY` where possible (requires a UNIQUE index on each view). Don't pre-aggregate things you can't recompute — keep the immutable event ledgers (`sub_arr_movements`, `sls_opportunity_history`, `mkt_touches`) clean.

### AI fields stay NULL after seed

`ai_fit_score`, `ai_intent_score`, `ai_score_rationale`, `ai_risk_band`, `ai_risk_score`, `ai_next_action`, `ai_close_probability` — leave NULL in the seed. Phase 4 populates them.

### Time decay formula in the influence weight view

Even though the influence weight view itself just does `win_rate × sqrt(deals_with_source)`, the per-contact and per-deal influence scores (computed by Phase 4 agents) need the time-decay formula. For Phase 1, you don't need to implement the per-contact/per-deal scores — just make sure the view exists and the underlying touch data has accurate `touch_date` values so the agents can compute decay later.

### Realistic data quality issues

Per Section 9, the seed should include intentional realistic mess:
- ~8% of contacts with NULL `job_title`
- ~3% of contacts with malformed email (e.g., missing `@`, missing TLD)
- ~2% duplicate companies (same name, slightly different domain)
- ~1% of deals where `lead_source` ≠ Champion's current `lead_source` (the trade-show-then-form-fill outlier — set this up by having the contact engage with another channel AFTER the deal was created, so `mkt_contacts.lead_source` updates but `sls_opportunities.lead_source` stays stamped at the original value)

These power the data quality console in Phase 5. If the seed is too clean, that whole dashboard has nothing to show.

### Distributions are not optional

Hit the targets in Section 9 of the spec within ±5%. Especially:
- Vertical mix (FinServ 32%, Healthcare 21%, Energy 14%, Federal 12%, Tech 10%, Manufacturing 6%, Other 5%)
- Segment mix (SMB 10%, MM 65%, Enterprise 25%)
- Win rate (22% overall, 31% inbound demo, 14% outbound cold)
- NRR 112%, GRR 94%
- Original lead source mix (Website 22%, ZoomInfo 18%, Webinar 15%, Trade Show 10%, PPC 9%, Field Event 8%, Partner 7%, Social Ad 5%, ABM 4%, Sales Generated 2%)

The validation script must check these and report deviations.

## How to work

- **One migration per logical change**, never edit a migration after it's been applied. New decisions = new migration file.
- **Validate as you go.** After each migration, run a quick `\d table_name` and a `select count(*)` to confirm. After the seed, run the full validation script.
- **Never destroy data without asking.** If you need to rebuild, ask Scott first — he may be testing things mid-build.
- **Don't change spec decisions** without checking with Scott. If something in the spec genuinely doesn't make sense, raise it as a question, don't silently rewrite it.
- **Use `\copy` or `COPY FROM` for the seed**, not row-by-row INSERTs. The dataset is ~hundreds of thousands of rows when you count touches and stage history. INSERTs will be slow and tax the cloud Supabase connection.
- **Determinism.** Set a fixed random seed in the generator (`random.seed(42)`, `Faker.seed(42)`, `np.random.seed(42)`) so re-runs produce identical data.

## Deliverables for Phase 1

When you're done, the workspace folder should contain:

```
supabase/
  config.toml
  migrations/
    001_marketing_domain.sql
    002_sales_domain.sql
    003_subscription_domain.sql
    004_customer_domain.sql
    005_finance_ai_domain.sql
    006_triggers_constraints.sql
    007_indexes.sql
    008_materialized_views.sql

data-generator/
  seed.py                  # entry point, deterministic
  generators/
    companies.py
    contacts.py
    campaigns.py
    touches.py
    opportunities.py
    subscriptions.py
    health_scores.py
    spend.py
  output/                  # CSVs ready to COPY (gitignored)
  README.md                # how to run

validation/
  validate.sql             # SQL distribution checks
  validate.py              # Python-driven runner with pass/fail report
  REPORT.md                # most-recent validation output
```

Plus a top-level `README.md` updated with Phase 1 setup instructions.

## Sample validation queries to run when "done"

These are smoke tests — if all of these return sensible numbers matching Section 9, you're done:

```sql
-- Customer base size
SELECT count(*) FROM mkt_companies WHERE is_customer = true;
-- Expect ~320

-- ARR roughly $32M
SELECT sum(arr) FROM sub_subscriptions WHERE status = 'active';
-- Expect ~$32M

-- Vertical mix
SELECT vertical_tag, count(*) * 100.0 / sum(count(*)) OVER () AS pct
FROM mkt_companies
GROUP BY vertical_tag
ORDER BY pct DESC;
-- Expect FinServ ~32%, Healthcare ~21%, etc.

-- Segment mix
SELECT company_size, count(*) FROM mkt_companies GROUP BY company_size;
-- Expect SMB ~10%, MM ~65%, Enterprise ~25%

-- Original lead source mix
SELECT original_lead_source, count(*) * 100.0 / sum(count(*)) OVER () AS pct
FROM mkt_contacts
GROUP BY original_lead_source
ORDER BY pct DESC;
-- Expect Website ~22%, ZoomInfo ~18%, Webinar ~15%, etc.

-- Discovery meeting status mix (past meetings)
SELECT discovery_meeting_status, count(*)
FROM sls_opportunities
WHERE discovery_meeting_date < current_date
GROUP BY discovery_meeting_status;
-- Expect Held ~65%, No Show ~12%, etc.

-- Win rate
SELECT
  count(*) FILTER (WHERE stage = 6) AS won,
  count(*) FILTER (WHERE stage = 6 OR forecast_category = 'Closed' AND stage != 6) AS closed,
  count(*) FILTER (WHERE stage = 6) * 100.0 / count(*) FILTER (WHERE stage = 6 OR (forecast_category = 'Closed' AND stage != 6)) AS win_rate_pct
FROM sls_opportunities
WHERE close_date >= current_date - interval '12 months';
-- Expect ~22% overall

-- Champion exists for every active deal
SELECT count(*)
FROM sls_opportunities o
WHERE NOT EXISTS (
  SELECT 1 FROM sls_opportunity_contacts oc
  WHERE oc.opportunity_id = o.id AND oc.is_primary = true
);
-- Expect 0

-- Inherited fields match parents
SELECT count(*)
FROM sls_opportunities o
JOIN mkt_companies c ON c.id = o.company_id
WHERE o.segment != c.company_size OR o.vertical != c.vertical_tag;
-- Expect 0

-- Influence weight view computes
SELECT * FROM mv_lead_source_influence_weights ORDER BY influence_weight DESC;
-- Expect 10 rows (one per Lead Source), Website + Webinar near the top

-- Data quality: malformed emails ~3%
SELECT count(*) * 100.0 / (SELECT count(*) FROM mkt_contacts) AS malformed_pct
FROM mkt_contacts
WHERE email !~ '^[^@]+@[^@]+\.[^@]+$';
-- Expect ~3%
```

## Out of scope for Phase 1

- Frontend (Next.js, components, dashboards) — Phase 2 and 3
- Auth UX — Phase 2
- AI agents (any LLM call) — Phase 4
- Materialized view refresh scheduling — Phase 3
- Data quality console UI — Phase 5
- Simulated HubSpot sync job — Phase 5
- Production secrets management beyond `.env.example` — Phase 5

## When you're done

Report back with:

1. **Validation report**: side-by-side table of (Target, Actual, Δ%) for every distribution in Section 9.
2. **Schema summary**: count of tables, count of triggers, count of indexes, count of materialized views.
3. **Materialized view stats**: row count and refresh time for each `mv_*`.
4. **Any deviations from spec** with reasons (don't silently change anything; if you had to, surface it).
5. **Open questions for Scott** before proceeding to Phase 2.

Then stop. Do not start Phase 2.
