#!/usr/bin/env python3
"""
validate.py — Automated pass/fail validation against Section 9 targets.

Usage:
    python validate.py                        # local Supabase
    python validate.py --cloud                # cloud Supabase
    python validate.py --report               # write REPORT.md

Requires: psycopg2-binary
"""

import argparse
import os
import sys
from datetime import date
from pathlib import Path

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("ERROR: psycopg2 not installed. Run: pip install psycopg2-binary")
    sys.exit(1)

PASS = "✓ PASS"
FAIL = "✗ FAIL"
WARN = "⚠ WARN"

results = []


def check(name: str, actual, target, tolerance_pct: float = 5.0, unit: str = "",
          absolute: bool = False) -> str:
    """Compare actual vs target.
    If absolute=True (used for % distributions), tolerance_pct means ±N percentage points.
    Otherwise tolerance_pct means ±N% relative to target.
    """
    if actual is None:
        status = WARN
        msg = f"{name}: actual=None, target={target}{unit}"
    elif isinstance(target, (int, float)):
        delta = abs(float(actual) - float(target))
        if tolerance_pct == 0:
            status = PASS if actual == target else FAIL
            msg = f"{name}: actual={actual}{unit}, target={target}{unit}"
        elif absolute:
            # Absolute percentage-point tolerance
            status = PASS if delta <= tolerance_pct else FAIL
            msg = f"{name}: actual={round(float(actual),1)}{unit}, target={target}{unit} (Δ={delta:+.2f}pp)"
        else:
            pct_delta = (delta / max(abs(float(target)), 0.001)) * 100
            status = PASS if pct_delta <= tolerance_pct else FAIL
            msg = f"{name}: actual={actual}{unit}, target={target}{unit} (Δ={delta:+.1f}, {pct_delta:.1f}%)"
    else:
        status = PASS if actual == target else FAIL
        msg = f"{name}: actual={actual}, target={target}"

    results.append((status, msg))
    icon = status.split()[0]
    print(f"  {icon} {msg}")
    return status


def run_validation(db_url: str) -> list[tuple]:
    conn = psycopg2.connect(db_url)
    cur = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)

    print("\n" + "=" * 60)
    print("  Revenue Analytics Platform — Phase 1 Validation")
    print(f"  {date.today()}")
    print("=" * 60 + "\n")

    # ── 1. Customer count ────────────────────────────────────
    print("[ Scale ]")
    cur.execute("SELECT count(*) FROM mkt_companies WHERE is_customer = true")
    check("customer_count", cur.fetchone()[0], 320, tolerance_pct=10)

    cur.execute("SELECT count(*) FROM sls_opportunities WHERE stage NOT IN ('6', 'Closed Lost')")
    check("open_opportunities", cur.fetchone()[0], 80, tolerance_pct=15)

    cur.execute("SELECT count(*) FROM sls_opportunities")
    check("total_opportunities", cur.fetchone()[0], 1480, tolerance_pct=15)

    cur.execute("SELECT round(sum(arr)/1e6, 1) FROM sub_subscriptions WHERE status = 'active'")
    check("active_arr_millions", float(cur.fetchone()[0] or 0), 32.0, tolerance_pct=15, unit="M")

    # ── 2. Vertical mix ──────────────────────────────────────
    print("\n[ Vertical Mix ]")
    targets = {
        "Financial Services": 32.0, "Healthcare": 21.0,
        "Energy & Utilities": 14.0, "Federal/Public Sector": 12.0,
        "Technology": 10.0, "Manufacturing": 6.0, "Other": 5.0,
    }
    cur.execute("""
        SELECT vertical_tag, count(*) * 100.0 / sum(count(*)) OVER () AS pct
        FROM mkt_companies GROUP BY vertical_tag
    """)
    rows = {r["vertical_tag"]: float(r["pct"]) for r in cur.fetchall()}
    for vertical, target_pct in targets.items():
        actual_pct = rows.get(vertical, 0.0)
        check(f"vertical_{vertical.replace(' ', '_')[:12]}", actual_pct, target_pct, tolerance_pct=5, unit="%", absolute=True)

    # ── 3. Segment mix (customers) ───────────────────────────
    print("\n[ Segment Mix (Customers) ]")
    seg_targets = {"SMB": 10.0, "Mid-Market": 65.0, "Enterprise": 25.0}
    cur.execute("""
        SELECT company_size, count(*) * 100.0 / sum(count(*)) OVER () AS pct
        FROM mkt_companies WHERE is_customer = true GROUP BY company_size
    """)
    rows = {r["company_size"]: float(r["pct"]) for r in cur.fetchall()}
    for seg, target_pct in seg_targets.items():
        check(f"segment_{seg}", rows.get(seg, 0.0), target_pct, tolerance_pct=5, unit="%", absolute=True)

    # ── 4. Original lead source mix ──────────────────────────
    print("\n[ Original Lead Source Mix ]")
    ls_targets = {
        "Website": 22.0, "ZoomInfo": 18.0, "Webinar": 15.0,
        "Trade Show": 10.0, "PPC": 9.0, "Field Event": 8.0,
        "Partner": 7.0, "Social Ad": 5.0, "ABM": 4.0, "Sales Generated": 2.0,
    }
    cur.execute("""
        SELECT original_lead_source,
               count(*) * 100.0 / sum(count(*)) OVER () AS pct
        FROM mkt_contacts WHERE original_lead_source IS NOT NULL
        GROUP BY original_lead_source
    """)
    rows = {r["original_lead_source"]: float(r["pct"]) for r in cur.fetchall()}
    for src, target_pct in ls_targets.items():
        check(f"orig_ls_{src.replace(' ', '_')}", rows.get(src, 0.0), target_pct, tolerance_pct=5, unit="%", absolute=True)

    # ── 5. Discovery meeting status mix ──────────────────────
    print("\n[ Discovery Meeting Status Mix ]")
    disc_targets = {
        "Held": 65.0, "No Show": 12.0, "No Show - Rescheduling": 8.0,
        "Rescheduling": 6.0, "Disqualified": 5.0, "Scheduled": 4.0,
    }
    cur.execute("""
        SELECT discovery_meeting_status,
               count(*) * 100.0 / sum(count(*)) OVER () AS pct
        FROM sls_opportunities
        WHERE discovery_meeting_date < CURRENT_DATE
        GROUP BY discovery_meeting_status
    """)
    rows = {r["discovery_meeting_status"]: float(r["pct"]) for r in cur.fetchall()}
    for status, target_pct in disc_targets.items():
        check(f"disc_{status.replace(' ', '_')[:12]}", rows.get(status, 0.0), target_pct, tolerance_pct=5, unit="%", absolute=True)

    # ── 6. Win rate ───────────────────────────────────────────
    print("\n[ Win Rate ]")
    cur.execute("""
        SELECT
          count(*) FILTER (WHERE stage = '6') * 100.0 /
          NULLIF(count(*) FILTER (WHERE stage IN ('6', 'Closed Lost')), 0)
        FROM sls_opportunities
        WHERE close_date >= CURRENT_DATE - INTERVAL '12 months'
    """)
    win_rate = float(cur.fetchone()[0] or 0)
    check("win_rate_overall", win_rate, 22.0, tolerance_pct=5, unit="%", absolute=True)

    # ── 7. Integrity checks ───────────────────────────────────
    print("\n[ Referential Integrity ]")

    cur.execute("""
        SELECT count(*) FROM sls_opportunities o
        WHERE stage NOT IN ('Closed Lost')
          AND NOT EXISTS (
            SELECT 1 FROM sls_opportunity_contacts oc
            WHERE oc.opportunity_id = o.id AND oc.is_primary = true AND oc.removed_at IS NULL
          )
    """)
    check("deals_missing_champion", cur.fetchone()[0], 0, tolerance_pct=0)

    cur.execute("""
        SELECT count(*) FROM sls_opportunities o
        JOIN mkt_companies c ON c.id = o.company_id
        WHERE o.segment != c.company_size OR o.vertical != c.vertical_tag
    """)
    check("inherited_field_violations", cur.fetchone()[0], 0, tolerance_pct=0)

    cur.execute("""
        SELECT count(*) FROM sls_opportunities o
        WHERE o.stage = '6'
          AND NOT EXISTS (
            SELECT 1 FROM sls_opportunity_history h WHERE h.opportunity_id = o.id
          )
    """)
    check("won_deals_missing_history", cur.fetchone()[0], 0, tolerance_pct=0)

    # ── 8. Data quality ───────────────────────────────────────
    print("\n[ Data Quality ]")

    cur.execute("""
        SELECT round(
          count(*) FILTER (WHERE email !~ '^[^@]+@[^@]+\\.[^@]+$') * 100.0 / count(*), 1
        ) FROM mkt_contacts
    """)
    check("malformed_email_pct", float(cur.fetchone()[0] or 0), 3.0, tolerance_pct=2, unit="%", absolute=True)

    cur.execute("""
        SELECT round(count(*) FILTER (WHERE job_title IS NULL) * 100.0 / count(*), 1)
        FROM mkt_contacts
    """)
    check("missing_job_title_pct", float(cur.fetchone()[0] or 0), 8.0, tolerance_pct=3, unit="%", absolute=True)

    cur.execute("""
        SELECT count(*) FROM sls_opportunities o
        JOIN sls_opportunity_contacts oc
          ON oc.opportunity_id = o.id AND oc.is_primary = true AND oc.removed_at IS NULL
        JOIN mkt_contacts c ON c.id = oc.contact_id
        WHERE o.lead_source IS DISTINCT FROM c.lead_source
    """)
    mismatch_count = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM sls_opportunities")
    total_opps = cur.fetchone()[0]
    mismatch_pct = mismatch_count * 100.0 / max(total_opps, 1)
    check("lead_source_mismatch_pct", round(mismatch_pct, 2), 1.0, tolerance_pct=1, unit="%", absolute=True)

    # ── 9. Influence weight view ──────────────────────────────
    print("\n[ Materialized Views ]")

    cur.execute("SELECT count(*) FROM mv_lead_source_influence_weights")
    check("influence_weight_rows", cur.fetchone()[0], 10, tolerance_pct=0)

    cur.execute("SELECT count(*) FROM mv_stage_velocity_stats")
    vel_rows = cur.fetchone()[0]
    check("stage_velocity_rows_gt_0", vel_rows > 0, True, tolerance_pct=0)

    cur.execute("SELECT count(*) FROM mv_arr_daily")
    arr_daily_rows = cur.fetchone()[0]
    check("arr_daily_rows_gt_0", arr_daily_rows > 0, True, tolerance_pct=0)

    # ── Summary ───────────────────────────────────────────────
    print("\n" + "=" * 60)
    passed = sum(1 for s, _ in results if s == PASS)
    failed = sum(1 for s, _ in results if s == FAIL)
    warned = sum(1 for s, _ in results if s == WARN)
    total  = len(results)
    print(f"  RESULT: {passed}/{total} passed  |  {failed} failed  |  {warned} warnings")
    print("=" * 60 + "\n")

    cur.close()
    conn.close()
    return results


def write_report(validation_results: list[tuple]):
    report_path = Path(__file__).parent / "REPORT.md"
    lines = [
        f"# Phase 1 Validation Report\n",
        f"**Date:** {date.today()}\n\n",
        "| Status | Check |\n",
        "|--------|-------|\n",
    ]
    for status, msg in validation_results:
        lines.append(f"| {status} | {msg} |\n")

    passed = sum(1 for s, _ in validation_results if s == PASS)
    failed = sum(1 for s, _ in validation_results if s == FAIL)
    lines.append(f"\n**{passed}/{len(validation_results)} checks passed, {failed} failed.**\n")

    with open(report_path, "w", encoding="utf-8") as f:
        f.writelines(lines)
    print(f"Report written to: {report_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--cloud",  action="store_true", help="Use cloud Supabase DB URL")
    parser.add_argument("--report", action="store_true", help="Write REPORT.md")
    args = parser.parse_args()

    if args.cloud:
        db_url = os.environ.get("DATABASE_URL_CLOUD") or os.environ.get("DATABASE_URL")
    else:
        db_url = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")

    if not db_url:
        print("ERROR: Set DATABASE_URL or DATABASE_URL_CLOUD")
        sys.exit(1)

    validation_results = run_validation(db_url)

    if args.report:
        write_report(validation_results)

    failed_count = sum(1 for s, _ in validation_results if s == FAIL)
    sys.exit(0 if failed_count == 0 else 1)
