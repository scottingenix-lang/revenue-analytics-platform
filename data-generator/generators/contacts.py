"""
contacts.py — Generate mkt_contacts rows.

Rules:
- Median 4 contacts per company (log-normal, min 1)
- original_lead_source populated simultaneously with lead_source on creation
  (DB trigger enforces write-once; generator sets both at creation time)
- 8% missing job_title
- 3% malformed email
- Lead source distributions per constants.py
"""

import uuid
import random
import numpy as np
from datetime import date, timedelta
from faker import Faker

from .constants import (
    RANDOM_SEED,
    ORIGINAL_LEAD_SOURCE_DIST,
    CURRENT_LEAD_SOURCE_DIST,
    SENIORITY_DIST,
    FUNCTION_DIST,
    PERSONA_DIST,
    PCT_MISSING_JOB_TITLE,
    PCT_MALFORMED_EMAIL,
)

fake = Faker()
Faker.seed(RANDOM_SEED)

GRC_JOB_TITLES = {
    "Compliance":       ["VP of Compliance", "Compliance Manager", "Chief Compliance Officer",
                         "Compliance Analyst", "Director of Compliance"],
    "IT Security":      ["CISO", "VP of Information Security", "Information Security Manager",
                         "Security Analyst", "Director of IT Security"],
    "Internal Audit":   ["Chief Audit Executive", "VP Internal Audit", "Senior Auditor",
                         "Internal Audit Manager", "Audit Director"],
    "Risk Management":  ["Chief Risk Officer", "VP of Risk", "Enterprise Risk Manager",
                         "Risk Analyst", "Director of Risk Management"],
    "Legal":            ["General Counsel", "Associate General Counsel", "VP Legal",
                         "Legal Operations Manager", "Privacy Counsel"],
    "IT Ops":           ["VP of IT", "IT Director", "IT Operations Manager",
                         "Systems Administrator", "CTO"],
    "Privacy":          ["Chief Privacy Officer", "Privacy Officer", "Data Protection Officer",
                         "Privacy Counsel", "Privacy Analyst"],
    "Procurement":      ["VP of Procurement", "Procurement Manager", "Director of Sourcing",
                         "Vendor Manager", "Supplier Risk Manager"],
}


def _weighted_choice(dist: dict) -> str:
    keys = list(dist.keys())
    weights = list(dist.values())
    return random.choices(keys, weights=weights, k=1)[0]


def _make_email(first: str, last: str, domain: str, malform: bool) -> str:
    base = f"{first.lower()}.{last.lower()}@{domain}"
    if not malform:
        return base
    # Common malformed patterns for the DQ console
    malform_type = random.choice(["no_at", "no_tld", "double_at"])
    if malform_type == "no_at":
        return base.replace("@", "")
    elif malform_type == "no_tld":
        return base.rsplit(".", 1)[0]
    else:
        return base.replace("@", "@@")


def _lead_source_detail(lead_source: str) -> str:
    """Generate a realistic detail string per naming convention:
    '<2-4 word desc> - <Lead Source> - <date code>'"""
    date_code = f"{random.randint(1, 12):02d}{random.randint(23, 26)}"
    descs = {
        "Website":         ["Demo Request Form", "Contact Us Form", "Pricing Page Visit",
                            "ROI Calculator", "Product Tour Click"],
        "ZoomInfo":        ["ZoomInfo Outbound", "ZoomInfo Enrichment", "Cold Outreach"],
        "Webinar":         ["SOC2 Readiness Webinar", "FedRAMP Webinar",
                            "DORA Readiness Webinar", "NIST CSF Webinar"],
        "Trade Show":      ["RSA Conference Booth", "GRC Summit Booth",
                            "Gartner IAM Booth"],
        "Field Event":     ["Dallas CISO Dinner", "NYC FinServ Roundtable",
                            "Boston Healthcare CIO Dinner"],
        "PPC":             ["SOC2 Compliance Search", "GRC Platform PPC",
                            "Vendor Risk PPC"],
        "Social Ad":       ["LinkedIn GRC Ad", "LinkedIn Retargeting", "LinkedIn ABM"],
        "Partner":         ["Deloitte Referral", "KPMG Co-Sell", "Coalfire Partner"],
        "ABM":             ["Healthcare ABM Campaign", "FinServ ABM Q2",
                            "Federal ABM Q3"],
        "Sales Generated": ["SDR Cold Outreach", "AE Referral Request",
                            "Sales Prospecting"],
    }
    desc = random.choice(descs.get(lead_source, ["Direct Outreach"]))
    return f"{desc} - {lead_source} - {date_code}"


def generate_contacts(companies: list[dict]) -> list[dict]:
    random.seed(RANDOM_SEED + 1)
    np.random.seed(RANDOM_SEED + 1)

    contacts = []
    company_contacts: dict[str, list[str]] = {}   # company_id → [contact_id, ...]

    for company in companies:
        cid = company["id"]
        # Number of contacts: log-normal, median ~4, min 1
        n = max(1, int(np.random.lognormal(mean=np.log(4), sigma=0.7)))
        n = min(n, 20)   # cap at 20

        company_contact_ids = []

        for _ in range(n):
            contact_id = str(uuid.uuid4())
            first = fake.first_name()
            last  = fake.last_name()

            malform = random.random() < PCT_MALFORMED_EMAIL
            email   = _make_email(first, last, company.get("domain", "example.com"), malform)

            missing_title = random.random() < PCT_MISSING_JOB_TITLE
            func = _weighted_choice(FUNCTION_DIST)
            job_title = None if missing_title else random.choice(GRC_JOB_TITLES.get(func, ["GRC Professional"]))

            seniority = _weighted_choice(SENIORITY_DIST)
            persona   = _weighted_choice(PERSONA_DIST)

            # Lead source: pick original (first-touch), then current (may have drifted)
            orig_source  = _weighted_choice(ORIGINAL_LEAD_SOURCE_DIST)
            orig_detail  = _lead_source_detail(orig_source)

            # Current lead source: weighted toward re-engagement channels
            curr_source  = _weighted_choice(CURRENT_LEAD_SOURCE_DIST)
            curr_detail  = _lead_source_detail(curr_source)

            # Lifecycle stage
            if company["is_customer"]:
                lifecycle = random.choices(
                    ["Customer", "Evangelist", "SQL"],
                    weights=[0.75, 0.10, 0.15]
                )[0]
            else:
                lifecycle = random.choices(
                    ["Lead", "MQL", "SQL", "Opportunity"],
                    weights=[0.45, 0.30, 0.18, 0.07]
                )[0]

            # Behavioral signals
            demo_requested  = random.random() < 0.12
            attended_webinar = random.random() < 0.25
            downloaded_content = random.random() < 0.35

            days_ago = random.randint(14, 1095)
            created_date = date.today() - timedelta(days=days_ago)
            last_activity = created_date + timedelta(days=random.randint(1, min(days_ago, 180)))

            contacts.append({
                "id":                        contact_id,
                "email":                     email,
                "first_name":                first,
                "last_name":                 last,
                "company_id":                cid,
                "job_title":                 job_title,
                "seniority":                 seniority,
                "function":                  func,
                "lifecycle_stage":           lifecycle,
                "hs_persona":                persona,
                "original_lead_source":      orig_source,
                "original_lead_source_detail": orig_detail,
                "lead_source":               curr_source,
                "lead_source_detail":        curr_detail,
                "lead_status":               "Working" if lifecycle in ("MQL", "SQL") else "New",
                "lead_score":                random.randint(0, 100),
                "ai_fit_score":              None,
                "ai_intent_score":           None,
                "ai_score_rationale":        None,
                "created_date":              created_date.isoformat(),
                "last_activity_date":        last_activity.isoformat(),
                "num_form_submissions":      random.randint(0, 8),
                "num_page_views":            random.randint(0, 50),
                "num_email_clicks":          random.randint(0, 20),
                "attended_webinar":          attended_webinar,
                "demo_requested":            demo_requested,
                "downloaded_content":        downloaded_content,
                "gdpr_consent":              random.random() < 0.96,
                "owner_id":                  None,    # patched after sls_users generated
                "created_at":                created_date.isoformat(),
                "updated_at":                last_activity.isoformat(),
            })
            company_contact_ids.append(contact_id)

        company_contacts[cid] = company_contact_ids

    return contacts, company_contacts
