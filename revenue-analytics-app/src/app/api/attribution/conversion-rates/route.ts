import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { SourceConversionRow } from '@/lib/types'

function pct(num: number, den: number) {
  return den > 0 ? Math.round((num / den) * 1000) / 10 : 0
}

const MQL_STAGES = new Set(['MQL', 'SQL', 'Opportunity', 'Customer', 'Evangelist'])
const SQL_STAGES = new Set(['SQL', 'Opportunity', 'Customer', 'Evangelist'])

const COMPANY_SIZE_ORDER = ['SMB', 'Mid-Market', 'Enterprise']

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const dimension = searchParams.get('dimension') ?? 'lead_source'
  const supabase = await createClient()

  // ── Lead Source: use pre-aggregated MV ──────────────────────
  if (dimension === 'lead_source') {
    const [convRes, histRes, oppRes] = await Promise.all([
      supabase
        .from('mv_source_conversion_rates')
        .select('lead_source, cohort_month, trailing_12mo_leads, trailing_12mo_mqls, trailing_12mo_sqls, trailing_12mo_lead_to_mql_pct, trailing_12mo_mql_to_sql_pct')
        .order('cohort_month', { ascending: false }),
      supabase
        .from('sls_opportunity_history')
        .select('opportunity_id, from_stage, to_stage')
        .in('from_stage', ['0', '1', '2', '3', '4', '5'])
        .limit(50000),
      supabase
        .from('sls_opportunities')
        .select('id, lead_source, stage')
        .not('lead_source', 'is', null)
        .limit(50000),
    ])

    if (convRes.error || !convRes.data) return NextResponse.json([])

    const srcMap: Record<string, string> = {}
    const winStats: Record<string, { wins: number; total: number }> = {}
    for (const o of oppRes.data ?? []) {
      if (!o.lead_source) continue
      srcMap[o.id] = o.lead_source
      if (o.stage === '6' || o.stage === 'Closed Lost') {
        if (!winStats[o.lead_source]) winStats[o.lead_source] = { wins: 0, total: 0 }
        winStats[o.lead_source].total++
        if (o.stage === '6') winStats[o.lead_source].wins++
      }
    }

    const counts: Record<string, Record<string, { won: number; lost: number }>> = {}
    for (const h of histRes.data ?? []) {
      const src = srcMap[h.opportunity_id]
      if (!src) continue
      if (!counts[src]) counts[src] = {}
      if (!counts[src][h.from_stage]) counts[src][h.from_stage] = { won: 0, lost: 0 }
      h.to_stage === 'Closed Lost' ? counts[src][h.from_stage].lost++ : counts[src][h.from_stage].won++
    }

    function stageRate(src: string, from: string) {
      const c = counts[src]?.[from]
      return c ? pct(c.won, c.won + c.lost) : 0
    }

    const latest: Record<string, (typeof convRes.data)[0]> = {}
    for (const row of convRes.data) {
      if (!(row.lead_source in latest)) latest[row.lead_source] = row
    }

    const rows: SourceConversionRow[] = Object.values(latest)
      .filter((r) => Number(r.trailing_12mo_leads ?? 0) > 0 && r.lead_source !== 'ZoomInfo')
      .map((r) => {
        const src = r.lead_source ?? ''
        const ws = winStats[src]
        return {
          lead_source:         src,
          trailing_12mo_mqls:  Number(r.trailing_12mo_mqls  ?? 0),
          trailing_12mo_sqls:  Number(r.trailing_12mo_sqls  ?? 0),
          lead_to_mql_pct:     Math.round(Number(r.trailing_12mo_lead_to_mql_pct ?? 0) * 1000) / 10,
          mql_to_sql_pct:      Math.round(Number(r.trailing_12mo_mql_to_sql_pct  ?? 0) * 1000) / 10,
          s0_to_s1: stageRate(src, '0'),
          s1_to_s2: stageRate(src, '1'),
          s2_to_s3: stageRate(src, '2'),
          s3_to_s4: stageRate(src, '3'),
          s4_to_s5: stageRate(src, '4'),
          s5_to_s6: stageRate(src, '5'),
          win_rate:   ws ? pct(ws.wins, ws.total) : 0,
          deal_count: ws?.total ?? 0,
        }
      })
      .sort((a, b) => b.trailing_12mo_mqls - a.trailing_12mo_mqls)

    return NextResponse.json(rows)
  }

  // ── Company Size or Industry: compute from raw tables ────────
  const groupField = dimension === 'company_size' ? 'company_size' : 'vertical_tag'

  const t12 = new Date()
  t12.setFullYear(t12.getFullYear() - 1)
  const t12iso = t12.toISOString()

  const [contactRes, companyRes, histRes, oppRes] = await Promise.all([
    supabase
      .from('mkt_contacts')
      .select('lifecycle_stage, company_id')
      .gte('created_date', t12iso)
      .limit(50000),
    supabase
      .from('mkt_companies')
      .select('id, company_size, vertical_tag')
      .limit(10000),
    supabase
      .from('sls_opportunity_history')
      .select('opportunity_id, from_stage, to_stage')
      .in('from_stage', ['0', '1', '2', '3', '4', '5'])
      .limit(50000),
    supabase
      .from('sls_opportunities')
      .select('id, company_id, stage')
      .limit(10000),
  ])

  // company_id → { company_size, vertical_tag }
  const companyMap: Record<string, { company_size: string; vertical_tag: string }> = {}
  for (const c of companyRes.data ?? []) {
    companyMap[c.id] = { company_size: c.company_size ?? '', vertical_tag: c.vertical_tag ?? '' }
  }

  // Funnel counts by dimension key
  const funnel: Record<string, { leads: number; mqls: number; sqls: number }> = {}
  for (const contact of contactRes.data ?? []) {
    const co = companyMap[contact.company_id]
    const key = co ? (groupField === 'company_size' ? co.company_size : co.vertical_tag) : null
    if (!key) continue
    if (!funnel[key]) funnel[key] = { leads: 0, mqls: 0, sqls: 0 }
    funnel[key].leads++
    if (MQL_STAGES.has(contact.lifecycle_stage)) funnel[key].mqls++
    if (SQL_STAGES.has(contact.lifecycle_stage)) funnel[key].sqls++
  }

  // Stage transition counts + win stats by dimension key
  const oppCompany: Record<string, { company_id: string; stage: string }> = {}
  for (const o of oppRes.data ?? []) oppCompany[o.id] = { company_id: o.company_id, stage: o.stage }

  const dimWinStats: Record<string, { wins: number; total: number }> = {}
  for (const o of oppRes.data ?? []) {
    const co = companyMap[o.company_id]
    const key = co ? (groupField === 'company_size' ? co.company_size : co.vertical_tag) : null
    if (!key || (o.stage !== '6' && o.stage !== 'Closed Lost')) continue
    if (!dimWinStats[key]) dimWinStats[key] = { wins: 0, total: 0 }
    dimWinStats[key].total++
    if (o.stage === '6') dimWinStats[key].wins++
  }

  const stageCounts: Record<string, Record<string, { won: number; lost: number }>> = {}
  for (const h of histRes.data ?? []) {
    const companyId = oppCompany[h.opportunity_id]?.company_id
    const co = companyMap[companyId]
    const key = co ? (groupField === 'company_size' ? co.company_size : co.vertical_tag) : null
    if (!key) continue
    if (!stageCounts[key]) stageCounts[key] = {}
    if (!stageCounts[key][h.from_stage]) stageCounts[key][h.from_stage] = { won: 0, lost: 0 }
    h.to_stage === 'Closed Lost'
      ? stageCounts[key][h.from_stage].lost++
      : stageCounts[key][h.from_stage].won++
  }

  function stageRate(key: string, from: string) {
    const c = stageCounts[key]?.[from]
    return c ? pct(c.won, c.won + c.lost) : 0
  }

  const rows: SourceConversionRow[] = Object.entries(funnel)
    .filter(([, f]) => f.leads > 0)
    .map(([key, f]) => {
      const ws = dimWinStats[key]
      return {
        lead_source:         key,
        trailing_12mo_mqls:  f.mqls,
        trailing_12mo_sqls:  f.sqls,
        lead_to_mql_pct:     pct(f.mqls, f.leads),
        mql_to_sql_pct:      pct(f.sqls, f.mqls),
        s0_to_s1: stageRate(key, '0'),
        s1_to_s2: stageRate(key, '1'),
        s2_to_s3: stageRate(key, '2'),
        s3_to_s4: stageRate(key, '3'),
        s4_to_s5: stageRate(key, '4'),
        s5_to_s6: stageRate(key, '5'),
        win_rate:   ws ? pct(ws.wins, ws.total) : 0,
        deal_count: ws?.total ?? 0,
      }
    })
    .sort((a, b) =>
      dimension === 'company_size'
        ? COMPANY_SIZE_ORDER.indexOf(a.lead_source) - COMPANY_SIZE_ORDER.indexOf(b.lead_source)
        : b.trailing_12mo_mqls - a.trailing_12mo_mqls
    )

  return NextResponse.json(rows)
}
