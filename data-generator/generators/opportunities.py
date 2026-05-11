"""
opportunities.py — Generate sls_users, sls_opportunities,
                   sls_opportunity_contacts, sls_opportunity_history,
                   sls_activities.

Key rules:
- ~80 open opportunities, ~1,400 historical (3-year span)
- Stage progression walks through realistic dwell times
- sls_opportunity_history auto-populated per stage walk
- Champion = is_primary=true; exactly one per deal
- lead_source stamped from Champion's lead_source at deal creation time
  (NOTE: generator sets this directly; DB trigger also handles it at INSERT,
   but since we COPY directly we replicate the logic here)
- ~1% deals where lead_source ≠ Champion's CURRENT lead_source
  (achieved by updating the contact's lead_source after deal creation)
- SDR attribution preserved via sdr_id (never overwritten)
- segment + vertical inherited from company (trigger handles at INSERT;
  generator also sets for the COPY path)
"""

import uuid
import random
import calendar
import numpy as np
from datetime import date, timedelta, datetime
from typing import Optional

from .constants import (
    RANDOM_SEED,
    NUM_OPEN_OPPS,
    NUM_HISTORICAL_OPPS,
    PIPELINE_DIST,
    DEAL_ARR_MEDIAN,
    DEAL_ARR_MIN,
    DEAL_ARR_P90,
    TERM_DIST,
    STAGE_PROBABILITY,
    STAGE_AVG_DAYS,
    DISCOVERY_STATUS_DIST,
    PRODUCT_LINES,
    COMPETITORS,
    OVERALL_WIN_RATE,
    PCT_LEADSORUCE_MISMATCH,
)

LOST_REASONS = [
    "Lost to Competitor", "No Decision", "Price", "Timing/Budget",
    "Lack of Fit", "Internal Build", "Discovery Meeting No Show",
    "Disqualified Pre-Discovery", "Other",
]

DEAL_TYPES = [
    "New Business", "Expansion (Cross-sell)", "Expansion (Upsell)",
    "Renewal", "Renewal-Uplift",
]

BUYING_ROLES = [
    "Champion (Primary)", "Economic Buyer", "Decision Maker",
    "Influencer", "Evaluator", "End User", "Blocker",
]


def _weighted_choice(dist: dict) -> str:
    keys = list(dist.keys())
    weights = list(dist.values())
    return random.choices(keys, weights=weights, k=1)[0]


def _arr_for_segment(segment: str) -> float:
    """Log-normal ARR centered on median per segment."""
    medians = {"SMB": 35_000, "Mid-Market": 85_000, "Enterprise": 220_000}
    median = medians.get(segment, DEAL_ARR_MEDIAN)
    arr = median * np.exp(random.gauss(0, 0.5))
    return max(DEAL_ARR_MIN, round(arr, -2))   # round to nearest $100


def _stage_walk(segment: str, target_stage: str, deal_created: date,
                opportunity_id: str, owner_id: str) -> tuple[list[dict], date]:
    """
    Walk from stage 0 → target_stage (or Closed Lost).
    Returns (history_rows, last_stage_change_date).
    """
    stage_order = ["0", "1", "2", "3", "4", "5", "6"]
    avg_days = STAGE_AVG_DAYS.get(segment, STAGE_AVG_DAYS["Mid-Market"])

    if target_stage == "Closed Lost":
        # Pick a random stage where the deal died
        lost_at_stage = random.choices(
            ["0", "1", "2", "3", "4", "5"],
            weights=[0.20, 0.25, 0.25, 0.18, 0.08, 0.04]
        )[0]
        stages_to_walk = stage_order[:stage_order.index(lost_at_stage) + 1]
    else:
        stages_to_walk = stage_order[:stage_order.index(target_stage) + 1]

    history = []
    current_date = deal_created
    prev_stage = None

    for idx, stg in enumerate(stages_to_walk):
        if prev_stage is not None:
            days_spent = max(1, int(random.gauss(
                avg_days.get(prev_stage, 14),
                avg_days.get(prev_stage, 14) * 0.5
            )))
            history.append({
                "id":                 str(uuid.uuid4()),
                "opportunity_id":     opportunity_id,
                "from_stage":         prev_stage,
                "to_stage":           stg,
                "changed_at":         current_date.isoformat(),
                "days_in_prior_stage":days_spent,
                "changed_by":         owner_id,
            })
            current_date += timedelta(days=days_spent)

        prev_stage = stg

    # Final transition if Closed Lost
    if target_stage == "Closed Lost":
        days_spent = max(1, int(random.gauss(
            avg_days.get(prev_stage, 14),
            avg_days.get(prev_stage, 14) * 0.5
        )))
        history.append({
            "id":                 str(uuid.uuid4()),
            "opportunity_id":     opportunity_id,
            "from_stage":         prev_stage,
            "to_stage":           "Closed Lost",
            "changed_at":         current_date.isoformat(),
            "days_in_prior_stage":days_spent,
            "changed_by":         owner_id,
        })
        current_date += timedelta(days=days_spent)

    return history, current_date


def _close_date_in_quarter(today: date) -> date:
    """Return a close date spread across the current quarter, weighted toward month 3."""
    q = (today.month - 1) // 3
    q_months = [q * 3 + 1, q * 3 + 2, q * 3 + 3]  # 1-indexed months
    chosen_month = random.choices(q_months, weights=[0.15, 0.30, 0.55])[0]
    days_in_month = calendar.monthrange(today.year, chosen_month)[1]
    return date(today.year, chosen_month, random.randint(1, days_in_month))


def generate_users() -> list[dict]:
    random.seed(RANDOM_SEED + 20)
    users = []

    roles = [
        ("SDR",             2, "Mid-Market"),
        ("SDR",             1, "Enterprise"),
        ("SDR",             1, "SMB"),
        ("AE",              3, "Mid-Market"),
        ("AE",              2, "Enterprise"),
        ("AE",              2, "SMB"),
        ("Account Manager", 4, None),
        ("Sales Manager",   2, None),
        ("VP Sales",        1, None),
    ]

    fake_names = [
        "Alex Chen", "Jordan Rivera", "Taylor Kim", "Morgan Patel",
        "Casey Johnson", "Drew Williams", "Sam Garcia", "Riley Thompson",
        "Quinn Martinez", "Blake Anderson", "Dana Jackson", "Avery White",
        "Reese Harris", "Parker Lewis", "Sage Robinson", "Skyler Walker",
        "Finley Hall", "Rowan Young", "Cameron Allen", "Devon Scott",
        "Emery Green", "Harper Adams", "Landen Baker", "Peyton Nelson",
        "Remy Carter", "Sloane Mitchell", "Tatum Perez", "Wren Roberts",
        "Zion Turner", "Baylor Phillips",
    ]

    idx = 0
    for role, count, segment in roles:
        for _ in range(count):
            uid = str(uuid.uuid4())
            name = fake_names[idx % len(fake_names)]
            email = f"{name.lower().replace(' ', '.')}.{idx}@onspring-demo.com"
            idx += 1
            hire_days = random.randint(180, 1095)
            users.append({
                "id":        uid,
                "name":      name,
                "email":     email,
                "role":      role,
                "segment":   segment,
                "quota":     round(random.uniform(400_000, 1_200_000), -3) if role == "AE" else None,
                "hire_date": (date.today() - timedelta(days=hire_days)).isoformat(),
                "created_at": (date.today() - timedelta(days=hire_days)).isoformat(),
                "updated_at": (date.today() - timedelta(days=hire_days)).isoformat(),
            })

    return users


def generate_opportunities(
    companies: list[dict],
    contacts: list[dict],
    company_contacts: dict[str, list[str]],
    users: list[dict],
) -> tuple[list, list, list, list, list]:
    """
    Returns:
        opportunities, opp_contacts, opp_history, activities,
        post_deal_contact_updates (for lead_source mismatch DQ records)
    """
    random.seed(RANDOM_SEED + 21)
    np.random.seed(RANDOM_SEED + 21)

    sdrs = [u for u in users if u["role"] == "SDR"]
    aes  = [u for u in users if u["role"] == "AE"]

    contact_by_id = {c["id"]: c for c in contacts}
    customer_companies = [c for c in companies if c["is_customer"]]

    # Segment → AE pool
    ae_by_segment: dict[str, list] = {}
    for ae in aes:
        seg = ae.get("segment") or "Mid-Market"
        ae_by_segment.setdefault(seg, []).append(ae)

    # Segment → SDR pool
    sdr_by_segment: dict[str, list] = {}
    for sdr in sdrs:
        seg = sdr.get("segment") or "Mid-Market"
        sdr_by_segment.setdefault(seg, []).append(sdr)

    opportunities       = []
    opp_contacts        = []
    opp_history         = []
    activities          = []
    post_deal_updates   = []   # (contact_id, new_lead_source, new_detail)

    total_opps = NUM_OPEN_OPPS + NUM_HISTORICAL_OPPS

    for i in range(total_opps):
        is_open = i < NUM_OPEN_OPPS
        oid = str(uuid.uuid4())

        # Pick company
        company = random.choice(customer_companies if not is_open else companies)
        segment = company.get("_segment") or company.get("company_size") or "Mid-Market"
        if not segment:
            segment = "Mid-Market"

        # Pick AE and SDR
        ae_pool  = ae_by_segment.get(segment) or aes
        sdr_pool = sdr_by_segment.get(segment) or sdrs
        ae  = random.choice(ae_pool)
        sdr = random.choice(sdr_pool)

        # Deal dates
        if is_open:
            created_days_ago = random.randint(14, 300)
        else:
            created_days_ago = random.randint(60, 1095)  # 3-year history

        created = date.today() - timedelta(days=created_days_ago)

        # Pipeline type
        pipeline = _weighted_choice(PIPELINE_DIST)
        deal_type = {
            "New Business": "New Business",
            "Expansion":    random.choice(["Expansion (Cross-sell)", "Expansion (Upsell)"]),
            "Renewal":      random.choice(["Renewal", "Renewal-Uplift"]),
        }[pipeline]

        arr = _arr_for_segment(segment)
        term = _weighted_choice({k: v for k, v in TERM_DIST.items()})
        tcv = arr * (term / 12)

        # Discovery meeting — open deals cannot use statuses that immediately close them
        if is_open:
            open_disc_dist = {
                "Scheduled":              0.30,
                "Rescheduling":           0.25,
                "No Show - Rescheduling": 0.20,
                "Held":                   0.25,
            }
            disc_status = _weighted_choice(open_disc_dist)
        else:
            disc_status = _weighted_choice(DISCOVERY_STATUS_DIST)
        # For open deals with a pending meeting, the discovery date should be future;
        # for held/past statuses it should be relative to creation.
        if is_open and disc_status in ("Scheduled", "Rescheduling", "No Show - Rescheduling"):
            disc_date = date.today() + timedelta(days=random.randint(1, 28))
        else:
            disc_date = created + timedelta(days=random.randint(3, 21))
        disc_held_date = disc_date if disc_status == "Held" else None
        reschedule_count = 0
        if disc_status in ("Rescheduling", "No Show - Rescheduling"):
            reschedule_count = random.randint(1, 3)

        # Determine final stage
        if disc_status == "No Show":
            final_stage = "Closed Lost"
            lost_reason = "Discovery Meeting No Show"
        elif disc_status == "Disqualified":
            final_stage = "Closed Lost"
            lost_reason = "Disqualified Pre-Discovery"
        elif is_open:
            final_stage = random.choices(
                ["0", "1", "2", "3", "4", "5"],
                weights=[0.15, 0.20, 0.25, 0.20, 0.12, 0.08]
            )[0]
            lost_reason = None
        else:
            # Historical: ~22% win rate
            won = random.random() < OVERALL_WIN_RATE
            if won:
                final_stage = "6"
                lost_reason = None
            else:
                final_stage = "Closed Lost"
                lost_reason = random.choices(
                    ["Lost to Competitor", "No Decision", "Price",
                     "Timing/Budget", "Lack of Fit", "Internal Build", "Other"],
                    weights=[0.30, 0.22, 0.18, 0.12, 0.08, 0.06, 0.04]
                )[0]

        # Stage history walk
        history_rows, last_stage_date = _stage_walk(
            segment, final_stage, created, oid, ae["id"]
        )
        opp_history.extend(history_rows)

        current_stage_age = max(0, (date.today() - last_stage_date).days)

        # Close date
        if final_stage in ("6", "Closed Lost"):
            close_date = last_stage_date
        else:
            # Spread open deals across the quarter, weighted toward the last month
            close_date = _close_date_in_quarter(date.today())

        # Probability
        prob = STAGE_PROBABILITY.get(final_stage, 50)
        forecast_cat = {
            "6": "Closed", "Closed Lost": "Closed",
        }.get(final_stage, random.choices(
            ["Pipeline", "Best Case", "Commit"],
            weights=[0.50, 0.30, 0.20]
        )[0])

        # Pick contacts for this deal
        company_contact_ids = company_contacts.get(company["id"], [])
        if not company_contact_ids:
            continue

        n_stakeholders = min(len(company_contact_ids), random.randint(1, 5))
        deal_contact_ids = random.sample(company_contact_ids, n_stakeholders)
        champion_contact_id = deal_contact_ids[0]
        champion = contact_by_id.get(champion_contact_id)

        # Lead source stamped from champion's current lead_source at deal creation.
        # ZoomInfo never appears here because CURRENT_LEAD_SOURCE_DIST excludes it.
        deal_lead_source = champion["lead_source"] if champion else None
        deal_lead_source_detail = champion["lead_source_detail"] if champion else None

        # Name
        product = random.choice(PRODUCT_LINES)
        use_cases = ["Compliance Automation", "Vendor Risk", "Audit Readiness",
                     "Policy Management", "Risk Assessment", "FedRAMP Authorization",
                     "SOC 2 Compliance", "DORA Readiness", "ESG Reporting"]
        opp_name = f"{company['name']} - {product} - {random.choice(use_cases)}"

        # Competitor (only for lost/late-stage)
        competitor = None
        if final_stage in ("Closed Lost", "3", "4", "5", "6"):
            if random.random() < 0.6:
                competitor = random.choice(COMPETITORS)

        opp = {
            "id":                                oid,
            "name":                              opp_name,
            "company_id":                        company["id"],
            "primary_contact_id":                champion_contact_id,
            "owner_id":                          ae["id"],
            "sdr_id":                            sdr["id"],
            "pipeline":                          pipeline,
            "stage":                             final_stage,
            "amount":                            round(tcv, 2),
            "arr":                               round(arr, 2),
            "term_months":                       term,
            "close_date":                        close_date.isoformat(),
            "created_date":                      created.isoformat(),
            "discovery_meeting_status":          disc_status,
            "discovery_meeting_date":            disc_date.isoformat(),
            "discovery_meeting_held_date":       disc_held_date.isoformat() if disc_held_date else None,
            "discovery_meeting_reschedule_count":reschedule_count,
            "lead_source":                       deal_lead_source,
            "lead_source_detail":                deal_lead_source_detail,
            "segment":                           segment,
            "vertical":                          company["vertical_tag"],
            "inherited_at":                      created.isoformat(),
            "deal_type":                         deal_type,
            "product_line":                      product,
            "probability":                       prob,
            "forecast_category":                 forecast_cat,
            "next_step":                         None,
            "lost_reason":                       lost_reason,
            "competitor":                        competitor,
            "stakeholder_count":                 n_stakeholders,
            "has_economic_buyer_engaged":        random.random() < 0.4,
            "activity_count_last_30":            random.randint(0, 15),
            "last_stage_change_date":            last_stage_date.isoformat(),
            "current_stage_age_days":            current_stage_age,
            "deal_age_days":                     max(0, (date.today() - created).days),
            "ai_risk_band":                      None,
            "ai_risk_score":                     None,
            "ai_next_action":                    None,
            "ai_close_probability":              None,
            "created_at":                        created.isoformat(),
            "updated_at":                        last_stage_date.isoformat(),
            "_contact_ids":                      deal_contact_ids,  # helper, stripped before CSV
        }
        opportunities.append(opp)

        # sls_opportunity_contacts
        for j, cid in enumerate(deal_contact_ids):
            is_primary = (j == 0)
            role = "Champion (Primary)" if is_primary else random.choice(BUYING_ROLES[1:])
            opp_contacts.append({
                "id":             str(uuid.uuid4()),
                "opportunity_id": oid,
                "contact_id":     cid,
                "buying_role":    role,
                "is_primary":     is_primary,
                "added_at":       (created + timedelta(days=1)).isoformat(),
                "removed_at":     None,
                "created_at":     created.isoformat(),
                "updated_at":     created.isoformat(),
            })

        # ~1% deals (every 100th): post-deal contact re-engagement changes champion's
        # lead_source to something different from the stamped deal lead_source.
        # Deterministic rather than random to guarantee the target count.
        if i > 0 and i % 100 == 0:
            alt_sources = [s for s in ["Website", "Webinar", "Trade Show", "Field Event"]
                           if s != deal_lead_source]
            new_src = alt_sources[0] if alt_sources else "Webinar"
            post_deal_updates.append({
                "contact_id":        champion_contact_id,
                "new_lead_source":   new_src,
                "new_lead_source_detail": f"Post-Deal Re-engagement - {new_src} - {date.today().strftime('%m%y')}",
            })

        # A few activities
        n_acts = random.randint(0, 8)
        for _ in range(n_acts):
            act_days = random.randint(0, max(1, (date.today() - created).days))
            activities.append({
                "id":             str(uuid.uuid4()),
                "opportunity_id": oid,
                "contact_id":     random.choice(deal_contact_ids),
                "type":           random.choice(["Call", "Email", "Meeting", "Note"]),
                "occurred_at":    (created + timedelta(days=act_days)).isoformat(),
                "owner_id":       ae["id"],
                "subject":        None,
                "created_at":     (created + timedelta(days=act_days)).isoformat(),
            })

    return opportunities, opp_contacts, opp_history, activities, post_deal_updates


def _next_quarter_end(today: date) -> date:
    """Return the end of the current or next quarter."""
    q_ends = [
        date(today.year,  3, 31),
        date(today.year,  6, 30),
        date(today.year,  9, 30),
        date(today.year, 12, 31),
        date(today.year + 1, 3, 31),
    ]
    for qe in q_ends:
        if qe >= today:
            return qe
    return q_ends[-1]
