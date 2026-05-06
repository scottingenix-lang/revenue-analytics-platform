"""
health_scores.py — Generate cs_health_scores, cs_tickets, prod_usage_daily.

Correlations built in (per spec):
- Expansion correlates with usage growth
- Churn precedes a multi-week usage decline
- Health score blends usage, support load, exec sponsor, renewal proximity
"""

import uuid
import random
import numpy as np
from datetime import date, timedelta

from .constants import RANDOM_SEED


def _health_tier(score: int) -> str:
    if score >= 70:
        return "Green"
    elif score >= 40:
        return "Yellow"
    return "Red"


def generate_health_scores(
    companies: list[dict],
    subscriptions: list[dict],
) -> tuple[list[dict], list[dict], list[dict]]:
    """Returns (health_scores, cs_tickets, prod_usage_daily)."""
    random.seed(RANDOM_SEED + 40)
    np.random.seed(RANDOM_SEED + 40)

    health_scores = []
    cs_tickets    = []
    prod_usage    = []

    sub_by_company = {s["company_id"]: s for s in subscriptions}

    for company in companies:
        if not company["is_customer"]:
            continue

        cid = company["id"]
        sub = sub_by_company.get(cid)
        if not sub:
            continue

        start_date = date.fromisoformat(sub["start_date"])
        end_date   = date.fromisoformat(sub["end_date"])
        status     = sub["status"]

        # Base usage trajectory
        # Churned companies show usage decline in final 60 days
        is_churned = status == "churned"
        days_range = min(365, (date.today() - start_date).days)
        if days_range < 1:
            continue

        # Generate daily usage for the last 90 days (or subscription duration if shorter)
        snapshot_days = min(90, days_range)

        for d in range(snapshot_days, -1, -1):
            snap_date = date.today() - timedelta(days=d)
            if snap_date < start_date or snap_date > date.today():
                continue

            days_into_sub = (snap_date - start_date).days

            # Usage trajectory
            if is_churned:
                days_to_end = (end_date - snap_date).days
                if days_to_end < 0:
                    decline_factor = max(0.1, 1.0 + days_to_end / 60.0)
                else:
                    decline_factor = 1.0
                active_users = max(1, int(random.gauss(8, 2) * decline_factor))
                sessions     = max(1, int(random.gauss(25, 5) * decline_factor))
            else:
                # Growing usage for healthy customers
                growth = min(1.5, 1.0 + days_into_sub / 730)
                active_users = max(1, int(random.gauss(10, 3) * growth))
                sessions     = max(1, int(random.gauss(35, 8) * growth))

            features_used = random.randint(1, min(15, active_users * 2))
            api_calls     = sessions * random.randint(5, 50)

            prod_usage.append({
                "id":            str(uuid.uuid4()),
                "company_id":    cid,
                "snapshot_date": snap_date.isoformat(),
                "active_users":  active_users,
                "sessions":      sessions,
                "features_used": features_used,
                "api_calls":     api_calls,
                "created_at":    snap_date.isoformat(),
            })

        # Health score snapshot (last 90 days)
        for d in range(snapshot_days, -1, -1):
            snap_date = date.today() - timedelta(days=d)
            if snap_date < start_date or snap_date > date.today():
                continue

            days_to_renewal = (end_date - snap_date).days
            renewal_proximity_score = max(0, min(100, int(100 - max(0, 90 - days_to_renewal) * 1.5)))

            if is_churned:
                days_to_end = (end_date - snap_date).days
                if days_to_end < 0:
                    usage_score = random.randint(5, 30)
                elif days_to_end < 60:
                    usage_score = random.randint(20, 50)
                else:
                    usage_score = random.randint(50, 80)
            else:
                usage_score = random.randint(55, 95)

            support_load_score = 100 - random.randint(0, 40)  # low tickets = high score
            exec_sponsor_score = random.randint(40, 100)

            weights = [0.40, 0.25, 0.20, 0.15]
            overall = int(
                weights[0] * usage_score +
                weights[1] * support_load_score +
                weights[2] * exec_sponsor_score +
                weights[3] * renewal_proximity_score
            )
            overall = max(0, min(100, overall))

            health_scores.append({
                "id":                    str(uuid.uuid4()),
                "company_id":            cid,
                "snapshot_date":         snap_date.isoformat(),
                "overall_score":         overall,
                "health_tier":           _health_tier(overall),
                "usage_score":           usage_score,
                "support_load_score":    support_load_score,
                "exec_sponsor_score":    exec_sponsor_score,
                "renewal_proximity_score": renewal_proximity_score,
                "created_at":            snap_date.isoformat(),
            })

        # Support tickets (3–15 per customer over subscription life)
        n_tickets = random.randint(3, 15)
        priorities = ["Low", "Normal", "High", "Urgent"]
        pw = [0.30, 0.45, 0.18, 0.07]
        for _ in range(n_tickets):
            ticket_days = random.randint(0, days_range)
            ticket_date = start_date + timedelta(days=ticket_days)
            if ticket_date > date.today():
                continue
            resolved = ticket_date + timedelta(days=random.randint(1, 14))
            if resolved > date.today():
                resolved = None
                status_val = "Open"
            else:
                status_val = "Solved"

            cs_tickets.append({
                "id":            str(uuid.uuid4()),
                "company_id":    cid,
                "contact_id":    None,   # patched optionally
                "subject":       random.choice([
                    "User access issue", "Report not loading", "API rate limit question",
                    "Workflow configuration help", "Data import error", "SSO setup",
                    "Dashboard permissions", "Audit log export", "Integration question",
                ]),
                "status":        status_val,
                "priority":      random.choices(priorities, weights=pw)[0],
                "created_date":  ticket_date.isoformat(),
                "resolved_date": resolved.isoformat() if resolved else None,
                "csat_score":    random.randint(3, 5) if resolved else None,
                "created_at":    ticket_date.isoformat(),
                "updated_at":    (resolved or ticket_date).isoformat(),
            })

    return health_scores, cs_tickets, prod_usage
