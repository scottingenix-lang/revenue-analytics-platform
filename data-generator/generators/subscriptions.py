"""
subscriptions.py — Generate sub_subscriptions and sub_arr_movements.

Targets:
- ~$32M total ARR across ~320 active customers
- 112% NRR, 94% GRR
- 28% YoY ARR growth
- ACV: median $85K, top 10 > $300K, long tail to $25K
- 3-year history of ARR movements
"""

import uuid
import random
import numpy as np
from datetime import date, timedelta
from typing import Optional

from .constants import (
    RANDOM_SEED,
    NUM_CUSTOMERS,
    TARGET_ARR,
    TARGET_NRR,
    TARGET_GRR,
    DEAL_ARR_MIN,
    PRODUCT_LINES,
    SEGMENT_CUSTOMER_DIST,
)

PRODUCT_LINE_LIST = list(PRODUCT_LINES)


def _quarter_label(d: date) -> str:
    q = (d.month - 1) // 3 + 1
    return f"Q{q}-{d.year}"


def generate_subscriptions(
    companies: list[dict],
    opportunities: list[dict],
) -> tuple[list[dict], list[dict]]:
    """Returns (subscriptions, arr_movements)."""
    random.seed(RANDOM_SEED + 30)
    np.random.seed(RANDOM_SEED + 30)

    customer_companies = [c for c in companies if c["is_customer"]]
    opp_by_company: dict[str, list] = {}
    for o in opportunities:
        if o["stage"] == "6":
            opp_by_company.setdefault(o["company_id"], []).append(o)

    subscriptions = []
    arr_movements = []

    # Scale factor so total active ARR ≈ TARGET_ARR
    # We'll compute a raw total and then apply a scalar after generation
    raw_subs = []

    for company in customer_companies:
        cid = company["id"]
        segment = company.get("company_size") or "Mid-Market"

        # ARR per segment
        arr_medians = {"SMB": 35_000, "Mid-Market": 85_000, "Enterprise": 220_000}
        median = arr_medians.get(segment, 85_000)
        arr = max(DEAL_ARR_MIN, median * np.exp(random.gauss(0, 0.45)))
        arr = round(arr, -2)

        # Subscription dates (3-year history; most customers joined 1–2 years ago)
        start_days_ago = random.randint(90, 1095)
        start = date.today() - timedelta(days=start_days_ago)
        term = random.choices([12, 24, 36], weights=[0.05, 0.05, 0.90])[0]
        end = start + timedelta(days=term * 30)

        status = "active" if end >= date.today() else "churned"
        churned_at = end if status == "churned" else None

        # Link to a won opportunity if available
        won_opps = opp_by_company.get(cid, [])
        opp_id = won_opps[0]["id"] if won_opps else None

        product = random.choice(PRODUCT_LINE_LIST)

        sub_id = str(uuid.uuid4())
        raw_subs.append({
            "id":            sub_id,
            "company_id":    cid,
            "opportunity_id":opp_id,
            "product_line":  product,
            "status":        status,
            "arr":           arr,
            "tcv":           round(arr * term / 12, 2),
            "term_months":   term,
            "start_date":    start.isoformat(),
            "end_date":      end.isoformat(),
            "renewal_date":  (end + timedelta(days=30)).isoformat() if status == "active" else None,
            "contracted_at": start.isoformat(),
            "churned_at":    churned_at.isoformat() if churned_at else None,
            "created_at":    start.isoformat(),
            "updated_at":    start.isoformat(),
        })

    # Scale ARR so active total ≈ $32M
    active_raw_total = sum(s["arr"] for s in raw_subs if s["status"] == "active")
    scale = TARGET_ARR / max(active_raw_total, 1)

    for s in raw_subs:
        s["arr"]  = round(s["arr"] * scale, 2)
        s["tcv"]  = round(s["tcv"] * scale, 2)
        subscriptions.append(s)

    # ARR movement ledger
    for sub in subscriptions:
        start   = date.fromisoformat(sub["start_date"])
        arr     = sub["arr"]
        cid     = sub["company_id"]
        sub_id  = sub["id"]

        # New ARR event at start
        arr_movements.append({
            "id":             str(uuid.uuid4()),
            "company_id":     cid,
            "subscription_id":sub_id,
            "movement_type":  "New",
            "arr_delta":      arr,
            "arr_before":     0,
            "arr_after":      arr,
            "effective_date": start.isoformat(),
            "fiscal_quarter": _quarter_label(start),
            "created_at":     start.isoformat(),
        })

        # Expansion events — annual upsell cycle, 60% hit rate per year
        # Generates realistic NRR > 100% by letting long-term customers expand repeatedly
        subscription_age_years = max(1, start_days_ago // 365)
        running_arr = arr
        for yr in range(1, subscription_age_years + 1):
            if random.random() < 0.70:
                exp_date = start + timedelta(days=yr * 365 + random.randint(-45, 45))
                if exp_date < date.today():
                    delta = round(running_arr * random.uniform(0.18, 0.42), 2)
                    arr_movements.append({
                        "id":             str(uuid.uuid4()),
                        "company_id":     cid,
                        "subscription_id":sub_id,
                        "movement_type":  "Expansion",
                        "arr_delta":      delta,
                        "arr_before":     running_arr,
                        "arr_after":      running_arr + delta,
                        "effective_date": exp_date.isoformat(),
                        "fiscal_quarter": _quarter_label(exp_date),
                        "created_at":     exp_date.isoformat(),
                    })
                    running_arr += delta

        # Churn event for churned subscriptions
        if sub["status"] == "churned":
            churn_date = date.fromisoformat(sub["end_date"])
            arr_movements.append({
                "id":             str(uuid.uuid4()),
                "company_id":     cid,
                "subscription_id":sub_id,
                "movement_type":  "Churn",
                "arr_delta":      -arr,
                "arr_before":     arr,
                "arr_after":      0,
                "effective_date": churn_date.isoformat(),
                "fiscal_quarter": _quarter_label(churn_date),
                "created_at":     churn_date.isoformat(),
            })

    return subscriptions, arr_movements
