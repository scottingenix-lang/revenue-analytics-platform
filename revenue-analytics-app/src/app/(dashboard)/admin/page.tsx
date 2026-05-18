'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { RefreshCw, CheckCircle, AlertCircle, Sparkles, AlertTriangle, Clock, BookOpen } from 'lucide-react'

// ─── AI Monitor types ─────────────────────────────────────────────────────────

type Budget = {
  today_spend_usd: number
  daily_limit_usd: number
  pct_used: number
  paused: boolean
  warning: boolean
}

type PanelStat = {
  panel_id: string
  title: string
  model: string
  page: string
  has_cache: boolean
  last_generated: string | null
  last_model: string | null
  last_prompt_tokens: number | null
  last_completion_tokens: number | null
  last_cost_usd: number | null
}

type RunRow = {
  id: string
  panel_id: string | null
  model_used: string | null
  status: string
  prompt_tokens: number
  completion_tokens: number
  cost_usd: number
  latency_ms: number
  started_at: string | null
  error_message: string | null
}

type MonitorData = {
  budget: Budget
  panels: PanelStat[]
  recent_runs: RunRow[]
}

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

function fmtCost(usd: number | null) {
  if (usd === null) return '—'
  if (usd < 0.001) return `$${(usd * 1000).toFixed(3)}m`
  return `$${usd.toFixed(4)}`
}

// ─── Data Fields Reference ────────────────────────────────────────────────────

type FieldDef = { name: string; type: string }
type TableDef = { table: string; fields: FieldDef[] }
type ObjectDef = { label: string; tables: TableDef[] }

const DATA_FIELDS: ObjectDef[] = [
  {
    label: 'Contact',
    tables: [
      {
        table: 'mkt_contacts',
        fields: [
          { name: 'id',                          type: 'uuid' },
          { name: 'email',                        type: 'text' },
          { name: 'first_name',                   type: 'text' },
          { name: 'last_name',                    type: 'text' },
          { name: 'company_id',                   type: 'uuid' },
          { name: 'job_title',                    type: 'text' },
          { name: 'seniority',                    type: 'enum' },
          { name: 'function',                     type: 'enum' },
          { name: 'lifecycle_stage',              type: 'enum' },
          { name: 'hs_persona',                   type: 'enum' },
          { name: 'original_lead_source',         type: 'enum' },
          { name: 'original_lead_source_detail',  type: 'text' },
          { name: 'lead_source',                  type: 'enum' },
          { name: 'lead_source_detail',           type: 'text' },
          { name: 'lead_status',                  type: 'enum' },
          { name: 'lead_score',                   type: 'int' },
          { name: 'created_date',                 type: 'timestamp' },
          { name: 'last_activity_date',           type: 'timestamp' },
          { name: 'num_form_submissions',         type: 'int' },
          { name: 'num_page_views',               type: 'int' },
          { name: 'num_email_clicks',             type: 'int' },
          { name: 'attended_webinar',             type: 'bool' },
          { name: 'demo_requested',               type: 'bool' },
          { name: 'downloaded_content',           type: 'bool' },
          { name: 'gdpr_consent',                 type: 'bool' },
          { name: 'owner_id',                     type: 'uuid' },
        ],
      },
      {
        table: 'mkt_touches',
        fields: [
          { name: 'id',               type: 'uuid' },
          { name: 'contact_id',       type: 'uuid' },
          { name: 'campaign_id',      type: 'uuid' },
          { name: 'touch_type',       type: 'enum' },
          { name: 'engagement_score', type: 'int' },
          { name: 'pre_or_post_deal', type: 'enum' },
          { name: 'touch_date',       type: 'timestamp' },
          { name: 'touch_value',      type: 'decimal' },
        ],
      },
    ],
  },
  {
    label: 'Company',
    tables: [
      {
        table: 'mkt_companies',
        fields: [
          { name: 'id',                       type: 'uuid' },
          { name: 'name',                     type: 'text' },
          { name: 'domain',                   type: 'text' },
          { name: 'industry',                 type: 'text' },
          { name: 'vertical_tag',             type: 'enum' },
          { name: 'employee_count',           type: 'int' },
          { name: 'company_size',             type: 'enum' },
          { name: 'annual_revenue',           type: 'decimal' },
          { name: 'revenue_band',             type: 'enum' },
          { name: 'country',                  type: 'text' },
          { name: 'state',                    type: 'text' },
          { name: 'city',                     type: 'text' },
          { name: 'lifecycle_stage',          type: 'enum' },
          { name: 'is_customer',              type: 'bool' },
        ],
      },
      {
        table: 'sub_subscriptions',
        fields: [
          { name: 'id',             type: 'uuid' },
          { name: 'company_id',     type: 'uuid' },
          { name: 'opportunity_id', type: 'uuid' },
          { name: 'product_line',   type: 'enum' },
          { name: 'status',         type: 'enum' },
          { name: 'arr',            type: 'decimal' },
          { name: 'mrr',            type: 'decimal' },
          { name: 'tcv',            type: 'decimal' },
          { name: 'term_months',    type: 'int' },
          { name: 'start_date',     type: 'date' },
          { name: 'end_date',       type: 'date' },
          { name: 'renewal_date',   type: 'date' },
          { name: 'contracted_at',  type: 'timestamp' },
          { name: 'churned_at',     type: 'timestamp' },
        ],
      },
      {
        table: 'sub_arr_movements',
        fields: [
          { name: 'id',              type: 'uuid' },
          { name: 'company_id',      type: 'uuid' },
          { name: 'subscription_id', type: 'uuid' },
          { name: 'movement_type',   type: 'enum' },
          { name: 'arr_delta',       type: 'decimal' },
          { name: 'arr_before',      type: 'decimal' },
          { name: 'arr_after',       type: 'decimal' },
          { name: 'effective_date',  type: 'date' },
          { name: 'fiscal_quarter',  type: 'text' },
        ],
      },
      {
        table: 'cs_health_scores',
        fields: [
          { name: 'id',                      type: 'uuid' },
          { name: 'company_id',              type: 'uuid' },
          { name: 'snapshot_date',           type: 'date' },
          { name: 'overall_score',           type: 'int' },
          { name: 'health_tier',             type: 'enum' },
          { name: 'usage_score',             type: 'int' },
          { name: 'support_load_score',      type: 'int' },
          { name: 'exec_sponsor_score',      type: 'int' },
          { name: 'renewal_proximity_score', type: 'int' },
        ],
      },
      {
        table: 'cs_tickets',
        fields: [
          { name: 'id',            type: 'uuid' },
          { name: 'company_id',    type: 'uuid' },
          { name: 'contact_id',    type: 'uuid' },
          { name: 'subject',       type: 'text' },
          { name: 'status',        type: 'enum' },
          { name: 'priority',      type: 'enum' },
          { name: 'created_date',  type: 'timestamp' },
          { name: 'resolved_date', type: 'timestamp' },
          { name: 'csat_score',    type: 'int' },
        ],
      },
      {
        table: 'prod_usage_daily',
        fields: [
          { name: 'id',            type: 'uuid' },
          { name: 'company_id',    type: 'uuid' },
          { name: 'snapshot_date', type: 'date' },
          { name: 'active_users',  type: 'int' },
          { name: 'sessions',      type: 'int' },
          { name: 'features_used', type: 'int' },
          { name: 'api_calls',     type: 'int' },
        ],
      },
    ],
  },
  {
    label: 'Deal',
    tables: [
      {
        table: 'sls_opportunities',
        fields: [
          { name: 'id',                                   type: 'uuid' },
          { name: 'name',                                 type: 'text' },
          { name: 'company_id',                           type: 'uuid' },
          { name: 'primary_contact_id',                   type: 'uuid' },
          { name: 'owner_id',                             type: 'uuid' },
          { name: 'sdr_id',                               type: 'uuid' },
          { name: 'pipeline',                             type: 'enum' },
          { name: 'stage',                                type: 'enum' },
          { name: 'amount',                               type: 'decimal' },
          { name: 'arr',                                  type: 'decimal' },
          { name: 'term_months',                          type: 'int' },
          { name: 'close_date',                           type: 'date' },
          { name: 'created_date',                         type: 'date' },
          { name: 'discovery_meeting_status',             type: 'enum' },
          { name: 'discovery_meeting_date',               type: 'date' },
          { name: 'discovery_meeting_held_date',          type: 'date' },
          { name: 'discovery_meeting_reschedule_count',   type: 'int' },
          { name: 'lead_source',                          type: 'enum' },
          { name: 'lead_source_detail',                   type: 'text' },
          { name: 'segment',                              type: 'enum' },
          { name: 'vertical',                             type: 'enum' },
          { name: 'deal_type',                            type: 'enum' },
          { name: 'product_line',                         type: 'enum' },
          { name: 'probability',                          type: 'int' },
          { name: 'forecast_category',                    type: 'enum' },
          { name: 'next_step',                            type: 'text' },
          { name: 'lost_reason',                          type: 'enum' },
          { name: 'competitor',                           type: 'enum' },
          { name: 'stakeholder_count',                    type: 'int' },
          { name: 'has_economic_buyer_engaged',           type: 'bool' },
          { name: 'last_stage_change_date',               type: 'date' },
        ],
      },
      {
        table: 'sls_opportunity_contacts',
        fields: [
          { name: 'id',             type: 'uuid' },
          { name: 'opportunity_id', type: 'uuid' },
          { name: 'contact_id',     type: 'uuid' },
          { name: 'buying_role',    type: 'enum' },
          { name: 'is_primary',     type: 'bool' },
          { name: 'added_at',       type: 'timestamp' },
          { name: 'removed_at',     type: 'timestamp' },
        ],
      },
      {
        table: 'sls_activities',
        fields: [
          { name: 'id',             type: 'uuid' },
          { name: 'opportunity_id', type: 'uuid' },
          { name: 'contact_id',     type: 'uuid' },
          { name: 'type',           type: 'text' },
          { name: 'occurred_at',    type: 'timestamp' },
          { name: 'owner_id',       type: 'uuid' },
          { name: 'subject',        type: 'text' },
        ],
      },
      {
        table: 'sls_users',
        fields: [
          { name: 'id',         type: 'uuid' },
          { name: 'name',       type: 'text' },
          { name: 'email',      type: 'text' },
          { name: 'role',       type: 'enum' },
          { name: 'segment',    type: 'enum' },
          { name: 'quota',      type: 'decimal' },
          { name: 'hire_date',  type: 'date' },
        ],
      },
      {
        table: 'mkt_campaigns',
        fields: [
          { name: 'id',         type: 'uuid' },
          { name: 'name',       type: 'text' },
          { name: 'type',       type: 'enum' },
          { name: 'channel',    type: 'enum' },
          { name: 'program',    type: 'text' },
          { name: 'start_date', type: 'date' },
          { name: 'end_date',   type: 'date' },
          { name: 'cost',       type: 'decimal' },
        ],
      },
    ],
  },
]

const TYPE_COLORS: Record<string, string> = {
  uuid:      'bg-slate-100 text-slate-500',
  text:      'bg-blue-50 text-blue-600',
  int:       'bg-emerald-50 text-emerald-600',
  decimal:   'bg-emerald-50 text-emerald-600',
  date:      'bg-amber-50 text-amber-600',
  timestamp: 'bg-amber-50 text-amber-600',
  bool:      'bg-purple-50 text-purple-600',
  enum:      'bg-indigo-50 text-indigo-600',
}

function fmtModel(m: string | null) {
  if (!m) return '—'
  if (m.includes('haiku')) return 'Haiku 4.5'
  if (m.includes('sonnet')) return 'Sonnet 4.6'
  return m
}

function statusBadge(status: string) {
  if (status === 'success')
    return <span className="text-emerald-600 font-medium">success</span>
  if (status === 'paused_budget')
    return <span className="text-amber-600 font-medium">budget paused</span>
  return <span className="text-red-500 font-medium">{status}</span>
}

// ─── AI Monitor Section ───────────────────────────────────────────────────────

function AiMonitorSection() {
  const [data, setData]       = useState<MonitorData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/monitor')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json() as MonitorData)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const budget = data?.budget

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-500" />
          <h2 className="text-base font-semibold text-slate-900">AI Agent Monitoring</h2>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Budget gauge */}
      {budget && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-700">Daily Budget</h3>
            <div className="flex items-center gap-2">
              {budget.paused && (
                <span className="text-xs font-medium bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                  Paused
                </span>
              )}
              {budget.warning && !budget.paused && (
                <span className="text-xs font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                  80% used
                </span>
              )}
            </div>
          </div>

          {/* Bar */}
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all ${
                budget.paused ? 'bg-red-500' : budget.warning ? 'bg-amber-400' : 'bg-indigo-500'
              }`}
              style={{ width: `${budget.pct_used}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>
              ${budget.today_spend_usd.toFixed(4)} spent today
            </span>
            <span>
              {budget.pct_used.toFixed(1)}% of ${budget.daily_limit_usd.toFixed(2)} cap
            </span>
          </div>

          <p className="mt-2 text-xs text-slate-400">
            Budget resets at midnight UTC. Generation is auto-paused when the cap is reached;
            cached summaries continue to display.
          </p>
        </div>
      )}

      {/* Data Dictionary */}
      <DataDictionarySection />

      {/* Per-panel table */}
      {data && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-slate-700">AI Agent Models and Status</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-2.5 font-medium text-slate-500">Panel</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-500">Model</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-500">Last Generated</th>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-500">Tokens (in/out)</th>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-500">Cost</th>
                  <th className="text-center px-4 py-2.5 font-medium text-slate-500">Cache</th>
                </tr>
              </thead>
              <tbody>
                {data.panels.map((p) => (
                  <tr key={p.panel_id} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className="px-4 py-2.5 text-slate-700 font-medium">{p.title}</td>
                    <td className="px-4 py-2.5 text-slate-500">{fmtModel(p.model)}</td>
                    <td className="px-4 py-2.5 text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {fmt(p.last_generated)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-500">
                      {p.last_prompt_tokens !== null
                        ? `${p.last_prompt_tokens.toLocaleString()} / ${(p.last_completion_tokens ?? 0).toLocaleString()}`
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-500 font-mono">
                      {fmtCost(p.last_cost_usd)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {p.has_cache
                        ? <CheckCircle className="w-4 h-4 text-emerald-500 mx-auto" />
                        : <AlertCircle className="w-4 h-4 text-slate-300 mx-auto" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent runs */}
      {data && data.recent_runs.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-slate-700">Recent Runs (last 30)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-2.5 font-medium text-slate-500">Time</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-500">Panel</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-500">Model</th>
                  <th className="text-left px-4 py-2.5 font-medium text-slate-500">Status</th>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-500">Tokens</th>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-500">Cost</th>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-500">Latency</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_runs.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className="px-4 py-2 text-slate-500">{fmt(r.started_at)}</td>
                    <td className="px-4 py-2 text-slate-600 font-medium">{r.panel_id ?? '—'}</td>
                    <td className="px-4 py-2 text-slate-500">{fmtModel(r.model_used)}</td>
                    <td className="px-4 py-2">{statusBadge(r.status)}</td>
                    <td className="px-4 py-2 text-right text-slate-500">
                      {r.prompt_tokens > 0
                        ? `${r.prompt_tokens.toLocaleString()} / ${r.completion_tokens.toLocaleString()}`
                        : '—'}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-500 font-mono">
                      {r.cost_usd > 0 ? fmtCost(r.cost_usd) : '—'}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-500">
                      {r.latency_ms > 0 ? `${(r.latency_ms / 1000).toFixed(1)}s` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin" />
        </div>
      )}
    </div>
  )
}

// ─── Data Dictionary ──────────────────────────────────────────────────────────

type DictEntry = { name: string; formula: string; note: string }
type DictCategory = { label: string; textColor: string; bgColor: string; entries: DictEntry[] }

const DATA_DICT: DictCategory[] = [
  {
    label: 'Pipeline & Revenue',
    textColor: 'text-indigo-700',
    bgColor: 'bg-indigo-50',
    entries: [
      {
        name: 'Pipeline ARR',
        formula: 'SUM(opp.arr) — open stages only',
        note: 'Total ARR across all non-closed opportunities, regardless of probability.',
      },
      {
        name: 'Weighted ARR',
        formula: 'SUM(opp.arr × opp.probability / 100)',
        note: 'Pipeline ARR discounted by each deal\'s close probability.',
      },
      {
        name: 'New Bookings ARR',
        formula: 'SUM(arr_delta) where movement_type = \'new\'',
        note: 'ARR contracted from net-new logos in the period.',
      },
      {
        name: 'ARR Growth',
        formula: '(ARR_current − ARR_prior) / ARR_prior',
        note: 'Period-over-period percentage change in total active ARR.',
      },
    ],
  },
  {
    label: 'ARR Waterfall',
    textColor: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    entries: [
      {
        name: 'Expansion ARR',
        formula: 'SUM(arr_delta) where movement_type = \'expansion\'',
        note: 'Incremental ARR added via upsell or cross-sell to existing customers.',
      },
      {
        name: 'Churn ARR',
        formula: 'ABS(SUM(arr_delta)) where movement_type = \'churn\'',
        note: 'ARR lost from full subscription cancellations in the period.',
      },
      {
        name: 'Contraction ARR',
        formula: 'ABS(SUM(arr_delta)) where movement_type = \'contraction\'',
        note: 'ARR lost from downgrades on active subscriptions (partial churn).',
      },
    ],
  },
  {
    label: 'Retention',
    textColor: 'text-amber-700',
    bgColor: 'bg-amber-50',
    entries: [
      {
        name: 'Net Revenue Retention',
        formula: '(Beg ARR + Expansion − Churn − Contraction) / Beg ARR',
        note: 'Revenue growth or loss from the existing base; can exceed 100%. Benchmark: > 120% best-in-class.',
      },
      {
        name: 'Gross Revenue Retention',
        formula: '(Beg ARR − Churn − Contraction) / Beg ARR',
        note: 'Retention excluding upsell; always ≤ 100%. Benchmark: > 85% SMB, > 90% enterprise.',
      },
    ],
  },
  {
    label: 'Unit Economics',
    textColor: 'text-purple-700',
    bgColor: 'bg-purple-50',
    entries: [
      {
        name: 'Gross Margin',
        formula: '(Revenue − COGS) / Revenue',
        note: 'Revenue remaining after direct costs. SaaS benchmark: 70–80%.',
      },
      {
        name: 'Blended CAC',
        formula: 'Total S&M Spend / New Customers Acquired',
        note: 'All-in cost to acquire one new customer, blended across all channels.',
      },
      {
        name: 'CAC Payback',
        formula: 'CAC / (MRR per Customer × Gross Margin)',
        note: 'Months to recover customer acquisition cost. Benchmark: < 18 months.',
      },
      {
        name: 'Customer LTV',
        formula: '(Avg ARR × Gross Margin) / Annual Churn Rate',
        note: 'Expected lifetime gross profit per customer assuming constant churn.',
      },
      {
        name: 'LTV / CAC',
        formula: 'Customer LTV / Blended CAC',
        note: 'Return on customer acquisition investment. Benchmark: > 3×.',
      },
      {
        name: 'Magic Number',
        formula: 'Net New ARR (Q) / S&M Spend (Q−1)',
        note: 'ARR generated per dollar of prior-quarter S&M spend. Benchmark: > 1.0 is efficient.',
      },
    ],
  },
]

function DataDictionarySection() {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-1">
        <BookOpen className="w-4 h-4 text-slate-400" />
        <h2 className="text-base font-semibold text-slate-900">Data Dictionary</h2>
      </div>
      <p className="text-sm text-slate-500 mb-5">
        Formulas used to compute primary calculated metrics across the platform.
      </p>
      <div className="rounded-lg border border-gray-100 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-2.5 font-medium text-slate-500 w-44">Metric</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-500 w-80">Formula</th>
              <th className="text-left px-4 py-2.5 font-medium text-slate-500">Notes</th>
            </tr>
          </thead>
          <tbody>
            {DATA_DICT.map((cat) => (
              <React.Fragment key={cat.label}>
                <tr>
                  <td
                    colSpan={3}
                    className={`px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest border-t border-gray-100 ${cat.textColor} ${cat.bgColor}`}
                  >
                    {cat.label}
                  </td>
                </tr>
                {cat.entries.map((entry) => (
                  <tr key={entry.name} className="border-t border-gray-50 hover:bg-gray-50/60">
                    <td className="px-4 py-2.5 font-medium text-slate-700 align-top whitespace-nowrap">{entry.name}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-500 align-top">{entry.formula}</td>
                    <td className="px-4 py-2.5 text-slate-400 align-top">{entry.note}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminPage() {
  return (
    <div className="space-y-8 max-w-4xl">
      {/* AI Agent Monitoring */}
      <AiMonitorSection />

      {/* Required Data Fields */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-1">Mapped Fields for Integration</h2>
        <p className="text-sm text-slate-500 mb-5">Fields to map from your CRM and marketing automation platform, organized by object and source table.</p>
        <div className="grid grid-cols-3 gap-6 items-start">
          {DATA_FIELDS.map((obj) => (
            <div key={obj.label}>
              <div className="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-3">{obj.label}</div>
              <div className="space-y-4">
                {obj.tables.map((tbl) => (
                  <div key={tbl.table}>
                    <div className="text-xs font-mono font-semibold text-slate-400 mb-1.5">{tbl.table}</div>
                    <div className="space-y-0.5">
                      {tbl.fields.map((f) => (
                        <div key={f.name} className="flex items-center justify-between px-2.5 py-1 bg-gray-50 rounded">
                          <span className="text-xs font-mono text-slate-700">{f.name}</span>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${TYPE_COLORS[f.type] ?? 'bg-gray-100 text-gray-500'}`}>{f.type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
