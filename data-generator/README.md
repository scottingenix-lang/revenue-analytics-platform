# Data Generator

Deterministic synthetic data generator for the Revenue Analytics Platform.
Fixed seed (`RANDOM_SEED = 42`) — re-runs produce identical output.

## Setup

```bash
cd data-generator
python -m venv .venv
.venv\Scripts\activate      # Windows
pip install -r requirements.txt
```

## Generate CSVs only

```bash
python seed.py
```

CSVs are written to `output/` (gitignored).

## Generate + load into local Supabase

Make sure `supabase start` is running first.

```bash
python seed.py --load
```

Uses `DATABASE_URL` from environment, defaulting to:
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`

## Generate + load into cloud Supabase

```bash
export DATABASE_URL_CLOUD="postgresql://postgres:[password]@[host]:5432/postgres"
python seed.py --load --cloud
```

## Output files

| File | Table | ~Rows |
|------|-------|-------|
| mkt_companies.csv | mkt_companies | 1,480 |
| mkt_contacts.csv | mkt_contacts | 5,500 |
| mkt_campaigns.csv | mkt_campaigns | 45 |
| mkt_campaign_members.csv | mkt_campaign_members | 8,000 |
| mkt_touches.csv | mkt_touches | 18,000 |
| sls_users.csv | sls_users | 32 |
| sls_opportunities.csv | sls_opportunities | 1,480 |
| sls_opportunity_contacts.csv | sls_opportunity_contacts | 4,500 |
| sls_opportunity_history.csv | sls_opportunity_history | 6,000 |
| sls_activities.csv | sls_activities | 8,000 |
| sub_subscriptions.csv | sub_subscriptions | 320 |
| sub_arr_movements.csv | sub_arr_movements | 500 |
| cs_health_scores.csv | cs_health_scores | 29,000 |
| cs_tickets.csv | cs_tickets | 2,500 |
| prod_usage_daily.csv | prod_usage_daily | 29,000 |
| fin_spend_monthly.csv | fin_spend_monthly | 432 |
| fin_margin.csv | fin_margin | 36 |

Total: ~115,000 rows
