"""
constants.py — All locked distribution targets from Section 9 of the spec.
All generators import from here so the distributions are a single source of truth.
"""

RANDOM_SEED = 42

# ── Company / Contact targets ─────────────────────────────────

NUM_CUSTOMERS = 320
NUM_TOTAL_COMPANIES = 1450       # ~22% customer rate → ~320 customers
NUM_CONTACTS_PER_COMPANY_MEDIAN = 4

VERTICAL_DIST = {
    "Financial Services":    0.32,
    "Healthcare":            0.21,
    "Energy & Utilities":    0.14,
    "Federal/Public Sector": 0.12,
    "Technology":            0.10,
    "Manufacturing":         0.06,
    "Other":                 0.05,
}

# employee_count → company_size derived by trigger:
# SMB: 100-499  (10% of customers by count)
# Mid-Market: 500-4999  (65%)
# Enterprise: 5000+  (25%)
SEGMENT_CUSTOMER_DIST = {
    "SMB":         0.10,
    "Mid-Market":  0.65,
    "Enterprise":  0.25,
}

EMPLOYEE_RANGES = {
    "SMB":         (100,  499),
    "Mid-Market":  (500,  4999),
    "Enterprise":  (5000, 25000),
}

COUNTRY_DIST = {
    "US": 0.78, "Canada": 0.08, "UK": 0.06, "Australia": 0.04, "Other": 0.04,
}

# ── Lead source distributions ─────────────────────────────────

LEAD_SOURCE_VALUES = [
    "ZoomInfo", "Website", "Webinar", "Trade Show", "Field Event",
    "PPC", "Social Ad", "Partner", "ABM", "Sales Generated",
]

ORIGINAL_LEAD_SOURCE_DIST = {
    "Website":         0.22,
    "ZoomInfo":        0.18,
    "Webinar":         0.15,
    "Trade Show":      0.10,
    "PPC":             0.09,
    "Field Event":     0.08,
    "Partner":         0.07,
    "Social Ad":       0.05,
    "ABM":             0.04,
    "Sales Generated": 0.02,
}

# Current lead source skews more toward Website/Webinar (re-engagement)
CURRENT_LEAD_SOURCE_DIST = {
    "Website":         0.28,
    "Webinar":         0.20,
    "ZoomInfo":        0.14,
    "Trade Show":      0.08,
    "PPC":             0.08,
    "Field Event":     0.07,
    "Partner":         0.06,
    "Social Ad":       0.05,
    "ABM":             0.03,
    "Sales Generated": 0.01,
}

# ── Opportunity targets ───────────────────────────────────────

NUM_OPEN_OPPS = 80
NUM_HISTORICAL_OPPS = 1400
OVERALL_WIN_RATE = 0.22
INBOUND_WIN_RATE = 0.31
OUTBOUND_WIN_RATE = 0.14

PIPELINE_DIST = {
    "New Business": 0.70,
    "Expansion":    0.22,
    "Renewal":      0.08,
}

DEAL_ARR_MEDIAN = 85_000
DEAL_ARR_MIN    = 25_000
DEAL_ARR_P90    = 300_000

TERM_DIST = {12: 0.35, 24: 0.25, 36: 0.40}

SALES_CYCLE_MEDIAN_MIDMARKET   = 142  # days
SALES_CYCLE_MEDIAN_ENTERPRISE  = 218

# Stage probability defaults
STAGE_PROBABILITY = {
    "0": 5, "1": 15, "2": 25, "3": 45, "4": 65, "5": 85, "6": 100,
}

# Average days per stage (used for realistic stage progression)
STAGE_AVG_DAYS = {
    "SMB": {
        "0": 7,  "1": 14, "2": 18, "3": 21, "4": 14, "5": 10,
    },
    "Mid-Market": {
        "0": 10, "1": 21, "2": 28, "3": 35, "4": 21, "5": 18,
    },
    "Enterprise": {
        "0": 14, "1": 35, "2": 42, "3": 56, "4": 35, "5": 28,
    },
}

# Discovery meeting status for past meetings
DISCOVERY_STATUS_DIST = {
    "Held":                  0.65,
    "No Show":               0.12,
    "No Show - Rescheduling":0.08,
    "Rescheduling":          0.06,
    "Disqualified":          0.05,
    "Scheduled":             0.04,
}

# ── ARR / subscription targets ────────────────────────────────

TARGET_ARR = 32_000_000
TARGET_NRR = 1.12
TARGET_GRR = 0.94

# ── Contact seniority and function ───────────────────────────

SENIORITY_DIST = {
    "IC": 0.35, "Manager": 0.25, "Director": 0.22, "VP": 0.12, "C-Level": 0.06,
}

FUNCTION_DIST = {
    "Compliance":       0.24,
    "IT Security":      0.22,
    "Internal Audit":   0.16,
    "Risk Management":  0.14,
    "Legal":            0.08,
    "IT Ops":           0.07,
    "Privacy":          0.05,
    "Procurement":      0.04,
}

PERSONA_DIST = {
    "GRC Leader":           0.20,
    "Security Practitioner":0.22,
    "Auditor":              0.16,
    "Risk Officer":         0.14,
    "IT Buyer":             0.16,
    "Legal/Privacy Counsel":0.12,
}

# ── Engagement scores (locked per Appendix B) ─────────────────

TOUCH_ENGAGEMENT_SCORES = {
    "Email Click":                    30,
    "Webinar Registration":           60,
    "Webinar Attendance":             60,
    "Form: Demo Request":            100,
    "Form: Contact Us":               95,
    "Form: Content Download":         40,
    "Trade Show: Booked Meeting":     90,
    "Trade Show: Badge Scan":         25,
    "Field Event Attendance":         80,
    "Pricing Page View":              70,
    "ROI Calculator Use":             75,
    "Demo Video View (>50%)":         45,
    "Partner Referral Submitted":     85,
    "Sales-Generated Touch":          30,
    "ABM Account Visit":              25,
    "PPC Click":                      20,
    "Social Ad Click":                20,
    "Website Direct Visit (key page)":15,
    "ZoomInfo Add":                   10,
    # Email Open and Webinar Replay <5min have score 0 — not in this dict (not inserted)
}

# Touch types by lead source (which touches typically come from which source)
SOURCE_TOUCH_TYPES = {
    "Website":       ["Form: Demo Request", "Form: Contact Us", "Pricing Page View",
                      "ROI Calculator Use", "Demo Video View (>50%)", "Website Direct Visit (key page)"],
    "ZoomInfo":      ["ZoomInfo Add", "Sales-Generated Touch"],
    "Webinar":       ["Webinar Registration", "Webinar Attendance", "Email Click"],
    "Trade Show":    ["Trade Show: Booked Meeting", "Trade Show: Badge Scan"],
    "Field Event":   ["Field Event Attendance"],
    "PPC":           ["PPC Click", "Form: Content Download"],
    "Social Ad":     ["Social Ad Click", "Email Click"],
    "Partner":       ["Partner Referral Submitted"],
    "ABM":           ["ABM Account Visit", "Email Click"],
    "Sales Generated":["Sales-Generated Touch", "Email Click"],
}

# ── Data quality intentional mess ─────────────────────────────

PCT_MISSING_JOB_TITLE   = 0.08
PCT_MALFORMED_EMAIL     = 0.03
PCT_DUPLICATE_COMPANIES = 0.02
PCT_LEADSORUCE_MISMATCH = 0.01   # deals where lead_source ≠ champion's current lead_source

# ── Campaign naming (Onspring-shaped) ─────────────────────────

CAMPAIGN_NAMES = [
    # Webinars
    "SOC 2 Readiness Webinar Q1 2024", "FedRAMP Compliance Webinar Q2 2024",
    "DORA Readiness Webinar Q3 2024",  "HIPAA Risk Assessment Webinar Q4 2024",
    "ISO 27001 Implementation Webinar Q1 2025", "NIST CSF 2.0 Webinar Q2 2025",
    "Third-Party Risk Webinar Q3 2025", "AI Governance & GRC Webinar Q4 2025",
    "SOX Compliance Webinar Q1 2026",  "Vendor Risk Management Webinar Q2 2026",
    # eBooks / Content
    "FedRAMP Compliance eBook 2024", "DORA Readiness Assessment 2024",
    "GRC Buyer's Guide 2025",        "Audit Management Best Practices eBook",
    "IT Risk Management Playbook",   "ESG Reporting Framework Guide",
    # Trade Shows
    "RSA Conference 2024 Booth",   "GRC Summit 2024 Booth",
    "RSA Conference 2025 Booth",   "Gartner IAM 2025 Booth",
    "RSA 2026 Booth",
    # Field Events
    "Dallas CISO Dinner 0224",     "NYC FinServ Roundtable 0324",
    "Chicago Federal IT Dinner 0424", "Boston Healthcare CIO Dinner 0524",
    "Dallas CISO Dinner 0526",     "SF Tech Exec Roundtable 0626",
    "DC Federal Compliance Forum 0726",
    # ABM
    "Healthcare ABM Q1 2024",      "FinServ ABM Q2 2024",
    "Federal ABM Q3 2024",         "Healthcare ABM Q226",
    "Enterprise FinServ ABM Q326",
    # PPC
    "SOC 2 Compliance PPC 2024",   "GRC Platform PPC 2025",
    "Vendor Risk Management PPC",  "IT Risk Management PPC",
    # Partner
    "Deloitte Partner Co-Sell 2024", "KPMG Referral Program 2025",
    "Coalfire Partner Program",
    # Email nurture
    "Q1 2025 Nurture Email",       "Q2 2025 Healthcare Nurture",
    "Q3 2025 FinServ Nurture",     "Q4 2025 Federal Nurture",
]

CAMPAIGN_TYPE_BY_PREFIX = {
    "Webinar":  "Webinar",
    "eBook":    "eBook",
    "RSA":      "Trade Show",
    "GRC Summit": "Trade Show",
    "Gartner":  "Trade Show",
    "CISO":     "Field Event",
    "Roundtable":"Field Event",
    "Dinner":   "Field Event",
    "Forum":    "Field Event",
    "ABM":      "ABM",
    "PPC":      "PPC",
    "Partner":  "Partner",
    "Email":    "Email",
    "Nurture":  "Email",
    "Compliance eBook": "eBook",
    "Guide":    "eBook",
    "Playbook": "eBook",
}

PRODUCT_LINES = [
    "GRC Suite", "IT Risk Management", "Vendor Risk Management",
    "Audit Management", "Policy Management", "Compliance Management",
    "Business Continuity", "ESG/Sustainability",
]

COMPETITORS = [
    "ServiceNow GRC", "Archer", "AuditBoard", "LogicGate",
    "MetricStream", "OneTrust", "Diligent", "Workiva",
    "Hyperproof", "Internal Build",
]

US_STATES_BY_VERTICAL = {
    "Financial Services":    ["NY", "CT", "IL", "MA", "CA"],
    "Healthcare":            ["TX", "FL", "CA", "OH", "PA"],
    "Energy & Utilities":    ["TX", "OK", "LA", "CO", "WY"],
    "Federal/Public Sector": ["DC", "VA", "MD", "TX", "CA"],
    "Technology":            ["CA", "WA", "TX", "NY", "MA"],
    "Manufacturing":         ["MI", "OH", "IL", "TX", "PA"],
    "Other":                 ["CA", "TX", "FL", "NY", "IL"],
}
