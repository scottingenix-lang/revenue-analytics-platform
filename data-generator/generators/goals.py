"""
goals.py — Generate v2.1 goal and quota seed data.

Tables populated:
  fin_revenue_goals         Annual + quarterly ARR targets
  fin_pipeline_source_goals Source-mix targets per quarter
  sls_quotas                Per-rep, per-quarter quotas
  mkt_campaign_forecast     Per-campaign bottom-up pipeline plan

Seed targets (from spec v2.1, Dashboard #6 section):
  fin_revenue_goals:
    - 2026: annual row + Q1–Q4 quarterly rows; new_business_arr_goal = $40M
    - 2027: annual row; new_business_arr_goal = $52M
  fin_pipeline_source_goals:
    - 2026 Q1–Q4: 40% Sales Generated / 40% Demand Gen / 20% Channel
  sls_quotas (2026, all quarters):
    - AEs at Ramped (12/16 proportion): $250K/qtr, ramp_pct=100
    - AEs at Ramping (3/16 proportion): $125K/qtr, ramp_pct=50
    - AE at New (1/16 proportion):      $0/qtr,    ramp_pct=0
  mkt_campaign_forecast:
    - One row per campaign per 2026 quarter the campaign was active
    - ~3% of rows have NULL forecasted_mqls/sqls (intentional DQ issue)
    - Past-quarter rows have actuals filled with ±20% variance
"""

import uuid
import random
from datetime import date, timedelta, datetime

from .constants import RANDOM_SEED

# ── Constants ─────────────────────────────────────────────────

# 2026 annual targets
ARR_GOAL_2026 = 40_000_000
ARR_GOAL_2027 = 52_000_000

# Quarterly split for 2026 (Q4-loaded like most SaaS orgs)
QUARTERLY_SPLIT_2026 = {1: 0.20, 2: 0.22, 3: 0.24, 4: 0.34}

# Expansion is typically ~30% of total ARR goal
EXPANSION_RATIO = 0.30
NEW_BUSINESS_RATIO = 0.70

# Assumed deal-level rates for the goal model
ASSUMED_WIN_RATE           = 0.22
ASSUMED_SQL_TO_QO_RATE     = 0.35    # SQL → Qualified Opportunity
ASSUMED_QO_TO_WON_RATE     = 0.45    # QO → Closed Won
ASSUMED_AVG_DEAL_SIZE      = 85_000

# Deals per quarter derived from ARR goal
# new_business_deal_count = new_business_arr_goal / assumed_avg_deal_size
def _deals_from_arr(arr_goal: float) -> int:
    return max(1, round(arr_goal / ASSUMED_AVG_DEAL_SIZE))

# Pipeline source mix targets
SOURCE_MIX = {
    "Sales Generated": 0.40,
    "Demand Gen":      0.40,
    "Channel":         0.20,
}

# Ramp assignment: proportional to spec's 12:3:1 ratio (Ramped:Ramping:New)
def _assign_ramp_status(ae_index: int, n_aes: int) -> tuple[str, float, float]:
    """
    Returns (ramp_status, quota_amount, ramp_pct) for the i-th AE.
    Applies 12:3:1 Ramped:Ramping:New split proportionally to however
    many AEs actually exist.
    """
    total_ratio = 12 + 3 + 1  # = 16
    ramped_cutoff  = round(n_aes * 12 / total_ratio)
    ramping_cutoff = round(n_aes * (12 + 3) / total_ratio)

    if ae_index < ramped_cutoff:
        return "Ramped",  250_000.0, 100.0
    elif ae_index < ramping_cutoff:
        return "Ramping", 125_000.0, 50.0
    else:
        return "New",       0.0,      0.0

# Typical base leads per quarter per campaign type
CAMPAIGN_BASE_LEADS = {
    "Webinar":     150,
    "eBook":       300,
    "Trade Show":   80,
    "Field Event":  40,
    "PPC":         500,
    "Social":      400,
    "Email":       200,
    "ABM":          30,
    "Partner":      25,
}

# Lead → MQL rates per source (approximate, feeds forecasted_mqls)
SOURCE_LEAD_TO_MQL = {
    "Website":         0.18,
    "Webinar":         0.22,
    "ZoomInfo":        0.08,
    "Trade Show":      0.30,
    "Field Event":     0.35,
    "PPC":             0.12,
    "Social Ad":       0.10,
    "Partner":         0.28,
    "ABM":             0.40,
    "Sales Generated": 0.45,
}

# MQL → SQL rates per source
SOURCE_MQL_TO_SQL = {
    "Website":         0.25,
    "Webinar":         0.22,
    "ZoomInfo":        0.18,
    "Trade Show":      0.35,
    "Field Event":     0.40,
    "PPC":             0.15,
    "Social Ad":       0.12,
    "Partner":         0.38,
    "ABM":             0.50,
    "Sales Generated": 0.55,
}

# ── Map campaign type → lead_source channel ────────────────────
CAMPAIGN_TYPE_TO_SOURCE = {
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


# ── Generators ────────────────────────────────────────────────

def generate_revenue_goals() -> list[dict]:
    """
    Generate fin_revenue_goals rows.
    2026: 1 annual + 4 quarterly rows.
    2027: 1 annual row.
    All rows are un-segmented / un-verticaled (segment=NULL, vertical=NULL)
    to serve as the top-level plan.  Phase 5 can add segment-level rows.
    """
    rows = []
    now_ts = datetime.utcnow().isoformat()

    # ── 2026 annual ───────────────────────────────────────────
    nb_goal   = ARR_GOAL_2026 * NEW_BUSINESS_RATIO
    exp_goal  = ARR_GOAL_2026 * EXPANSION_RATIO
    rows.append({
        "id":                           str(uuid.uuid4()),
        "period_year":                  2026,
        "period_quarter":               None,
        "segment":                      None,
        "vertical":                     None,
        "new_business_arr_goal":        round(nb_goal,  2),
        "expansion_arr_goal":           round(exp_goal, 2),
        "new_business_deal_count_goal": _deals_from_arr(nb_goal),
        "expansion_deal_count_goal":    _deals_from_arr(exp_goal * 0.5),
        "assumed_win_rate":             ASSUMED_WIN_RATE,
        "assumed_sql_to_qo_rate":       ASSUMED_SQL_TO_QO_RATE,
        "assumed_qo_to_won_rate":       ASSUMED_QO_TO_WON_RATE,
        "assumed_avg_deal_size":        ASSUMED_AVG_DEAL_SIZE,
        "pipeline_lag_quarters_override": None,
        "created_at":                   now_ts,
        "updated_at":                   now_ts,
    })

    # ── 2026 quarterly ────────────────────────────────────────
    for q, pct in QUARTERLY_SPLIT_2026.items():
        nb_q  = ARR_GOAL_2026 * NEW_BUSINESS_RATIO * pct
        exp_q = ARR_GOAL_2026 * EXPANSION_RATIO    * pct
        rows.append({
            "id":                           str(uuid.uuid4()),
            "period_year":                  2026,
            "period_quarter":               q,
            "segment":                      None,
            "vertical":                     None,
            "new_business_arr_goal":        round(nb_q,  2),
            "expansion_arr_goal":           round(exp_q, 2),
            "new_business_deal_count_goal": _deals_from_arr(nb_q),
            "expansion_deal_count_goal":    _deals_from_arr(exp_q * 0.5),
            "assumed_win_rate":             ASSUMED_WIN_RATE,
            "assumed_sql_to_qo_rate":       ASSUMED_SQL_TO_QO_RATE,
            "assumed_qo_to_won_rate":       ASSUMED_QO_TO_WON_RATE,
            "assumed_avg_deal_size":        ASSUMED_AVG_DEAL_SIZE,
            "pipeline_lag_quarters_override": None,
            "created_at":                   now_ts,
            "updated_at":                   now_ts,
        })

    # ── 2027 annual ───────────────────────────────────────────
    nb_goal_27  = ARR_GOAL_2027 * NEW_BUSINESS_RATIO
    exp_goal_27 = ARR_GOAL_2027 * EXPANSION_RATIO
    rows.append({
        "id":                           str(uuid.uuid4()),
        "period_year":                  2027,
        "period_quarter":               None,
        "segment":                      None,
        "vertical":                     None,
        "new_business_arr_goal":        round(nb_goal_27,  2),
        "expansion_arr_goal":           round(exp_goal_27, 2),
        "new_business_deal_count_goal": _deals_from_arr(nb_goal_27),
        "expansion_deal_count_goal":    _deals_from_arr(exp_goal_27 * 0.5),
        "assumed_win_rate":             ASSUMED_WIN_RATE,
        "assumed_sql_to_qo_rate":       ASSUMED_SQL_TO_QO_RATE,
        "assumed_qo_to_won_rate":       ASSUMED_QO_TO_WON_RATE,
        "assumed_avg_deal_size":        ASSUMED_AVG_DEAL_SIZE,
        "pipeline_lag_quarters_override": None,
        "created_at":                   now_ts,
        "updated_at":                   now_ts,
    })

    return rows


def generate_pipeline_source_goals() -> list[dict]:
    """
    Generate fin_pipeline_source_goals rows.
    2026 Q1–Q4: 40/40/20 split across Sales Generated / Demand Gen / Channel.
    """
    rows = []
    now_ts = datetime.utcnow().isoformat()

    for q, qtr_pct in QUARTERLY_SPLIT_2026.items():
        # Total pipeline goal for this quarter (3× coverage of new business target)
        qtr_nb_goal = ARR_GOAL_2026 * NEW_BUSINESS_RATIO * qtr_pct
        pipeline_goal = qtr_nb_goal * 3.0  # 3x coverage assumption

        for source_cat, mix_pct in SOURCE_MIX.items():
            rows.append({
                "period_year":           2026,
                "period_quarter":        q,
                "source_category":       source_cat,
                "pipeline_amount_goal":  round(pipeline_goal * mix_pct, 2),
                "pipeline_pct_of_total": round(mix_pct, 4),
                "created_at":            now_ts,
            })

    return rows


def generate_quotas(users: list[dict]) -> list[dict]:
    """
    Generate sls_quotas rows for all AEs, all 4 quarters of 2026.
    Ramp distribution: 12:3:1 (Ramped:Ramping:New) applied proportionally.
    """
    random.seed(RANDOM_SEED + 50)
    rows = []
    now_ts = datetime.utcnow().isoformat()

    aes = [u for u in users if u["role"] == "AE"]
    n_aes = len(aes)

    for idx, ae in enumerate(aes):
        ramp_status, quota_amount, ramp_pct = _assign_ramp_status(idx, n_aes)
        for q in range(1, 5):
            rows.append({
                "user_id":        ae["id"],
                "period_year":    2026,
                "period_quarter": q,
                "quota_amount":   quota_amount,
                "ramp_status":    ramp_status,
                "ramp_pct":       ramp_pct,
                "created_at":     now_ts,
                "updated_at":     now_ts,
            })

    return rows


def generate_campaign_forecasts(campaigns: list[dict]) -> list[dict]:
    """
    Generate mkt_campaign_forecast rows.
    - One row per (campaign × quarter) where the campaign was active in 2026.
    - ~3% of rows intentionally have NULL forecasted_mqls/sqls (DQ issue:
      campaign missing per-source conversion rate).
    - Past-quarter rows have actuals filled with realistic ±20% variance.
    """
    random.seed(RANDOM_SEED + 51)
    rows = []

    today = date.today()
    now_ts = datetime.utcnow().isoformat()

    # Quarter date ranges for 2026
    quarters_2026 = {
        1: (date(2026, 1, 1), date(2026, 3, 31)),
        2: (date(2026, 4, 1), date(2026, 6, 30)),
        3: (date(2026, 7, 1), date(2026, 9, 30)),
        4: (date(2026, 10, 1), date(2026, 12, 31)),
    }

    for camp in campaigns:
        ctype   = camp.get("type", "Email")
        channel = camp.get("channel") or CAMPAIGN_TYPE_TO_SOURCE.get(ctype, "Website")
        source  = CAMPAIGN_TYPE_TO_SOURCE.get(ctype, channel)

        camp_start = date.fromisoformat(camp["start_date"]) if camp.get("start_date") else None
        camp_end   = date.fromisoformat(camp["end_date"])   if camp.get("end_date")   else None
        if camp_start is None or camp_end is None:
            continue

        base_leads     = CAMPAIGN_BASE_LEADS.get(ctype, 100)
        l2m_rate       = SOURCE_LEAD_TO_MQL.get(source, 0.15)
        m2s_rate       = SOURCE_MQL_TO_SQL.get(source, 0.20)
        forecasted_at  = now_ts

        for q, (q_start, q_end) in quarters_2026.items():
            # Only create a forecast row if this campaign overlaps Q or ran at all in 2026
            campaign_was_active_in_q = (
                camp_start <= q_end and (camp_end is None or camp_end >= q_start)
            )
            if not campaign_was_active_in_q:
                continue

            # Intentional DQ: ~3% of rows missing conversion rates
            missing_conversion_rate = (random.random() < 0.03)

            # Base leads with ±30% random variation per campaign per quarter
            f_leads = max(1, round(base_leads * random.uniform(0.7, 1.3)))

            if missing_conversion_rate:
                # This is the intentional DQ record — forecasted_mqls/sqls are NULL
                f_mqls     = None
                f_sqls     = None
                f_pipeline = None
            else:
                f_mqls     = max(0, round(f_leads    * l2m_rate))
                f_sqls     = max(0, round(f_mqls     * m2s_rate))
                f_pipeline = round(f_sqls * ASSUMED_AVG_DEAL_SIZE * ASSUMED_WIN_RATE, 2)

            # Actuals: only for past quarters
            q_is_past = q_end < today
            if q_is_past:
                # Vary actuals ±20% vs forecast
                variance   = random.uniform(-0.20, 0.20)
                a_leads    = max(0, round(f_leads * (1 + variance)))
                if missing_conversion_rate:
                    a_mqls = max(0, round(a_leads * l2m_rate * random.uniform(0.8, 1.2)))
                    a_sqls = max(0, round(a_mqls  * m2s_rate * random.uniform(0.8, 1.2)))
                else:
                    a_mqls = max(0, round((f_mqls or 0) * (1 + random.uniform(-0.20, 0.20))))
                    a_sqls = max(0, round((f_sqls or 0) * (1 + random.uniform(-0.20, 0.20))))
                a_pipeline = round(a_sqls * ASSUMED_AVG_DEAL_SIZE * ASSUMED_WIN_RATE, 2)

                # variance_pct: (actual_pipeline - forecasted_pipeline) / forecasted_pipeline
                if f_pipeline and f_pipeline > 0:
                    var_pct = round((a_pipeline - f_pipeline) / f_pipeline, 4)
                else:
                    var_pct = None
            else:
                a_leads    = None
                a_mqls     = None
                a_sqls     = None
                a_pipeline = None
                var_pct    = None

            rows.append({
                "id":                   str(uuid.uuid4()),
                "campaign_id":          camp["id"],
                "period_year":          2026,
                "period_quarter":       q,
                "forecasted_leads":     f_leads,
                "forecasted_mqls":      f_mqls,
                "forecasted_sqls":      f_sqls,
                "forecasted_pipeline":  f_pipeline,
                "forecasted_at":        forecasted_at,
                "actual_leads":         a_leads,
                "actual_mqls":          a_mqls,
                "actual_sqls":          a_sqls,
                "actual_pipeline":      a_pipeline,
                "variance_pct":         var_pct,
                "created_at":           forecasted_at,
                "updated_at":           now_ts if q_is_past else forecasted_at,
            })

    return rows


def generate_goals(
    users: list[dict],
    campaigns: list[dict],
) -> tuple[list[dict], list[dict], list[dict], list[dict]]:
    """
    Entry point called by seed.py.
    Returns (revenue_goals, pipeline_source_goals, quotas, campaign_forecasts).
    """
    revenue_goals         = generate_revenue_goals()
    pipeline_source_goals = generate_pipeline_source_goals()
    quotas                = generate_quotas(users)
    campaign_forecasts    = generate_campaign_forecasts(campaigns)

    return revenue_goals, pipeline_source_goals, quotas, campaign_forecasts
