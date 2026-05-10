import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { ChannelHandoffRow } from '@/lib/types'

export async function GET() {
  const supabase = await createClient()

  const [oppsRes, ocRes, contactsRes] = await Promise.all([
    supabase
      .from('sls_opportunities')
      .select('id, lead_source, arr')
      .eq('stage', '6'),
    supabase
      .from('sls_opportunity_contacts')
      .select('opportunity_id, contact_id')
      .eq('is_primary', true),
    supabase
      .from('mkt_contacts')
      .select('id, original_lead_source'),
  ])

  const oppMap: Record<string, { lead_source: string; arr: number }> = {}
  for (const o of oppsRes.data ?? []) {
    oppMap[o.id] = { lead_source: o.lead_source ?? 'Unknown', arr: Number(o.arr ?? 0) }
  }
  const contactMap: Record<string, string> = {}
  for (const c of contactsRes.data ?? []) {
    contactMap[c.id] = c.original_lead_source ?? 'Unknown'
  }

  // Aggregate by (original_lead_source × deal_lead_source)
  const grouped: Record<string, { deal_count: number; arr: number }> = {}
  for (const oc of ocRes.data ?? []) {
    const opp = oppMap[oc.opportunity_id]
    const orig = contactMap[oc.contact_id]
    if (!opp || !orig) continue
    const key = `${orig}|||${opp.lead_source}`
    if (!grouped[key]) grouped[key] = { deal_count: 0, arr: 0 }
    grouped[key].deal_count++
    grouped[key].arr += opp.arr
  }

  // Source totals for pct_of_source
  const sourceTotals: Record<string, number> = {}
  for (const [key, val] of Object.entries(grouped)) {
    const src = key.split('|||')[0]
    sourceTotals[src] = (sourceTotals[src] ?? 0) + val.deal_count
  }

  const rows: ChannelHandoffRow[] = Object.entries(grouped)
    .map(([key, val]) => {
      const [orig, deal] = key.split('|||')
      return {
        original_lead_source: orig,
        deal_lead_source:     deal,
        deal_count:           val.deal_count,
        closed_won_arr:       Math.round(val.arr),
        pct_of_source:        sourceTotals[orig] > 0
          ? Math.round((val.deal_count / sourceTotals[orig]) * 100)
          : 0,
      }
    })
    .sort((a, b) => b.deal_count - a.deal_count)

  const originalSources = Array.from(new Set(rows.map((r) => r.original_lead_source)))
    .filter((s) => s !== 'ZoomInfo')
    .sort()
  const dealSources = Array.from(new Set(rows.map((r) => r.deal_lead_source))).sort()

  return NextResponse.json({ rows, originalSources, dealSources })
}
