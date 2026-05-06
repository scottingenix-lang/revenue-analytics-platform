"""
companies.py — Generate mkt_companies rows.

Rules:
- ~1,450 total companies; ~320 are customers (~22%)
- Vertical mix per VERTICAL_DIST
- company_size NOT set here — derived by DB trigger from employee_count
- ~2% duplicate companies (same name, slightly different domain) per spec
- employee_count log-normal: median ~1,200, range 200–25,000
- Segment distribution among customers: SMB 10%, MM 65%, Enterprise 25%
"""

import uuid
import random
import numpy as np
from datetime import date, timedelta
from faker import Faker

from .constants import (
    RANDOM_SEED, NUM_TOTAL_COMPANIES, NUM_CUSTOMERS,
    VERTICAL_DIST, SEGMENT_CUSTOMER_DIST, EMPLOYEE_RANGES,
    COUNTRY_DIST, US_STATES_BY_VERTICAL, PCT_DUPLICATE_COMPANIES,
)

fake = Faker()
Faker.seed(RANDOM_SEED)


def _weighted_choice(dist: dict) -> str:
    keys = list(dist.keys())
    weights = list(dist.values())
    return random.choices(keys, weights=weights, k=1)[0]


def _employee_count_for_segment(segment: str) -> int:
    lo, hi = EMPLOYEE_RANGES[segment]
    # Log-uniform within range
    return int(np.exp(random.uniform(np.log(lo), np.log(hi))))


def _revenue_band(annual_revenue: float) -> str:
    if annual_revenue < 100_000_000:
        return "<$100M"
    elif annual_revenue < 500_000_000:
        return "$100M–$500M"
    elif annual_revenue < 1_000_000_000:
        return "$500M–$1B"
    elif annual_revenue < 5_000_000_000:
        return "$1B–$5B"
    return "$5B+"


def _annual_revenue_for_employee_count(emp: int) -> float:
    # Very rough: ~$250K revenue per employee, log-normal noise
    base = emp * 250_000
    return base * np.exp(random.gauss(0, 0.4))


def _domain_from_name(name: str) -> str:
    slug = name.lower().replace("&", "and")
    for ch in [" ", ",", ".", "'", "-", "/"]:
        slug = slug.replace(ch, "")
    return f"{slug[:20]}.com"


def generate_companies() -> list[dict]:
    random.seed(RANDOM_SEED)
    np.random.seed(RANDOM_SEED)

    companies = []

    # Build segment pool for customer companies to hit distribution targets
    customer_segments = []
    for seg, pct in SEGMENT_CUSTOMER_DIST.items():
        customer_segments += [seg] * round(pct * NUM_CUSTOMERS)
    # Pad/trim to exactly NUM_CUSTOMERS
    while len(customer_segments) < NUM_CUSTOMERS:
        customer_segments.append("Mid-Market")
    customer_segments = customer_segments[:NUM_CUSTOMERS]
    random.shuffle(customer_segments)

    # All companies get a vertical from VERTICAL_DIST
    verticals = []
    for v, pct in VERTICAL_DIST.items():
        verticals += [v] * round(pct * NUM_TOTAL_COMPANIES)
    while len(verticals) < NUM_TOTAL_COMPANIES:
        verticals.append("Other")
    verticals = verticals[:NUM_TOTAL_COMPANIES]
    random.shuffle(verticals)

    customer_idx = 0

    for i in range(NUM_TOTAL_COMPANIES):
        cid = str(uuid.uuid4())
        vertical = verticals[i]
        is_customer = i < NUM_CUSTOMERS

        if is_customer:
            segment = customer_segments[customer_idx]
            customer_idx += 1
            emp = _employee_count_for_segment(segment)
        else:
            # Non-customers: pick segment independently (mostly MM/SMB prospects)
            weights = [0.20, 0.60, 0.20]
            segment = random.choices(["SMB", "Mid-Market", "Enterprise"], weights=weights)[0]
            emp = _employee_count_for_segment(segment)

        annual_revenue = _annual_revenue_for_employee_count(emp)
        rev_band = _revenue_band(annual_revenue)

        country = _weighted_choice(COUNTRY_DIST)
        if country == "US":
            states = US_STATES_BY_VERTICAL.get(vertical, ["CA", "TX", "NY"])
            state = random.choice(states)
            city = fake.city()
        else:
            state = None
            city = fake.city()

        name = fake.company()
        domain = _domain_from_name(name)

        # Lifecycle stage
        if is_customer:
            lifecycle = "Customer"
        elif random.random() < 0.05:
            lifecycle = "Evangelist"
        else:
            lifecycle = random.choices(
                ["Lead", "MQL", "SQL", "Opportunity"],
                weights=[0.40, 0.30, 0.20, 0.10]
            )[0]

        # created_at: spread over ~3 years, older companies more likely customers
        days_ago = random.randint(30, 1095)
        created_at = date.today() - timedelta(days=days_ago)

        companies.append({
            "id":                     cid,
            "name":                   name,
            "domain":                 domain,
            "industry":               vertical,   # HubSpot industry = vertical for this schema
            "vertical_tag":           vertical,
            "employee_count":         emp,
            "_segment":               segment,  # private: used by opportunities.py; not written to CSV
            # company_size intentionally omitted — set by DB trigger
            "annual_revenue":         round(annual_revenue, 2),
            "revenue_band":           rev_band,
            "country":                country,
            "state":                  state,
            "city":                   city,
            "lifecycle_stage":        lifecycle,
            "hubspot_owner_id":       None,   # patched by opportunities.py
            "is_customer":            is_customer,
            "num_associated_contacts":0,       # updated after contacts generated
            "num_associated_deals":   0,       # updated after opportunities generated
            "created_at":             created_at.isoformat(),
            "updated_at":             created_at.isoformat(),
        })

    # ── Intentional duplicate companies (~2%) ─────────────────
    num_dupes = max(1, round(PCT_DUPLICATE_COMPANIES * NUM_TOTAL_COMPANIES))
    source_pool = [c for c in companies if not c["is_customer"]]
    for _ in range(num_dupes):
        src = random.choice(source_pool)
        dupe = dict(src)
        dupe["id"] = str(uuid.uuid4())
        dupe["is_customer"] = False
        dupe["lifecycle_stage"] = "Lead"
        # Slightly different domain (common data-quality issue)
        dupe["domain"] = src["domain"].replace(".com", "-inc.com")
        companies.append(dupe)

    return companies
