'use client'

import { useState } from 'react'
import { RefreshCw, CheckCircle, AlertCircle } from 'lucide-react'

const VIEWS = [
  'mv_arr_daily',
  'mv_funnel_conversion_monthly',
  'mv_attribution_first_touch',
  'mv_attribution_last_touch',
  'mv_attribution_linear',
  'mv_attribution_time_decay',
  'mv_attribution_w_shaped',
  'mv_pipeline_coverage_weekly',
  'mv_cohort_retention_monthly',
  'mv_lead_source_influence_weights',
  'mv_cac_by_source_quarterly',
  'mv_stage_velocity_stats',
  'mv_overall_cycle_stats',
  'mv_discovery_meeting_ops',
]

export default function AdminPage() {
  const [refreshing, setRefreshing] = useState(false)
  const [result, setResult] = useState<{ refreshed_at: string; results: Record<string, string> } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleRefresh() {
    setRefreshing(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/admin/refresh-views', { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-1">Materialized View Refresh</h2>
        <p className="text-sm text-slate-500 mb-5">
          Refreshes all {VIEWS.length} materialized views in the local Supabase database. In
          production this runs automatically via a Vercel cron job at 6 AM UTC daily.
        </p>

        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold px-5 py-2.5 rounded-lg transition-colors text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing…' : 'Refresh All Views'}
        </button>

        {error && (
          <div className="mt-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {result && (
          <div className="mt-4">
            <p className="text-xs text-slate-500 mb-3">
              Refreshed at {new Date(result.refreshed_at).toLocaleString()}
            </p>
            <div className="space-y-1.5">
              {Object.entries(result.results).map(([view, status]) => (
                <div key={view} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-gray-50">
                  <span className="text-xs font-mono text-slate-600">{view}</span>
                  <span className={`flex items-center gap-1 text-xs font-medium ${status === 'ok' ? 'text-emerald-600' : 'text-red-500'}`}>
                    {status === 'ok' ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                    {status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* View list */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-4">Registered Materialized Views</h2>
        <div className="space-y-1.5">
          {VIEWS.map((v) => (
            <div key={v} className="px-3 py-2 bg-gray-50 rounded-lg text-xs font-mono text-slate-600">
              {v}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
