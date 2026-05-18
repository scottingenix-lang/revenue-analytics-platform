import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// ── Quarter helpers ────────────────────────────────────────────────────────────

type Quarter = {
  label: string       // display: "Q3 2025"
  fiscalKey: string   // DB key: "Q3-2025"
  endDate: string     // ISO date: "2025-09-30"
}

function rollingFourQuarters(): Quarter[] {
  const now = new Date()
  const curQ = Math.floor(now.getMonth() / 3)   // 0-based
  const curY = now.getFullYear()
  const today = now.toISOString().split('T')[0]

  const quarters: Quarter[] = []
  for (let i = 3; i >= 0; i--) {
    let q = curQ - i
    let y = curY
    while (q < 0) { q += 4; y-- }
    const isCurrent = (q === curQ && y === curY)
    const endDate = isCurrent
      ? today
      : new Date(y, q * 3 + 3, 0).toISOString().split('T')[0]  // last day of quarter
    quarters.push({
      label:     `Q${q + 1} ${y}`,
      fiscalKey: `Q${q + 1}-${y}`,
      endDate,
    })
  }
  return quarters
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET() {
  const supabase = await createClient()
  const quarters = rollingFourQuarters()
  const fiscalKeys = quarters.map(q => q.fiscalKey)

  // Fetch everything in parallel
  const [mvResult, movementsResult, subsResult, companiesResult] = await Promise.all([
    // Company size: one snapshot per quarter from mv_arr_daily
    supabase
      .from('mv_arr_daily')
      .select('snapshot_date, arr_smb, arr_midmarket, arr_enterprise')
      .in('snapshot_date', quarters.map(q => q.endDate)),

    // Revenue type: movements in these 4 quarters
    supabase
      .from('sub_arr_movements')
      .select('movement_type, arr_delta, fiscal_quarter')
      .in('fiscal_quarter', fiscalKeys),

    // Industry: all subscriptions with dates (for historical snapshots)
    supabase
      .from('sub_subscriptions')
      .select('company_id, arr, start_date, churned_at'),

    // Company lookup
    supabase
      .from('mkt_companies')
      .select('id, industry'),
  ])

  const mvRows       = mvResult.data       ?? []
  const movements    = movementsResult.data ?? []
  const subs         = subsResult.data      ?? []
  const companies    = companiesResult.data ?? []

  // ── Company Size ────────────────────────────────────────────────────────────
  // mv_arr_daily may not have an exact row for q.endDate (e.g. current quarter uses today's date
  // but the MV might lag a few days). Fall back to the closest available snapshot.
  const { data: allMvRows } = await supabase
    .from('mv_arr_daily')
    .select('snapshot_date, arr_smb, arr_midmarket, arr_enterprise')
    .order('snapshot_date', { ascending: true })

  const allMv = allMvRows ?? []

  function closestMvSnapshot(endDate: string) {
    const candidates = allMv.filter(r => r.snapshot_date <= endDate)
    return candidates[candidates.length - 1] ?? null
  }

  const companySizeSeries = [
    { name: 'SMB',        color: '#a5b4fc' },
    { name: 'Mid-Market', color: '#6366f1' },
    { name: 'Enterprise', color: '#3730a3' },
  ].map(s => ({
    ...s,
    data: quarters.map(q => {
      const snap = closestMvSnapshot(q.endDate)
      if (!snap) return 0
      const val = s.name === 'SMB'        ? snap.arr_smb
                : s.name === 'Mid-Market' ? snap.arr_midmarket
                :                           snap.arr_enterprise
      return Math.round(Number(val ?? 0))
    }),
  }))

  // ── Industry ────────────────────────────────────────────────────────────────
  const companyIndustry = new Map(companies.map(c => [c.id as string, c.industry as string | null]))

  const INDUSTRY_COLORS: Record<string, string> = {
    'Technology':           '#6366f1',
    'Financial Services':   '#3b82f6',
    'Healthcare':           '#059669',
    'Manufacturing':        '#f59e0b',
    'Federal/Public Sector':'#8b5cf6',
    'Energy & Utilities':   '#ec4899',
    'Other':                '#94a3b8',
  }

  const industrySeries = Object.keys(INDUSTRY_COLORS).map(ind => ({
    name:  ind,
    color: INDUSTRY_COLORS[ind],
    data:  quarters.map(q => {
      const endDate = q.endDate
      let total = 0
      for (const sub of subs) {
        if (!sub.start_date || sub.start_date > endDate) continue
        if (sub.churned_at && sub.churned_at <= endDate) continue
        const industry = companyIndustry.get(sub.company_id) ?? 'Other'
        if (industry === ind) total += Number(sub.arr ?? 0)
      }
      return Math.round(total)
    }),
  })).filter(s => s.data.some(v => v > 0))

  // ── Revenue Type ────────────────────────────────────────────────────────────
  const REVENUE_TYPE_COLORS: Record<string, string> = {
    New:       '#059669',
    Expansion: '#6366f1',
    Churn:     '#ef4444',
  }

  const revenueTypeSeries = Object.entries(REVENUE_TYPE_COLORS).map(([type, color]) => ({
    name:  type,
    color,
    data:  quarters.map(q =>
      movements
        .filter(m => m.movement_type === type && m.fiscal_quarter === q.fiscalKey)
        .reduce((s, m) => s + Number(m.arr_delta), 0)
    ).map(v => Math.round(v)),
  })).filter(s => s.data.some(v => v !== 0))

  return NextResponse.json({
    quarters:          quarters.map(q => q.label),
    companySizeSeries,
    industrySeries,
    revenueTypeSeries,
  })
}
