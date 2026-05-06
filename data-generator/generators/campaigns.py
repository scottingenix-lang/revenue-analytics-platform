"""
campaigns.py — Generate mkt_campaigns and mkt_touches rows.

Rules:
- ~45 Onspring-shaped campaigns (3-year span)
- Touch types and engagement scores per Appendix B (locked)
- Touches with engagement_score = 0 are NOT inserted
- mkt_campaign_members: one row per contact-campaign pair
"""

import uuid
import random
import numpy as np
from datetime import date, timedelta, datetime

from .constants import (
    RANDOM_SEED,
    CAMPAIGN_NAMES,
    TOUCH_ENGAGEMENT_SCORES,
    SOURCE_TOUCH_TYPES,
    CURRENT_LEAD_SOURCE_DIST,
)

# Last-touch source weights (highest → lowest per product spec).
# ZoomInfo excluded: it has no campaigns, so campaign.channel can't be set for it.
_LAST_TOUCH_SOURCE_WEIGHTS = {
    "Trade Show":  100,
    "Website":      80,
    "Partner":      65,
    "Field Event":  50,
    "ABM":          40,
    "PPC":          30,
    "Webinar":      20,
    "Social Ad":    12,
}
_LT_SOURCES = list(_LAST_TOUCH_SOURCE_WEIGHTS.keys())
_LT_WEIGHTS = [_LAST_TOUCH_SOURCE_WEIGHTS[s] for s in _LT_SOURCES]

CAMPAIGN_CHANNEL_MAP = {
    "Webinar":    "Webinar",
    "eBook":      "Website",
    "Trade Show": "Trade Show",
    "Field Event":"Field Event",
    "PPC":        "PPC",
    "Social":     "Social Ad",
    "Email":      "Website",
    "ABM":        "ABM",
    "Partner":    "Partner",
}

CAMPAIGN_COST_RANGE = {
    "Webinar":    (2_000, 8_000),
    "eBook":      (5_000, 20_000),
    "Trade Show": (25_000, 120_000),
    "Field Event":(8_000, 35_000),
    "PPC":        (3_000, 15_000),
    "Social":     (2_000, 10_000),
    "Email":      (500,   2_000),
    "ABM":        (5_000, 25_000),
    "Partner":    (1_000, 5_000),
}


def _infer_campaign_type(name: str) -> str:
    n = name.lower()
    if "webinar" in n:          return "Webinar"
    if "ebook" in n or "guide" in n or "playbook" in n or "assessment" in n:
        return "eBook"
    if "rsa" in n or "summit" in n or "gartner" in n or "booth" in n:
        return "Trade Show"
    if "dinner" in n or "roundtable" in n or "forum" in n:
        return "Field Event"
    if "ppc" in n or "search" in n:
        return "PPC"
    if "linkedin" in n or "social ad" in n:
        return "Social"
    if "abm" in n:              return "ABM"
    if "partner" in n or "referral" in n or "deloitte" in n or "kpmg" in n:
        return "Partner"
    return "Email"


def generate_campaigns() -> list[dict]:
    random.seed(RANDOM_SEED + 10)
    campaigns = []
    today = date.today()

    for name in CAMPAIGN_NAMES:
        ctype = _infer_campaign_type(name)
        channel = CAMPAIGN_CHANNEL_MAP.get(ctype, "Website")
        cost_lo, cost_hi = CAMPAIGN_COST_RANGE.get(ctype, (1_000, 5_000))

        # Spread campaign dates across 3 years
        days_ago_start = random.randint(30, 1095)
        start = today - timedelta(days=days_ago_start)
        duration = random.randint(1, 60)
        end = start + timedelta(days=duration)

        program = None
        n = name.lower()
        if "fedramp" in n or "federal" in n:
            program = "FedRAMP Demand Gen"
        elif "healthcare" in n or "hipaa" in n:
            program = "Healthcare ABM"
        elif "finserv" in n or "sox" in n:
            program = "FinServ ABM"
        elif "rsa" in n or "summit" in n:
            program = "Event Pipeline"
        elif "abm" in n:
            program = "Q2 ABM"
        elif "webinar" in n:
            program = "Thought Leadership"

        campaigns.append({
            "id":         str(uuid.uuid4()),
            "name":       name,
            "type":       ctype,
            "channel":    channel,
            "program":    program,
            "start_date": start.isoformat(),
            "end_date":   end.isoformat(),
            "cost":       round(random.uniform(cost_lo, cost_hi), 2),
            "created_at": start.isoformat(),
            "updated_at": end.isoformat(),
        })

    return campaigns


def generate_touches(
    contacts: list[dict],
    campaigns: list[dict],
    opportunities: list[dict],
) -> tuple[list[dict], list[dict]]:
    """
    Generate mkt_touches and mkt_campaign_members.
    Returns (touches, campaign_members).
    pre_or_post_deal is set relative to associated deal's created_date.
    """
    random.seed(RANDOM_SEED + 11)

    # Build lookup: contact_id → deal created_date (earliest deal)
    contact_deal_date: dict[str, date] = {}
    for opp in opportunities:
        for contact_id in opp.get("_contact_ids", []):
            existing = contact_deal_date.get(contact_id)
            opp_date = date.fromisoformat(opp["created_date"])
            if existing is None or opp_date < existing:
                contact_deal_date[contact_id] = opp_date

    campaign_by_id = {c["id"]: c for c in campaigns}
    touches = []
    campaign_members: dict[tuple, dict] = {}   # (campaign_id, contact_id) → member row

    # Map lead source → campaign list
    source_campaigns: dict[str, list[dict]] = {}
    for camp in campaigns:
        ch = camp.get("channel") or "Website"
        source_campaigns.setdefault(ch, []).append(camp)

    # Each contact gets 1–8 touches
    for contact in contacts:
        lead_source = contact.get("lead_source") or "Website"
        orig_source = contact.get("original_lead_source") or lead_source
        created = date.fromisoformat(contact["created_at"].split("T")[0])
        deal_date = contact_deal_date.get(contact["id"])

        # Number of touches: higher for customers / high-lifecycle contacts
        if contact["lifecycle_stage"] in ("Customer", "SQL", "Opportunity"):
            n_touches = random.randint(2, 8)
        elif contact["lifecycle_stage"] in ("MQL",):
            n_touches = random.randint(1, 5)
        else:
            n_touches = random.randint(1, 3)

        # First touch uses original_lead_source channel; subsequent may drift
        used_sources = [orig_source] + random.choices(
            list(source_campaigns.keys()),
            k=n_touches - 1
        )

        for i, src in enumerate(used_sources):
            touch_types = SOURCE_TOUCH_TYPES.get(src, ["Email Click"])
            touch_type  = random.choice(touch_types)
            score       = TOUCH_ENGAGEMENT_SCORES.get(touch_type, 0)

            if score == 0:
                continue   # don't insert zero-score touches

            # Touch date: spread after contact creation
            max_days = max(1, (date.today() - created).days)
            touch_day = created + timedelta(days=random.randint(0, max_days))
            # Don't put touches in the future
            if touch_day > date.today():
                touch_day = date.today()

            # pre_or_post_deal
            if deal_date is None:
                popo = "no_deal"
            elif touch_day < deal_date:
                popo = "pre"
            else:
                popo = "post"

            # Assign a campaign if one matches the source
            camps_for_src = source_campaigns.get(src, [])
            campaign_id = None
            if camps_for_src:
                camp = random.choice(camps_for_src)
                camp_start = date.fromisoformat(camp["start_date"])
                camp_end   = date.fromisoformat(camp["end_date"])
                # Only assign if touch date is in campaign window (±30d tolerance)
                if camp_start - timedelta(days=30) <= touch_day <= camp_end + timedelta(days=30):
                    campaign_id = camp["id"]

                    # Upsert campaign_member
                    key = (campaign_id, contact["id"])
                    if key not in campaign_members:
                        campaign_members[key] = {
                            "id":                    str(uuid.uuid4()),
                            "campaign_id":           campaign_id,
                            "contact_id":            contact["id"],
                            "added_at":              touch_day.isoformat(),
                            "last_engagement_at":    touch_day.isoformat(),
                            "touch_count":           1,
                            "total_engagement_score":score,
                            "created_at":            touch_day.isoformat(),
                            "updated_at":            touch_day.isoformat(),
                        }
                    else:
                        m = campaign_members[key]
                        m["touch_count"] += 1
                        m["total_engagement_score"] += score
                        if touch_day.isoformat() > m["last_engagement_at"]:
                            m["last_engagement_at"] = touch_day.isoformat()
                        m["updated_at"] = touch_day.isoformat()

            touches.append({
                "id":               str(uuid.uuid4()),
                "contact_id":       contact["id"],
                "campaign_id":      campaign_id,
                "touch_type":       touch_type,
                "engagement_score": score,
                "pre_or_post_deal": popo,
                "touch_date":       touch_day.isoformat(),
                "touch_value":      None,
                "created_at":       touch_day.isoformat(),
            })

    # ── Inject per-opportunity biased last touches ─────────────────────────────
    # For each deal, add one touch dated 1–7 days before deal creation with a
    # campaign from the desired last-touch source distribution.  Because it is
    # the latest pre-deal touch chronologically, the MV will pick it up as the
    # last touch and credit the campaign channel—producing a distribution
    # distinct from first touch.
    contact_by_id = {c["id"]: c for c in contacts}
    today = date.today()

    for opp in opportunities:
        opp_date     = date.fromisoformat(opp["created_date"])
        contact_ids  = opp.get("_contact_ids", [])
        if not contact_ids:
            continue

        primary_id      = contact_ids[0]
        primary_contact = contact_by_id.get(primary_id)
        if primary_contact is None:
            continue

        contact_created = date.fromisoformat(primary_contact["created_at"].split("T")[0])

        lt_src        = random.choices(_LT_SOURCES, weights=_LT_WEIGHTS, k=1)[0]
        lt_types      = SOURCE_TOUCH_TYPES.get(lt_src, ["Email Click"])
        lt_touch_type = random.choice(lt_types)
        lt_score      = TOUCH_ENGAGEMENT_SCORES.get(lt_touch_type, 0)
        if lt_score == 0:
            continue

        # Use 1 day before deal creation so this touch is guaranteed to be the
        # latest pre-deal touch (maximises chance of winning the LIMIT 1 sort).
        lt_date = opp_date - timedelta(days=1)
        lt_date = max(lt_date, contact_created)
        lt_date = min(lt_date, today)

        # Always assign a matching campaign — no date-range restriction.
        # The campaign.channel is what mv_attribution_last_touch reads, so
        # a campaign_id MUST be set or the MV falls back to contact.lead_source.
        camps_for_src  = source_campaigns.get(lt_src, [])
        lt_campaign_id = random.choice(camps_for_src)["id"] if camps_for_src else None

        touches.append({
            "id":               str(uuid.uuid4()),
            "contact_id":       primary_id,
            "campaign_id":      lt_campaign_id,
            "touch_type":       lt_touch_type,
            "engagement_score": lt_score,
            "pre_or_post_deal": "pre",
            "touch_date":       lt_date.isoformat(),
            "touch_value":      None,
            "created_at":       lt_date.isoformat(),
        })

    return touches, list(campaign_members.values())
