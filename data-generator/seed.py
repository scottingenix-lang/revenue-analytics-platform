#!/usr/bin/env python3
"""
seed.py — Deterministic data generator for the Revenue Analytics Platform.

Usage:
    python seed.py              # generate CSVs only
    python seed.py --load       # generate + COPY into local Supabase
    python seed.py --load --cloud  # generate + COPY into cloud Supabase

Requirements:
    pip install -r requirements.txt

The script generates all CSVs into output/, then (if --load) uses psycopg2
to COPY them into Postgres in dependency order.
"""

import argparse
import csv
import os
import sys
import time
from pathlib import Path

# Ensure generators/ is importable
sys.path.insert(0, str(Path(__file__).parent))

from generators.companies       import generate_companies
from generators.contacts        import generate_contacts
from generators.campaigns       import generate_campaigns, generate_touches
from generators.opportunities   import generate_users, generate_opportunities
from generators.subscriptions   import generate_subscriptions
from generators.health_scores   import generate_health_scores
from generators.spend           import generate_spend
from generators.goals           import generate_goals
from generators.constants       import RANDOM_SEED

OUTPUT_DIR = Path(__file__).parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)


# ── CSV helpers ───────────────────────────────────────────────

def write_csv(rows: list[dict], filename: str) -> Path:
    if not rows:
        print(f"  [skip] {filename} — 0 rows")
        return OUTPUT_DIR / filename
    path = OUTPUT_DIR / filename
    keys = [k for k in rows[0].keys() if not k.startswith("_")]
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=keys, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    print(f"  {filename}: {len(rows):,} rows")
    return path


# ── Main generation pipeline ──────────────────────────────────

def generate_all() -> dict[str, list[dict]]:
    print("\n=== Phase 1 Data Generator (seed={}) ===\n".format(RANDOM_SEED))

    t0 = time.time()

    print("[1/9] Companies...")
    companies = generate_companies()
    write_csv(companies, "mkt_companies.csv")

    print("[2/9] Users (sales team)...")
    users = generate_users()
    write_csv(users, "sls_users.csv")

    print("[3/9] Contacts...")
    contacts, company_contacts = generate_contacts(companies)
    # Patch owner_id onto contacts from SDR pool
    import random
    random.seed(RANDOM_SEED + 99)
    sdrs = [u for u in users if u["role"] == "SDR"]
    for c in contacts:
        c["owner_id"] = random.choice(sdrs)["id"] if sdrs else None
    # Patch hubspot_owner_id onto companies
    aes = [u for u in users if u["role"] == "AE"]
    for co in companies:
        co["hubspot_owner_id"] = random.choice(aes)["id"] if aes else None
    write_csv(contacts, "mkt_contacts.csv")
    # Re-write companies now that hubspot_owner_id is set
    write_csv(companies, "mkt_companies.csv")

    print("[4/9] Campaigns...")
    campaigns = generate_campaigns()
    write_csv(campaigns, "mkt_campaigns.csv")

    print("[5/9] Opportunities, contacts, history, activities...")
    opportunities, opp_contacts, opp_history, activities, post_deal_updates = \
        generate_opportunities(companies, contacts, company_contacts, users)

    # Apply post-deal lead_source updates (the ~1% DQ mismatch records)
    contact_by_id = {c["id"]: c for c in contacts}
    for upd in post_deal_updates:
        c = contact_by_id.get(upd["contact_id"])
        if c:
            c["lead_source"]        = upd["new_lead_source"]
            c["lead_source_detail"] = upd["new_lead_source_detail"]
    # Re-write contacts with updated lead_sources
    write_csv(contacts, "mkt_contacts.csv")

    write_csv(opportunities, "sls_opportunities.csv")
    write_csv(opp_contacts,  "sls_opportunity_contacts.csv")
    write_csv(opp_history,   "sls_opportunity_history.csv")
    write_csv(activities,    "sls_activities.csv")

    print("[6/9] Touches & campaign members...")
    touches, campaign_members = generate_touches(contacts, campaigns, opportunities)
    write_csv(touches,          "mkt_touches.csv")
    write_csv(campaign_members, "mkt_campaign_members.csv")

    print("[7/9] Subscriptions & ARR movements...")
    subscriptions, arr_movements = generate_subscriptions(companies, opportunities)
    write_csv(subscriptions, "sub_subscriptions.csv")
    write_csv(arr_movements, "sub_arr_movements.csv")

    print("[8/9] Health scores, tickets, usage, spend, margin...")
    health_scores, cs_tickets, prod_usage = generate_health_scores(companies, subscriptions)
    spend_rows, margin_rows = generate_spend()

    write_csv(health_scores, "cs_health_scores.csv")
    write_csv(cs_tickets,    "cs_tickets.csv")
    write_csv(prod_usage,    "prod_usage_daily.csv")
    write_csv(spend_rows,    "fin_spend_monthly.csv")
    write_csv(margin_rows,   "fin_margin.csv")

    print("[9/9] Revenue goals, quotas, campaign forecasts (v2.1)...")
    revenue_goals, pipeline_source_goals, quotas, campaign_forecasts = \
        generate_goals(users, campaigns)
    write_csv(revenue_goals,          "fin_revenue_goals.csv")
    write_csv(pipeline_source_goals,  "fin_pipeline_source_goals.csv")
    write_csv(quotas,                 "sls_quotas.csv")
    write_csv(campaign_forecasts,     "mkt_campaign_forecast.csv")

    # Update company contact/deal counts
    from collections import Counter
    deal_counts = Counter(o["company_id"] for o in opportunities)
    contact_counts = Counter(c["company_id"] for c in contacts)
    for co in companies:
        co["num_associated_contacts"] = contact_counts.get(co["id"], 0)
        co["num_associated_deals"]    = deal_counts.get(co["id"], 0)
    write_csv(companies, "mkt_companies.csv")

    elapsed = time.time() - t0
    total_rows = sum([
        len(companies), len(contacts), len(campaigns), len(campaign_members),
        len(touches), len(opportunities), len(opp_contacts), len(opp_history),
        len(activities), len(subscriptions), len(arr_movements),
        len(health_scores), len(cs_tickets), len(prod_usage),
        len(spend_rows), len(margin_rows), len(users),
        # v2.1
        len(revenue_goals), len(pipeline_source_goals), len(quotas), len(campaign_forecasts),
    ])
    print(f"\n[OK] Generated {total_rows:,} total rows in {elapsed:.1f}s")
    print(f"  CSVs written to: {OUTPUT_DIR}\n")

    return {
        "companies": companies, "contacts": contacts, "campaigns": campaigns,
        "campaign_members": campaign_members, "touches": touches,
        "opportunities": opportunities, "opp_contacts": opp_contacts,
        "opp_history": opp_history, "activities": activities,
        "users": users, "subscriptions": subscriptions,
        "arr_movements": arr_movements, "health_scores": health_scores,
        "cs_tickets": cs_tickets, "prod_usage": prod_usage,
        "spend": spend_rows, "margin": margin_rows,
        # v2.1
        "revenue_goals": revenue_goals, "pipeline_source_goals": pipeline_source_goals,
        "quotas": quotas, "campaign_forecasts": campaign_forecasts,
    }


# ── Database load ─────────────────────────────────────────────

COPY_ORDER = [
    # (csv_filename, table_name)
    ("sls_users.csv",                   "sls_users"),
    ("mkt_companies.csv",               "mkt_companies"),
    ("mkt_contacts.csv",                "mkt_contacts"),
    ("mkt_campaigns.csv",               "mkt_campaigns"),
    ("mkt_campaign_members.csv",        "mkt_campaign_members"),
    ("mkt_touches.csv",                 "mkt_touches"),
    ("sls_opportunities.csv",           "sls_opportunities"),
    ("sls_opportunity_contacts.csv",    "sls_opportunity_contacts"),
    ("sls_opportunity_history.csv",     "sls_opportunity_history"),
    ("sls_activities.csv",              "sls_activities"),
    ("sub_subscriptions.csv",           "sub_subscriptions"),
    ("sub_arr_movements.csv",           "sub_arr_movements"),
    ("cs_health_scores.csv",            "cs_health_scores"),
    ("cs_tickets.csv",                  "cs_tickets"),
    ("prod_usage_daily.csv",            "prod_usage_daily"),
    ("fin_spend_monthly.csv",           "fin_spend_monthly"),
    ("fin_margin.csv",                  "fin_margin"),
    # v2.1 — goals and quotas (no FK deps on each other except sls_quotas → sls_users
    #         and mkt_campaign_forecast → mkt_campaigns, both already loaded above)
    ("fin_revenue_goals.csv",           "fin_revenue_goals"),
    ("fin_pipeline_source_goals.csv",   "fin_pipeline_source_goals"),
    ("sls_quotas.csv",                  "sls_quotas"),
    ("mkt_campaign_forecast.csv",       "mkt_campaign_forecast"),
]

MATERIALIZED_VIEWS = [
    "mv_arr_daily",
    "mv_funnel_conversion_monthly",
    "mv_attribution_first_touch",
    "mv_attribution_last_touch",
    "mv_attribution_linear",
    "mv_attribution_time_decay",
    "mv_attribution_w_shaped",
    "mv_pipeline_coverage_weekly",
    "mv_cohort_retention_monthly",
    "mv_lead_source_influence_weights",
    "mv_cac_by_source_quarterly",
    "mv_stage_velocity_stats",
    "mv_overall_cycle_stats",
    "mv_discovery_meeting_ops",
    # v2.1 — refresh in dependency order (mv_pipeline_lag_forecast reads mv_overall_cycle_stats)
    "mv_source_conversion_rates",
    "mv_attainment_by_period",
    "mv_pipeline_lag_forecast",
    "mv_rep_attainment",
]


def load_to_db(db_url: str):
    try:
        import psycopg2
    except ImportError:
        print("ERROR: psycopg2 not installed. Run: pip install psycopg2-binary")
        sys.exit(1)

    print(f"\n=== Loading CSVs into Postgres ===\n  {db_url}\n")
    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    cur = conn.cursor()

    # Truncate in reverse FK order before loading
    truncate_order = [t for _, t in reversed(COPY_ORDER)]
    cur.execute("TRUNCATE " + ", ".join(truncate_order) + " RESTART IDENTITY CASCADE;")
    conn.commit()
    print("  Truncated all tables.\n")

    for csv_file, table in COPY_ORDER:
        path = OUTPUT_DIR / csv_file
        if not path.exists():
            print(f"  [skip] {csv_file} not found")
            continue
        with open(path, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            header = next(reader)
            cols = ", ".join(f'"{c}"' for c in header)
            try:
                cur.copy_expert(
                    f"COPY {table} ({cols}) FROM STDIN WITH (FORMAT csv, HEADER true, NULL '')",
                    open(path, "r", encoding="utf-8")
                )
                print(f"  [OK] {table}")
            except Exception as e:
                conn.rollback()
                print(f"  [ERR] {table}: {e}")
                raise

    conn.commit()

    print("\n=== Refreshing materialized views ===\n")
    conn.autocommit = True
    for mv in MATERIALIZED_VIEWS:
        try:
            cur.execute(f"REFRESH MATERIALIZED VIEW CONCURRENTLY {mv};")
            print(f"  [OK] {mv}")
        except Exception as e:
            # Fall back to non-concurrent refresh (view may be empty)
            try:
                cur.execute(f"REFRESH MATERIALIZED VIEW {mv};")
                print(f"  [OK] {mv} (non-concurrent)")
            except Exception as e2:
                print(f"  [ERR] {mv}: {e2}")

    cur.close()
    conn.close()
    print("\n[OK] Database load complete.\n")


# ── Entry point ───────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Revenue Analytics seed generator")
    parser.add_argument("--load",  action="store_true", help="COPY CSVs into Postgres")
    parser.add_argument("--cloud", action="store_true", help="Use cloud Supabase DB URL instead of local")
    args = parser.parse_args()

    generate_all()

    if args.load:
        if args.cloud:
            db_url = os.environ.get("DATABASE_URL_CLOUD") or os.environ.get("DATABASE_URL")
            if not db_url:
                print("ERROR: Set DATABASE_URL_CLOUD or DATABASE_URL in environment")
                sys.exit(1)
        else:
            db_url = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")

        load_to_db(db_url)
