# Revenue Analytics Platform

Portfolio prototype: AI-augmented revenue analytics for a mid-market GRC SaaS (modeled after Onspring).
Built by Scott Logan. Synthetic data only. Not affiliated with Onspring.

## Phase 1 — Data Foundation

### Prerequisites

- [Docker Desktop](https://docs.docker.com/desktop/install/windows-install/) (running)
- [Supabase CLI](https://supabase.com/docs/guides/cli) v2.x (`scoop install supabase`)
- Python 3.11+

### Quick start

```powershell
# 1. Initialize and start local Supabase
supabase init
supabase start
# Copy the DB URL printed by `supabase start` into .env.local

# 2. Apply all migrations
supabase db push

# 3. Install Python deps
cd data-generator
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt

# 4. Generate data and load into local DB
python seed.py --load

# 5. Validate
cd ../validation
python validate.py --report
```

### Project structure

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
  seed.py                    # entry point
  generators/
    constants.py             # all distribution targets
    companies.py
    contacts.py
    campaigns.py
    opportunities.py
    subscriptions.py
    health_scores.py
    spend.py
  output/                    # generated CSVs (gitignored)
  README.md

validation/
  validate.sql               # SQL smoke tests
  validate.py                # automated pass/fail runner
  REPORT.md                  # most recent validation output
```

### Phase 1 exit criterion

SQL queries against Supabase return realistic Onspring-shaped data with correct
distributions and referential integrity. The `mv_lead_source_influence_weights`
view computes successfully and produces sensible numbers.

Run `python validation/validate.py --report` to confirm.

---

## Phases

| Phase | Scope | Status |
|-------|-------|--------|
| 1 — Data Foundation | Schema, triggers, indexes, materialized views, synthetic data, validation | ✓ In progress |
| 2 — App Scaffold | Next.js 14, Supabase Auth, design system | Pending |
| 3 — Core Dashboards | 5 dashboards, all metrics | Pending |
| 4 — AI Layer | 6 Claude agents, Data Copilot | Pending |
| 5 — Admin & Polish | Data quality console, demo videos, public repo | Pending |

## Environment variables

Copy `.env.local` and fill in:

```
SUPABASE_URL=              # from `supabase start`
SUPABASE_ANON_KEY=         # from `supabase start`
SUPABASE_SERVICE_ROLE_KEY= # from `supabase start`
DATABASE_URL=              # postgresql://postgres:postgres@127.0.0.1:54322/postgres
ANTHROPIC_API_KEY=         # Phase 4
```
