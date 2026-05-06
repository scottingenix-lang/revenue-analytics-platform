# Revenue Analytics Platform — Scoping Document

**Project:** Onspring Revenue Analytics Platform (working prototype)
**Author:** Scott Logan
**Purpose:** Portfolio artifact for the Onspring Marketing Operations & AI Manager interview
**Build environment:** Claude Code (frontend + AI), Supabase (Postgres + Auth + Edge Functions)
**Date:** May 2026
**Version:** 2.0 — incorporates all phase-1 refinements (schema, lead source model, influence weighting, stage model, discovery meeting tracking, dashboard consolidation)
**Status:** Spec frozen — ready for build

---

## 1. Executive Summary

This document scopes a working prototype of an AI-augmented revenue analytics platform tailored for Onspring's go-to-market motion. The platform unifies marketing, sales, and customer-success data into a single source of truth, exposes the funnel and recurring-revenue metrics a Marketing Operations & AI Manager is accountable for, and embeds AI agents that turn raw data into next-best-action recommendations.

The prototype is intentionally narrow in scope but production-shaped: real schema, real metrics, real AI workflows — powered by realistic synthetic data modeled after a mid-market GRC SaaS at Onspring's stage. It is designed to be demoed in 3 to 7 minutes during the interview process and to substantiate every line of the job description with a concrete artifact.

Note on naming: this document references "Onspring," the GRC platform company at **www.onspring.com**. There are several unrelated companies sharing the name; this prototype is built around the buying motion of the GRC SaaS specifically.

## 2. Strategic Context

The Onspring JD describes a "force multiplier" who owns the technical backbone of marketing — HubSpot administration, AI workflow design, funnel analytics, attribution, and partnership with sales. Rather than describe how I would do that work, this prototype demonstrates it.

**JD requirement → Prototype evidence**

| JD Requirement | How the Prototype Demonstrates It |
|---|---|
| HubSpot power user / admin | Schema mirrors HubSpot's contact, company, deal, and lifecycle objects, and includes the four-field lead source model used by mature MarOps teams. ETL approach is documented as if HubSpot is the source of record. |
| AI-powered workflows and agents | Six embedded Claude agents for lead scoring, anomaly detection, deal-risk surfacing, narrative summaries, forecasting, and natural-language Q&A — wired into the workflow, not bolted on. |
| Reporting connecting marketing to revenue | Multi-touch attribution dashboard ties every closed-won deal back to first-touch and influencing campaigns; influence-weight model calibrates by win rate. |
| Funnel metrics: volume, velocity, conversion | Pipeline & Sales Velocity dashboard with per-stage conversion, time-in-stage, stalled-deal flagging, fast-pacer surfacing, and Discovery Meeting forward booking. |
| Attribution modeling | Side-by-side first-touch, last-touch, linear, time-decay, and W-shaped attribution; original_lead_source vs. deal-stamped lead_source comparison; channel handoff matrix. |
| Partnership with sales (intent signals) | Account Intent view blending product-usage proxies, web behavior, and HubSpot fit/engagement scoring; SDR-AE handoff preserved across the deal lifecycle. |
| Hands-on LLM building | Production agent architecture using Claude — six agents with cost/latency monitoring, $5/day budget caps, structured input/output contracts. |

**Why this matters for Onspring specifically.** Onspring sells to GRC buyers — long sales cycles, multi-stakeholder buying committees, audit-driven urgency, and vertical compliance triggers (SOX, HIPAA, FedRAMP, DORA, NIST CSF, ISO 27001). The synthetic data, the pipeline stage model, the loss reasons, the campaign naming, and the AI prompt templates are all shaped around that motion — not a generic SMB funnel.

## 3. Target Users & Personas

The platform serves four primary personas. **In v1 there is no persona-based login** — a single full-access account is used to keep the prototype focused. Personas inform what the dashboards prioritize visually, not who can log in.

**MarOps & AI Manager (the role itself).** Owns lead flow, attribution, AI workflow performance. Cares about which campaigns generate qualified pipeline, where leads stall, and whether AI agents are improving conversion or just generating motion.

**CMO / VP Marketing.** Needs board-ready numbers: pipeline contribution, marketing-sourced ARR, CAC payback, demand-gen ROI by program.

**RevOps Director / VP Sales.** Owns forecast accuracy, pipeline coverage, sales velocity, rep performance.

**CEO / Board.** Wants headline numbers and trend lines: ARR, NRR, growth rate, CAC payback, magic number.

## 4. Core Capabilities (Feature Set)

The platform consists of five dashboards, an AI layer, and an admin/data-quality console.

### 4.1 Executive Revenue Cockpit

The top-of-house view. Single page, ten tiles, opinionated about what matters. Includes ARR with trailing 12-month growth, new-vs-expansion-vs-churn waterfall, NRR/GRR, pipeline coverage for the current and next quarter, CAC payback period, magic number, win rate, average deal size, sales cycle length, and an AI-generated narrative summary that explains what changed week-over-week.

### 4.2 Marketing-to-Revenue Attribution

Closes the loop between every marketing touch and downstream revenue. Surfaces five attribution models side-by-side (first-touch, last-touch, linear, time-decay, W-shaped). Drill-down from program to campaign to individual touch. Includes a "show me the path" view that visualizes the touch sequence on representative closed-won deals, and a **channel handoff matrix** that compares each contact's `original_lead_source` against the `lead_source` stamped on the deal — showing which acquisition channels hand off to which conversion channels.

### 4.3 Pipeline & Sales Velocity

The richest dashboard, organized in five panels. Two dashboard-level filter dropdowns sit at the top and apply to every chart on the page: **Segment** (All / SMB / Mid-Market / Enterprise) and **Industry** (All / Financial Services / Healthcare / Energy & Utilities / Federal/Public Sector / Technology / Manufacturing / Other).

**Panel A — Close-Date Forecast.** Open deals grouped by `close_date` (the rep's commitment), annotated with the AI-generated `ai_close_probability`. The visual highlights deals where AI strongly disagrees with the rep's commit, so the forecast call meeting can focus on disagreements rather than reading every line.

**Panel B — Stage Velocity & Conversion Funnel.** Horizontal funnel showing every transition from Discovery Meeting Booked through Stage 6 (Closed Won), each annotated with both conversion rate and average days. Reveals where the funnel actually leaks and how long each transition takes.

**Panel C — Stalled Deals.** Table of every open deal where `current_stage_age_days` exceeds the average for its current stage (segment-matched). Sorted by overage. Color-coded to highlight 1.5x → 3x stalled deals.

**Panel D — Fast-Pacing Deals.** Table of open deals reaching their current stage faster than typical. Surfaces "deals worth attention" — fast movers often deserve marketing assist or executive sponsor introductions.

**Panel E — Discovery Meeting Operations.** Three sub-views:
- **Discovery Meeting Booking Forward View:** stacked bar chart, current week + 4 weeks ahead, segmented by SDR. Three chart-level filters: SDR (multi-select), Company Size, Industry.
- **SDR Ops Metrics:** Held rate, hard no-show rate, recoverable no-show rate, reschedule rate, disqualification rate, and average reschedules per held call.
- Drill-down into individual SDR rep performance.

### 4.4 Retention & Expansion (NRR/GRR)

Cohort retention curves, logo and dollar churn, expansion (upsell + cross-sell) attribution, and a customer health score blending product-usage proxies, support load, and renewal proximity. Surfaces at-risk renewals 90 days out and lists candidate accounts for expansion plays.

### 4.5 Unit Economics & Channel ROI

Renamed and expanded from v1. Houses **all** unit-economics and channel-economics reports in one dashboard:

- CAC (blended and by acquisition channel)
- LTV
- LTV:CAC ratio
- CAC payback period
- Magic number
- Burn multiple
- Quality-of-growth decomposition (healthy ARR vs. expensive ARR)
- **Channel ROI sanity panel** — pairs the influence-weighted lead source view with CAC by source, so spend efficiency is visible alongside influence weight. Color-coded ROI flag (green / yellow / red) per channel.

### 4.6 AI Layer (cross-cutting)

A persistent AI sidebar (Data Copilot) available on every dashboard, plus a dedicated AI agent monitoring page. See Section 6 for full agent specs.

### 4.7 Admin / Data-Quality Console

A page for the MarOps administrator: data freshness indicators, simulated daily HubSpot sync log, lead-routing rule editor, AI agent run history with cost/latency, and a HubSpot field-mapping inspector that flags fields with low fill rate or stale data. Specific data-quality checks include:
- Lead Source Detail format violations (regex-checked)
- Contacts with missing titles (8% in synthetic data)
- Malformed emails (3% in synthetic data)
- Deals where `lead_source` differs from the Champion's current `lead_source` (the trade-show-then-form-fill outlier)
- Deals missing a Champion designation
- Discovery Meeting status oddities (e.g., status = Held but `discovery_meeting_held_date` is null)

## 5. Metrics Catalog

These are the metrics the platform calculates. Definitions are deliberately Onspring-shaped (mid-market GRC, annual contracts, multi-year deals common).

### Recurring Revenue & Retention

**ARR.** Annualized contract value of all active subscriptions at a point in time. Excludes one-time fees, services, overages. Calculated nightly.

**MRR.** ARR / 12. Used for monthly contracts (rare in Onspring's segment).

**ARR Movement Waterfall.** New + Expansion + Reactivation − Contraction − Churn = Net New ARR. Reported monthly.

**NRR.** (Starting ARR + Expansion − Contraction − Churn) / Starting ARR, fixed cohort 12 months prior. Mid-market target 110%+; 120%+ exceptional.

**GRR.** (Starting ARR − Contraction − Churn) / Starting ARR. Excludes expansion. Target 90%+.

**Logo Churn Rate.** Customers lost in period / customers at start of period.

### Pipeline & Sales Velocity

**Pipeline Coverage.** Stage-weighted open pipeline / remaining quota for the period. 3x–4x healthy.

**Sales Velocity.** (# Opps × Avg Deal Size × Win Rate) / Sales Cycle Length.

**Win Rate.** Closed-won / (closed-won + closed-lost), measured by count and by ARR.

**Sales Cycle Length.** Median days from opportunity creation to closed-won, by segment and source. Measured at the deal level using `deal_age_days`.

**Funnel Conversion (Discovery Meeting Booked → Stage 1 → 2 → … → 6).** Stage-by-stage conversion over a trailing 90-day cohort.

**Stage Velocity Stats.** Per (segment, transition_from, transition_to): conversion_rate, avg_days, median_days, p75_days, p90_days, sample_size. Lives in `mv_stage_velocity_stats`.

**Stalled Deal Flag.** `current_stage_age_days > avg_days_for_current_stage` (segment-matched).

**Fast-Pacing Flag.** `deal_age_days < p25_days_to_reach_current_stage` (segment-matched).

### Discovery Meeting / SDR Ops

**Held Rate.** Discovery Meetings with status = Held / total scheduled (rolling 30/60/90d).

**Hard No-Show Rate.** status = "No Show" / total scheduled.

**Recoverable No-Show Rate.** status = "No Show - Rescheduling" / total scheduled.

**Reschedule Rate.** (status = Rescheduling) + (status = No Show - Rescheduling) / total scheduled.

**Disqualification Rate.** status = Disqualified / total scheduled.

**Avg Reschedules per Held Call.** avg(`discovery_meeting_reschedule_count`) where status = Held.

### Unit Economics

**CAC.** (Sales spend + Marketing spend) / new logos in period. Blended and by channel.

**LTV.** Avg ARR per customer × gross margin × (1 / logo churn rate).

**LTV:CAC Ratio.** LTV / CAC. 3:1 healthy; 5:1+ exceptional.

**CAC Payback Period.** CAC / (Avg ARR per new customer × gross margin). Months. Mid-market target < 18 months.

**Magic Number.** (Net New ARR × 4) / Sales & Marketing spend in prior quarter. > 0.75 invest more; < 0.5 fix efficiency.

**Burn Multiple.** Net cash burned / Net New ARR.

### Customer Health

**Customer Health Score.** Weighted blend of product-usage proxy, support load, executive sponsor turnover, renewal proximity. Scaled 0–100. Daily snapshot.

### Influence Weighting (powers Lead Scoring + Deal Close Probability agents)

**Lead Source Influence Weight.** Per Lead Source over trailing 12 months:

```
deals_with_source       = distinct deals where any associated contact had a touch
                          from this source within 365-day lookback before deal creation
closed_won_with_source  = subset that closed won
closed_lost_with_source = subset that closed lost
win_rate_present        = closed_won_with_source / (closed_won_with_source + closed_lost_with_source)
volume_factor           = sqrt(deals_with_source)
influence_weight        = win_rate_present × volume_factor
```

Stored in `mv_lead_source_influence_weights`, recomputed nightly.

**Time decay.** `touch_weight = engagement_score × 0.5^(days_old / 90)` with a 365-day lookback window.

**Touch cap.** Per (contact, lead_source), only the top 5 touches by engagement_score are counted.

**Champion multiplier.** 2× weight on Champion's touches (per `sls_opportunity_contacts.is_primary = true`).

**Account-level rollup.** Touches aggregated to company_id alongside contact_id for ABM-style scoring.

## 6. AI-Powered Features

All agents use the Anthropic API with Claude. Per-agent **$5/day budget cap** auto-pauses any agent that exceeds the daily limit. All AI scores write to dedicated fields (e.g., `ai_fit_score`, `ai_close_probability`) — never overwriting rule-based fields, so AI vs. rule-based comparison is always available.

### 6.1 Narrative Summary Agent

Runs nightly. Reads the previous day's metric movements, identifies the three most material changes, and writes a 4–6 sentence executive summary in plain English. Output appears at the top of the executive cockpit and is delivered as a Slack/email digest. Grounded — cites the specific metric, the magnitude of change, and the segment driving it. Uses Claude Haiku for cost efficiency.

### 6.2 Anomaly Detection & Alerting Agent

Monitors all metrics for statistically significant deviations from expected ranges (rolling z-score and seasonality-adjusted baselines). When triggered, the LLM interprets the deviation: "MQL volume from PPC is down 38% week-over-week, driven entirely by a 60% drop on the SOC 2 keyword cluster." Routes alerts by severity and topic. Uses Claude Haiku.

### 6.3 Deal Risk & Next-Best-Action Agent

Runs on every open opportunity nightly (no thresholds in v1 — score everything). Synthesizes deal age, stage progression history, last-activity recency, stakeholder coverage (from the `sls_opportunity_contacts` join table), influence-weighted touch history, and product-fit signals into:
- `ai_risk_band` (Low / Medium / High)
- `ai_risk_score` (0–100)
- `ai_next_action` (one-sentence recommendation)

Visible on the deal inspector and pushed back to HubSpot as custom properties. Uses Claude Sonnet.

### 6.4 Lead Scoring & Enrichment Agent

Replaces rule-based lead scoring with an LLM-graded fit + intent score. Inputs: firmographic data, web behavior, free-text fields, and the contact's influence-weighted touch profile (using the cap-at-5, time-decayed, Champion-multiplied formula). Outputs:
- `ai_fit_score` (0–100)
- `ai_intent_score` (0–100)
- `ai_score_rationale` (structured text)

Calibrated against historical conversion data. Uses Claude Haiku.

### 6.5 Natural-Language Q&A (Data Copilot)

Persistent sidebar on every page. Translates natural-language questions into SQL, executes against Supabase, returns a chart or table, and explains its reasoning. Includes a confidence indicator and the option to view/edit the generated SQL.

**SQL access scope:** views-only by default (queries `mv_*` materialized views — fast, predictable, low risk of bad joins). An "advanced" toggle in the UI unlocks full read-only access to the entire schema for power-user demos. Uses Claude Sonnet.

### 6.6 Forecast Assistant (simplified per v2)

Generates per-deal probability adjustments and surfaces deals where the AI strongly disagrees with the rep's commit. Inputs: stage history, engagement, influence weights, deal age, stakeholder coverage, product-line conversion benchmarks. Output:
- `ai_close_probability` (0–100, written to the deal record)
- Disagreement flag where AI probability differs from the rep's `forecast_category` by more than a configurable threshold

**Does not** produce a quarterly forecast number — that's intentionally out of scope for v1, since (per the project owner's framing) forecast quality is always a guessing game and the right calibration depends on the org's actual top closing signals, which can be tuned post-hire. Uses Claude Sonnet.

## 7. Data Architecture & Model

### 7.1 Source Systems (logical mapping)

For the prototype, all data is synthetic. The schema is laid out as if these are the real sources:

- HubSpot — contacts, companies, deals, lifecycle stages, lead source (4-field model), email engagement, form submissions, page views, campaign membership
- Salesforce or HubSpot CRM — opportunities, stages, close dates, ACV
- Stripe / Recurly — subscriptions, invoices, MRR/ARR ledger
- Intercom / Zendesk — support tickets, satisfaction scores
- Product analytics (Amplitude / proxy) — login activity, feature usage by account
- Finance system — sales & marketing spend, gross margin

### 7.2 Supabase Schema

Tables are namespaced by domain. PKs are UUIDs unless noted. All tables include `created_at` and `updated_at`.

#### Marketing domain

**`mkt_companies`**

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| name | text | Mid-market company names |
| domain | text | Derived from name |
| industry | text | HubSpot's standard list |
| vertical_tag | enum | Financial Services, Healthcare, Energy & Utilities, Federal/Public Sector, Technology, Manufacturing, Other |
| employee_count | int | Log-normal: median 1,200, range 200–25,000 |
| company_size | enum | **Derived** from employee_count: SMB (100–499), Mid-Market (500–4,999), Enterprise (5,000+) |
| annual_revenue | numeric | Median $400M |
| revenue_band | enum | <$100M, $100M–$500M, $500M–$1B, $1B–$5B, $5B+ |
| country | text | US 78%, Canada 8%, UK 6%, AU 4%, Other 4% |
| state, city | text | Weighted to NY, IL, TX, CA, MA, DC for FinServ/Federal |
| lifecycle_stage | enum | Subscriber, Lead, MQL, SQL, Opportunity, Customer, Evangelist |
| hubspot_owner_id | uuid | FK → sls_users |
| is_customer | bool | ~22% |
| num_associated_contacts | int | Median 4 |
| num_associated_deals | int | Median 1 |

(Removed in v2: `compliance_frameworks`.)

**`mkt_contacts`**

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| email | text | 3% malformed for DQ console |
| first_name, last_name | text | Locale-matched |
| company_id | uuid | FK |
| job_title | text | Realistic GRC titles; 8% null |
| seniority | enum | IC 35%, Manager 25%, Director 22%, VP 12%, C-Level 6% |
| function | enum | Compliance 24%, IT Security 22%, Internal Audit 16%, Risk Management 14%, Legal 8%, IT Ops 7%, Privacy 5%, Procurement 4% |
| lifecycle_stage | enum | Same as company stages |
| hs_persona | enum | GRC Leader, Security Practitioner, Auditor, Risk Officer, IT Buyer, Legal/Privacy Counsel |
| **original_lead_source** | enum | **Write-once.** First-touch acquisition channel. Never overwritten. |
| **original_lead_source_detail** | text | **Write-once.** First-touch detail, naming convention: `<2-4 word desc> - <Lead Source> - <date code>` |
| **lead_source** | enum | **Overwritten on each engagement.** Latest touch source. |
| **lead_source_detail** | text | **Overwritten on each engagement.** Latest touch detail. |
| lead_status | enum | New, Open, Working, Nurturing, Connected, Unqualified, Bad Timing |
| lead_score | int | HubSpot-style rule-based, 0–100 |
| ai_fit_score | int | AI-written, 0–100 |
| ai_intent_score | int | AI-written, 0–100 |
| ai_score_rationale | text | AI-written |
| created_date | timestamp | Spread, weighted to last 18 months |
| last_activity_date | timestamp | |
| num_form_submissions, num_page_views, num_email_clicks | int | Behavioral counts (no opens) |
| attended_webinar, demo_requested, downloaded_content | bool | |
| gdpr_consent | bool | True for ~96% |
| owner_id | uuid | FK → sls_users (BDR/SDR ownership at contact level) |

**Lead source enum (10 values, applies to all four lead source enum fields above):** ZoomInfo, Website, Webinar, Trade Show, Field Event, PPC, Social Ad, Partner, ABM, Sales Generated.

**`mkt_campaigns`**

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| name | text | Onspring-shaped: "FedRAMP Compliance eBook", "Dallas CISO Dinner", "RSA 2026 Booth", "Healthcare ABM Q2", etc. |
| type | enum | Webinar, eBook, Trade Show, Field Event, PPC, Social, Email, ABM, Partner |
| channel | enum | Maps to lead_source where possible |
| program | text | Higher-level grouping (e.g., "FedRAMP Demand Gen", "Q2 Healthcare ABM") |
| start_date, end_date | date | |
| cost | numeric | Used for CAC by source |

**`mkt_campaign_members`** — *NEW in v2*

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| campaign_id | uuid | FK |
| contact_id | uuid | FK |
| **added_at** | timestamp | When the contact first joined this campaign — anchor for buyer's journey timelines |
| last_engagement_at | timestamp | Most recent touch in this campaign |
| touch_count | int | Derived from `mkt_touches` |
| total_engagement_score | int | Derived from `mkt_touches` |
| UNIQUE (campaign_id, contact_id) | constraint | One row per contact-campaign pair |

**`mkt_touches`**

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| contact_id | uuid | FK |
| campaign_id | uuid | FK (nullable for non-campaign touches) |
| touch_type | enum | See Appendix B for full list and locked engagement scores |
| **engagement_score** | int (0–100) | Set from touch_type lookup |
| **pre_or_post_deal** | enum | 'pre', 'post', 'no_deal' — relative to the contact's associated deal's created_date |
| touch_date | timestamp | |
| touch_value | numeric | Optional (e.g., webinar minutes attended, page count) |

Email opens and webinar replays under 5 minutes are **not** recorded — the table only contains qualifying touches (engagement_score > 0).

**`mkt_form_submissions`** and **`mkt_web_sessions`** — supporting tables, unchanged from v1.

#### Sales domain

**`sls_opportunities`** — *Heavily revised in v2*

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| name | text | `{Company} - {Product Line} - {Use Case}` |
| company_id | uuid | FK |
| primary_contact_id | uuid | FK to the Champion (= `is_primary` row in sls_opportunity_contacts) |
| **owner_id** | uuid | FK → sls_users where role = 'AE'. The deal owner end-to-end. |
| **sdr_id** | uuid | FK → sls_users where role = 'SDR'. The SDR who booked the discovery meeting. **Never overwritten** — preserves SDR attribution. |
| pipeline | enum | New Business 70%, Expansion 22%, Renewal 8% |
| **stage** | enum | Stage 0–6 (see Appendix C) |
| amount | numeric | TCV, median $185K |
| arr | numeric | Annualized, median $85K |
| term_months | int | 12 (35%), 24 (25%), 36 (40%) |
| close_date | date | Quarter-end clustering |
| created_date | date | |
| **discovery_meeting_status** | enum | Scheduled, Rescheduling, No Show - Rescheduling, No Show, Disqualified, Held |
| **discovery_meeting_date** | date | Always reflects current scheduled date (overwritten on reschedule) |
| **discovery_meeting_held_date** | date (nullable) | Populated only when status = Held |
| **discovery_meeting_reschedule_count** | int | Default 0; increments on each reschedule |
| **lead_source** | enum | **Stamped once at deal creation** from Champion's then-current `mkt_contacts.lead_source`. Never updates. |
| **lead_source_detail** | text | **Stamped once at deal creation** from Champion's then-current `mkt_contacts.lead_source_detail`. Never updates. |
| **segment** | enum | **Inherited** from `mkt_companies.company_size` at deal creation. SMB / Mid-Market / Enterprise. |
| **vertical** | enum | **Inherited** from `mkt_companies.vertical_tag` at deal creation. |
| deal_type | enum | New Business, Expansion (Cross-sell), Expansion (Upsell), Renewal, Renewal-Uplift |
| product_line | enum | GRC Suite, IT Risk Management, Vendor Risk Management, Audit Management, Policy Management, Compliance Management, Business Continuity, ESG/Sustainability |
| probability | int | Stage-mapped default (see Appendix C); rep can override |
| forecast_category | enum | Pipeline, Best Case, Commit, Closed |
| next_step | text | |
| lost_reason | enum | See expanded enum below |
| competitor | enum | ServiceNow GRC, Archer, AuditBoard, LogicGate, MetricStream, OneTrust, Diligent, Workiva, Hyperproof, Internal Build |
| stakeholder_count | int | **Derived** from `count(sls_opportunity_contacts where opportunity_id = X and removed_at is null)` |
| has_economic_buyer_engaged | bool | **Derived** from `sls_opportunity_contacts.buying_role = 'Economic Buyer'` |
| activity_count_last_30 | int | Derived |
| **deal_age_days** | int | **Computed.** `today - created_date` |
| **current_stage_age_days** | int | **Computed.** `today - last_stage_change_date` |
| ai_risk_band | enum | Low / Medium / High (written by Deal Risk agent) |
| ai_risk_score | int | 0–100 |
| ai_next_action | text | Written by Deal Risk agent |
| ai_close_probability | int | 0–100 (written by Forecast Assistant) |
| created_at, updated_at | timestamp | |

**Updated `lost_reason` enum:** Lost to Competitor, No Decision, Price, Timing/Budget, Lack of Fit, Internal Build, **Discovery Meeting No Show**, **Disqualified Pre-Discovery**, Other.

**`sls_opportunity_contacts`** — *NEW in v2*

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| opportunity_id | uuid | FK |
| contact_id | uuid | FK |
| buying_role | enum | **Champion (Primary)**, Economic Buyer, Decision Maker, Influencer, Evaluator, End User, Blocker |
| is_primary | bool | True for exactly one contact per deal — the Champion |
| added_at | timestamp | Association date |
| removed_at | timestamp (nullable) | When the contact was disassociated (e.g., champion departed) |

**`sls_opportunity_history`**

Stage change log. Indexed on `(opportunity_id, changed_at)` for fast time-in-stage queries.

| Field | Type |
|---|---|
| opportunity_id | uuid |
| from_stage | enum |
| to_stage | enum |
| changed_at | timestamp |
| days_in_prior_stage | int |
| changed_by | uuid (FK → sls_users) |

**`sls_activities`**

Calls, emails, meetings. (opportunity_id, contact_id, type, occurred_at, owner_id)

**`sls_users`**

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| name | text | |
| email | text | |
| **role** | enum | **SDR, AE, Account Manager, Sales Manager, VP Sales** |
| segment | enum | SMB, Mid-Market, Enterprise (the segment they primarily cover) |
| quota | numeric | Annual quota |
| hire_date | date | |

#### Customer / Subscription domain (unchanged from v1)

`sub_subscriptions`, `sub_arr_movements`, `cs_health_scores`, `cs_tickets`, `prod_usage_daily`.

#### Finance / AI domain (unchanged from v1, plus AI fields written by agents)

`fin_spend_monthly`, `fin_margin`, `ai_agent_runs`, `ai_alerts`, `ai_lead_scores`, `ai_deal_risks`.

### 7.3 Materialized Views

| View | Purpose | Refresh |
|---|---|---|
| mv_arr_daily | Point-in-time ARR per day | Nightly |
| mv_funnel_conversion_monthly | Stage-to-stage conversion by lead-creation cohort | Weekly |
| mv_attribution_first_touch / last_touch / linear / time_decay / w_shaped | Attribution outputs by model | Nightly |
| mv_pipeline_coverage_weekly | Coverage rolled up by quarter | Weekly |
| mv_cohort_retention_monthly | NRR/GRR by acquisition cohort | Monthly |
| **mv_lead_source_influence_weights** | Influence weights per Lead Source over trailing 12 months | Nightly |
| **mv_cac_by_source_quarterly** | CAC per source × quarter; powers the channel ROI sanity panel | Quarterly |
| **mv_stage_velocity_stats** | Per (segment, transition): conversion_rate, avg/median/p75/p90 days | Nightly |
| **mv_overall_cycle_stats** | Per (segment, current_stage): avg/median/p25 days to reach this stage | Nightly |
| **mv_discovery_meeting_ops** | SDR-level held/no-show/reschedule/DQ rates | Daily |

### 7.4 Triggers and Constraints

- **Lead source write-once enforcement:** `mkt_contacts.original_lead_source` and `original_lead_source_detail` are populated via `COALESCE(original_*, NEW.lead_source)` pattern in an INSERT/UPDATE trigger; once non-null, they cannot be overwritten.
- **Deal lead source stamp-once:** `sls_opportunities.lead_source` and `lead_source_detail` are populated at INSERT only, sourced from the Champion's then-current contact lead source values. Subsequent UPDATEs of the contact do not propagate.
- **Deal-Champion cardinality:** trigger ensures exactly one `sls_opportunity_contacts` row per deal has `is_primary = true`.
- **Inherited deal fields:** `segment` and `vertical` are populated at INSERT from the associated company; an audit field `inherited_at` records when.

## 8. Tech Architecture

**Frontend.** Next.js 14 with App Router, TypeScript, Tailwind CSS, shadcn/ui components, Recharts for charting, React Query for data fetching. Deployed to Vercel.

**Auth.** Single Supabase Auth login. Full access. **No persona-based routing in v1** — personas inform default views and visual emphasis only. RLS policies stub multi-tenant readiness without enforcing it.

**Branding.** Generic visual identity referencing Onspring (the GRC platform at www.onspring.com) without lifting their logo. Landing page disclaimer states the prototype is built by Scott Logan against synthetic example data and is not affiliated with Onspring.

**Backend.** Supabase: Postgres for storage, Row-Level Security stubbed, Edge Functions for AI agents, Supabase Auth for login, pgvector for semantic search over deal notes and support tickets.

**AI layer.** Anthropic API. Claude Sonnet for default reasoning (Data Copilot, Deal Risk, Forecast Assistant). Claude Haiku for high-frequency low-stakes work (Anomaly Detection, Lead Scoring, Narrative Summary). Agents are Edge Functions with structured input/output contracts. Data Copilot uses a constrained tool-use loop (SQL tool + chart-render tool). $5/day budget cap per agent.

**Synthetic data generation.** Python script using Faker + custom generators, executed once and seeded into Supabase. Generates 24–36 months of history (3 years target) so cohort retention curves and rolling-12-month windows have room to operate.

**Observability.** Supabase logs + Vercel Analytics. AI agent runs logged to `ai_agent_runs` for cost and performance monitoring.

**Deployment.** Public GitHub repo. Vercel preview URL behind password protection. `.env.example` with placeholders for SUPABASE_URL, SUPABASE_ANON_KEY, ANTHROPIC_API_KEY. MIT license.

## 9. Synthetic Data Strategy

The data should pass the "looks like a real Onspring extract" test in a 5-second glance.

| Dimension | Target |
|---|---|
| Customer base | 320 active customers, 80 active opportunities, 1,400 historical opportunities (3 years) |
| ARR | ~$32M, growing 28% YoY, 112% NRR, 94% GRR |
| ACV distribution | Median $85K, top 10 accounts > $300K, long tail down to $25K |
| Verticals | FinServ 32%, Healthcare 21%, Energy 14%, Federal 12%, Tech 10%, Manufacturing 6%, Other 5% |
| Segment mix (by customer count) | SMB 10%, Mid-Market 65%, Enterprise 25% |
| Segment mix (by ARR) | SMB 4%, Mid-Market 55%, Enterprise 41% |
| Sales cycle | Median 142 days mid-market, 218 days enterprise |
| Win rate | 22% overall, 31% on inbound demo requests, 14% on outbound cold |
| MQL volume | ~1,200/month, seasonal Q1 and Q4 peaks |
| **Original lead source distribution** | Website 22%, ZoomInfo 18%, Webinar 15%, Trade Show 10%, PPC 9%, Field Event 8%, Partner 7%, Social Ad 5%, ABM 4%, Sales Generated 2% |
| Current lead source distribution | Skews more toward Website and Webinar (re-engagement) |
| Deal-stamped lead source distribution | Skews further toward Website (demo forms) and high-intent channels |
| Discovery meeting status mix (past) | Held 65%, No Show 12%, No Show - Rescheduling 8%, Disqualified 5%, Rescheduling 6%, Scheduled 4% (upcoming) |
| Campaign names | Onspring-shaped: "SOC 2 Readiness Webinar Q3 2025", "FedRAMP Compliance eBook", "DORA Readiness Assessment", "Dallas CISO Dinner 0526", "RSA 2026 Booth", "Healthcare ABM Q226" |
| Realistic correlations | High-touch deals close at higher rates and larger sizes; expansion correlates with usage growth; churn precedes a multi-week usage decline; Champion engagement velocity correlates with win probability |
| Intentional data quality issues | 8% missing titles, 3% malformed emails, ~2% duplicate companies, ~1% deals where lead_source ≠ Champion's current lead_source (the trade-show-then-form-fill outlier) |

## 10. Build Phases & Roadmap

Reorganized to **5 phases**. Each phase ends with a deliverable demoable in an interview.

### Phase 1 — Data Foundation (Days 1–4)

**Scope:**
- Supabase project provisioned (Postgres, Auth, Edge Functions, pgvector, RLS stubs)
- Full schema migration: `mkt_*`, `sls_*`, `sub_*`, `cs_*`, `prod_*`, `fin_*`, `ai_*`
- All triggers and constraints (lead source write-once, deal stamp-once, Champion cardinality, deal field inheritance)
- All indexes (notably `(opportunity_id, changed_at)` on `sls_opportunity_history`, `(contact_id, campaign_id)` on `mkt_campaign_members`)
- Materialized views created
- Synthetic data generator: 3 years of history, distributions matching Section 9
- Seed Supabase
- Validate distributions

**Exit criterion:** SQL queries against Supabase return realistic Onspring-shaped data with correct distributions and referential integrity. Influence weight view computes successfully.

### Phase 2 — App Scaffold & Design System (Days 5–7)

**Scope:**
- Next.js 14 App Router project, TypeScript, Tailwind, shadcn/ui
- Supabase Auth integration (single login, no personas)
- Generic Onspring-style branding (palette, type, layout)
- Landing page with prototype disclaimer
- Top nav, sidebar, dashboard shell
- Recharts setup
- React Query
- One end-to-end test: log in → executive cockpit stub → see ARR pulled from Supabase
- Vercel deployment with password protection

**Exit criterion:** Logged-in user lands on a working shell that proves the data path is plumbed end-to-end.

### Phase 3 — Core Dashboards (Days 8–13)

**Scope:**
- Executive Cockpit (10 tiles + AI narrative slot)
- Marketing-to-Revenue Attribution (5 models, channel handoff matrix, "show me the path")
- Pipeline & Sales Velocity (5 panels, 2 dashboard-level filters):
  - Close-Date Forecast view
  - Stage Velocity & Conversion Funnel
  - Stalled Deals
  - Fast-Pacing Deals
  - Discovery Meeting Operations (forward booking + SDR ops metrics; 3 chart-level filters on the booking chart)
- Retention & Expansion (cohort curves, NRR/GRR, expansion attribution, customer health, at-risk renewals)
- Unit Economics & Channel ROI (CAC, LTV, payback, magic number, burn multiple, channel ROI sanity panel)
- Drill path enabled: Tile → Segment → Deal/Account/Contact
- Per-tile timeframe selectors (max rolling 12 months)

**Exit criterion:** Every metric in the catalog renders correctly and matches the synthetic data ground truth. No AI yet — fully functional traditional BI tool.

### Phase 4 — AI Layer (Days 14–18)

**Scope:**
- Six agents implemented as Supabase Edge Functions:
  - Narrative Summary (Haiku, nightly)
  - Anomaly Detection & Alerting (Haiku, hourly)
  - Deal Risk & Next-Best-Action (Sonnet, nightly, every open deal)
  - Lead Scoring & Enrichment (Haiku, on contact create/update)
  - Natural-Language Q&A Data Copilot (Sonnet, on demand, views-only by default + advanced toggle)
  - Forecast Assistant simplified (Sonnet, nightly, per-deal probability + disagreement flag)
- AI fields written to dedicated columns (never overwriting rule-based fields)
- Persistent Data Copilot sidebar wired across all dashboards
- AI agent monitoring page (cost, latency, success rate per agent)
- $5/day budget caps with auto-pause logic

**Exit criterion:** AI is integrated into every dashboard's workflow. Every agent run is logged to `ai_agent_runs` with cost and latency. Demo Data Copilot questions return correct results.

### Phase 5 — Data Quality, Admin & Demo Polish (Days 19–22)

**Scope:**
- Data quality console:
  - Lead Source Detail format violations (regex)
  - Missing titles / malformed emails
  - Deals with `lead_source` ≠ Champion's current `lead_source`
  - Champion missing on a deal
  - Discovery Meeting status oddities
- HubSpot field mapping inspector
- Simulated daily HubSpot sync job (scheduled Edge Function that "syncs" by perturbing data slightly)
- Performance tuning (index review, view refresh schedules)
- Public GitHub repo finalized: README, `.env.example`, MIT license, seed script + SQL dump
- Loom 3-minute and 7-minute demo videos
- Portfolio one-pager

**Exit criterion:** Shareable URL + recorded demos + public repo, ready to send to a hiring manager.

**Total effort:** ~22 working days at evening/weekend pace.

## 11. Demo Script for Interviews

### 3-minute version

1. (0:30) Open the executive cockpit. Point out the AI-generated narrative summary at the top: "this is written by Claude every morning against last night's data." Highlight ARR, NRR, pipeline coverage.
2. (0:45) Click into the attribution dashboard. Toggle between first-touch and W-shaped. Show the same closed-won deal attributed differently. Open the channel handoff matrix — make the point that the original_lead_source distribution and the deal-stamped lead_source distribution diverge meaningfully.
3. (0:45) Open the Pipeline & Sales Velocity dashboard. Show the stage velocity funnel. Toggle the Industry filter to Financial Services — note how Stage 5 (Procurement & Legal) lengthens. Click into the Stalled Deals panel and read one AI risk narrative aloud.
4. (0:30) Use the Data Copilot: type "what's our held rate on enterprise FinServ discovery meetings this quarter?" Watch it generate SQL, return a chart, explain itself.
5. (0:30) Close on the AI agent monitoring page. "Every agent run is logged with cost and latency — same way I'd run any production AI workflow."

### 7-minute version

Same as above, plus a walkthrough of the Discovery Meeting Booking Forward View (showing per-SDR stacked bars with the SDR filter active), the Unit Economics & Channel ROI dashboard (showing the channel ROI sanity panel — high-influence + high-CAC channels color-coded yellow), and the data-quality console (showing how a malformed Lead Source Detail entry is surfaced and fixed).

## 12. Success Criteria

The prototype succeeds if it lets Scott credibly answer, in an interview:

1. "Tell me about an AI workflow you built for marketing or revenue ops." → Walk through the lead-scoring agent.
2. "How do you think about marketing-to-revenue attribution?" → Open the attribution dashboard and the channel handoff matrix.
3. "How would you partner with sales on intent signals?" → Show the deal inspector with AI risk narratives and the Discovery Meeting Booking Forward View.
4. "What's your approach to data hygiene?" → Open the data-quality console.
5. "Show me something you've built." → Share the URL and the 3-minute video.

If the answer to all five is "let me show you," the prototype has done its job.

## 13. Out of Scope (For This Build)

Real HubSpot OAuth and live sync, real Stripe webhook ingestion, multi-tenant architecture, persona-based login and routing, mobile responsive views beyond basic readability, exhaustive RBAC, standalone quarterly forecast number generation, anything that requires real customer data. These are documented as the next phase but not built.

---

## Appendix A: HubSpot Field Mapping Reference

For the Claude Code build session, this is the field-level mapping the schema is designed around. Use this as the contract when the platform is later wired to a real HubSpot instance.

| Supabase column | HubSpot object.field |
|---|---|
| `mkt_contacts.email` | contact.email |
| `mkt_contacts.lifecycle_stage` | contact.lifecyclestage |
| `mkt_contacts.original_lead_source` | contact.hs_analytics_source (with custom write-once enforcement) |
| `mkt_contacts.original_lead_source_detail` | contact.hs_analytics_source_detail (custom, write-once) |
| `mkt_contacts.lead_source` | contact.recent_conversion_source__c (custom) |
| `mkt_contacts.lead_source_detail` | contact.recent_conversion_source_detail__c (custom) |
| `mkt_contacts.lead_score` | contact.hubspotscore |
| `mkt_contacts.ai_fit_score` | contact.ai_fit_score__c (custom) |
| `mkt_contacts.ai_intent_score` | contact.ai_intent_score__c (custom) |
| `mkt_companies.industry` | company.industry |
| `mkt_companies.employee_count` | company.numberofemployees |
| `mkt_companies.company_size` | company.company_size__c (custom, derived) |
| `mkt_companies.vertical_tag` | company.vertical_tag__c (custom) |
| `sls_opportunities.stage` | deal.dealstage |
| `sls_opportunities.amount` | deal.amount |
| `sls_opportunities.close_date` | deal.closedate |
| `sls_opportunities.lead_source` | deal.deal_lead_source__c (custom, stamp-once) |
| `sls_opportunities.lead_source_detail` | deal.deal_lead_source_detail__c (custom, stamp-once) |
| `sls_opportunities.discovery_meeting_status` | deal.discovery_meeting_status__c (custom) |
| `sls_opportunities.discovery_meeting_date` | deal.discovery_meeting_date__c (custom) |
| `sls_opportunities.sdr_id` | deal.sdr__c (custom; HubSpot user reference) |
| `sls_opportunities.owner_id` | deal.hubspot_owner_id |
| `sls_opportunities.ai_risk_band` | deal.ai_risk_band__c (custom, written back) |
| `sls_opportunities.ai_close_probability` | deal.ai_close_probability__c (custom, written back) |
| `sls_opportunities.ai_next_action` | deal.ai_next_action__c (custom, written back) |

## Appendix B: Engagement Score & Touch Type Reference

The `mkt_touches.touch_type` enum drives `engagement_score`. Touches with score 0 are not inserted at all.

| touch_type | engagement_score | Notes |
|---|---|---|
| Email Open | — | Not recorded |
| Email Click | 30 | Counts |
| Webinar Registration | 60 | Same weight as attendance |
| Webinar Attendance | 60 | No bonus over registration |
| Form: Demo Request | 100 | Highest-intent touch |
| Form: Contact Us | 95 | |
| Form: Content Download | 40 | |
| Trade Show: Booked Meeting | 90 | |
| Trade Show: Badge Scan | 25 | Low-intent — most badges scanned for swag |
| Field Event Attendance | 80 | |
| Pricing Page View | 70 | |
| ROI Calculator Use | 75 | |
| Demo Video View (>50%) | 45 | |
| Partner Referral Submitted | 85 | |
| Sales-Generated Touch | 30 | |
| ABM Account Visit | 25 | |
| PPC Click | 20 | |
| Social Ad Click | 20 | |
| Website Direct Visit (key page) | 15 | Pricing/integrations/security pages |
| ZoomInfo Add | 10 | Acquisition signal, not engagement |

## Appendix C: Stage Model & Default Probability Reference

Pre-pipeline (lives on the contact, not the deal): MQL → SQL → Discovery Meeting Booked.

In-pipeline:

| # | Stage | Meaning | Default Probability |
|---|---|---|---|
| 0 | Discovery Meeting Set | Discovery meeting booked, not yet held. SDR owns the lead-in. | 5% |
| 1 | Discovery | Discovery meeting completed; BANT/qualification confirmed. AE takes ownership. | 15% |
| 2 | Solution Validation | Demo delivered, requirements documented, evaluation scope agreed. | 25% |
| 3 | Proof of Concept | Sandbox/POC running, success criteria defined, executive sponsor identified. | 45% |
| 4 | Proposal / Quote | Formal proposal delivered, pricing agreed in principle. | 65% |
| 5 | Negotiation & Procurement | Security review, MSA, legal redlines, signature workflow. | 85% |
| 6 | Closed Won | Signed. | 100% |

Closed Lost is parallel — can happen from any stage including Stage 0.

**Discovery meeting status → deal stage mapping:**

| discovery_meeting_status | Deal Stage | Notes |
|---|---|---|
| Scheduled | Stage 0 | In pipeline |
| Rescheduling | Stage 0 | In pipeline |
| No Show - Rescheduling | Stage 0 | Recoverable; in pipeline |
| No Show | Closed Lost | lost_reason = "Discovery Meeting No Show" |
| Disqualified | Closed Lost | lost_reason = "Disqualified Pre-Discovery" |
| Held | Stage 1 | AE takes ownership; SDR retains attribution via sdr_id |

## Appendix D: Influence Weight Formula Reference

Per Lead Source over trailing 12 months, recomputed nightly into `mv_lead_source_influence_weights`:

```
deals_with_source       = distinct deals where any associated contact had a touch
                          from this source within 365-day lookback before deal creation
closed_won_with_source  = subset that closed won
closed_lost_with_source = subset that closed lost

win_rate_present  = closed_won_with_source / (closed_won_with_source + closed_lost_with_source)
volume_factor     = sqrt(deals_with_source)
influence_weight  = win_rate_present × volume_factor
```

**Per-contact influence score** (input to Lead Scoring agent):

```
For each contact:
  for each lead_source the contact has touched (within 365d lookback):
    take the top 5 touches by engagement_score
    apply time decay: touch_weight = engagement_score × 0.5^(days_old / 90)
    if contact is the Champion on any deal: × 2
    sum the touches → contact_source_subscore
  contact_influence_score = sum across all sources of (contact_source_subscore × influence_weight[source])
```

**Per-deal influence score** (input to Deal Close Probability agent):

```
For each deal:
  consider only PRE-deal-creation touches (within 365d before created_date)
  aggregate across all associated contacts (Champion's touches × 2)
  also aggregate at company-level (any contact at the company who touched a source)
  apply same time-decay and source-weight formula
  combine with Industry × Company Size × Deal-Stamped Lead Source baseline rates
```

**Feature importance order for deal close probability:**
Industry > Company Size > Lead Sources Touched (influence-weighted) > Lead Source Detail.

## Appendix E: Version History

**v1.0 (initial scoping)** — first pass, four-phase build, single-source lead source field, 7-stage model.

**v2.0 (this version)** — incorporates all phase-1 refinements: dropped `compliance_frameworks`; added `company_size`; four-field lead source model on contacts and stamp-once two-field model on deals; deduped 10-value lead source enum; Lead Source Detail naming convention; `sls_opportunity_contacts` join table with Champion designation; deal field inheritance from company and Champion; engagement score lookup table; influence weight formula and supporting views; 7-stage model (0–6) replacing 7-8 stage model; Discovery Meeting status enum and supporting fields; SDR/AE dual-ownership fields; Pipeline & Sales Velocity dashboard expanded with 5 panels including Discovery Meeting Operations; dashboard renamed "Unit Economics & Channel ROI"; consolidated Phase plan to 5 phases; AI agents write to dedicated fields; Forecast Assistant simplified; single-login no-persona auth; public GitHub + daily simulated sync; GRC-fluent voice; per-agent $5/day budget cap.
