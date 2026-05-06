"""
spend.py — Generate fin_spend_monthly and fin_margin rows.

36 months of history.
Spend channels mapped to lead sources for CAC-by-source view.
Gross margin ~72% (typical SaaS).
"""

import uuid
import random
from datetime import date
from dateutil.relativedelta import relativedelta

from .constants import RANDOM_SEED

# Monthly spend ranges per category
SPEND_RANGES = {
    ("Paid Search",       "PPC"):              (18_000, 35_000),
    ("Social Ads",        "Social Ad"):        (8_000,  18_000),
    ("Events",            "Trade Show"):       (15_000, 80_000),
    ("Events",            "Field Event"):      (10_000, 40_000),
    ("Content",           "Website"):          (5_000,  15_000),
    ("ABM",               "ABM"):              (8_000,  25_000),
    ("Partner",           "Partner"):          (3_000,  12_000),
    ("Field Marketing",   "Field Event"):      (5_000,  20_000),
    ("Sales Headcount",   None):               (85_000, 110_000),
    ("SDR Headcount",     None):               (22_000, 32_000),
    ("Tools & Technology",None):               (12_000, 25_000),
    ("Other",             None):               (5_000,  15_000),
}


def generate_spend() -> tuple[list[dict], list[dict]]:
    random.seed(RANDOM_SEED + 50)

    spend_rows = []
    margin_rows = []

    today = date.today()
    # 36 months back
    start_month = today - relativedelta(months=35)
    start_month = start_month.replace(day=1)

    current = start_month
    while current <= today.replace(day=1):
        monthly_revenue = random.uniform(2_400_000, 3_200_000)  # growing SaaS
        growth_factor = 1.0 + (current - start_month).days / 365 * 0.28  # ~28% YoY
        monthly_revenue *= growth_factor / 12
        cogs = monthly_revenue * random.uniform(0.26, 0.30)
        gross_margin = 1 - cogs / monthly_revenue

        margin_rows.append({
            "id":               str(uuid.uuid4()),
            "fiscal_month":     current.isoformat(),
            "gross_margin_pct": round(gross_margin, 4),
            "cogs":             round(cogs, 2),
            "revenue":          round(monthly_revenue, 2),
            "created_at":       current.isoformat(),
        })

        seen_categories = set()
        for (category, channel), (lo, hi) in SPEND_RANGES.items():
            key = (current.isoformat(), category)
            if key in seen_categories:
                continue
            seen_categories.add(key)

            # Events spike in spring/fall
            if category == "Events" and current.month not in (3, 4, 5, 9, 10, 11):
                amount = random.uniform(lo * 0.2, lo * 0.5)
            else:
                amount = random.uniform(lo, hi) * growth_factor

            spend_rows.append({
                "id":           str(uuid.uuid4()),
                "fiscal_month": current.isoformat(),
                "category":     category,
                "channel":      channel,
                "amount":       round(amount, 2),
                "created_at":   current.isoformat(),
            })

        current += relativedelta(months=1)

    return spend_rows, margin_rows
