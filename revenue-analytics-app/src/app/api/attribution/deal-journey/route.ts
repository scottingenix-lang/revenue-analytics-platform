import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { DealSearchResult, DealJourneyResponse } from '@/lib/types'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q  = searchParams.get('q')?.trim()
  const id = searchParams.get('id')?.trim()
  const supabase = await createClient()

  // ── Search mode ──────────────────────────────────────────────
  if (q) {
    const { data } = await supabase
      .from('sls_opportunities')
      .select('id, name, arr, stage, close_date, lead_source')
      .ilike('name', `%${q}%`)
      .limit(10)

    const results: DealSearchResult[] = (data ?? []).map((r) => ({
      id:          r.id,
      name:        r.name ?? '',
      arr:         Number(r.arr ?? 0),
      stage:       r.stage ?? '',
      close_date:  r.close_date ?? '',
      lead_source: r.lead_source,
    }))
    return NextResponse.json(results)
  }

  // ── Journey mode ─────────────────────────────────────────────
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })

  const { data: opp } = await supabase
    .from('sls_opportunities')
    .select('id, name, arr, stage, created_date, close_date, lead_source, segment, owner_id')
    .eq('id', id)
    .single()

  if (!opp) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // Primary contact
  const { data: oppContacts } = await supabase
    .from('sls_opportunity_contacts')
    .select('contact_id')
    .eq('opportunity_id', id)
    .eq('is_primary', true)
    .limit(1)

  const primaryId = oppContacts?.[0]?.contact_id ?? null

  let contact = null
  let touches: DealJourneyResponse['touches'] = []

  if (primaryId) {
    const [touchRes, contactRes] = await Promise.all([
      supabase
        .from('mkt_touches')
        .select('id, touch_type, touch_date, pre_or_post_deal, engagement_score, touch_value, campaign_id')
        .eq('contact_id', primaryId)
        .order('touch_date', { ascending: true }),
      supabase
        .from('mkt_contacts')
        .select('id, first_name, last_name, title, lead_source, original_lead_source')
        .eq('id', primaryId)
        .single(),
    ])

    contact = contactRes.data ?? null

    const rawTouches = touchRes.data ?? []

    // Fetch campaign names
    const campaignIds = [...new Set(rawTouches.filter((t) => t.campaign_id).map((t) => t.campaign_id!))]
    const campMap: Record<string, { name: string; campaign_type: string }> = {}
    if (campaignIds.length > 0) {
      const { data: campaigns } = await supabase
        .from('mkt_campaigns')
        .select('id, name, campaign_type')
        .in('id', campaignIds)
      for (const c of campaigns ?? []) campMap[c.id] = { name: c.name, campaign_type: c.campaign_type }
    }

    touches = rawTouches.map((t) => ({
      id:              t.id,
      touch_type:      t.touch_type,
      touch_date:      t.touch_date,
      pre_or_post_deal: t.pre_or_post_deal as 'pre' | 'post' | 'no_deal',
      engagement_score: Number(t.engagement_score ?? 0),
      touch_value:     t.touch_value != null ? Number(t.touch_value) : null,
      campaign_id:     t.campaign_id,
      campaign:        t.campaign_id ? (campMap[t.campaign_id] ?? null) : null,
    }))
  }

  // Owner name
  const { data: ownerRow } = await supabase
    .from('sls_users')
    .select('name')
    .eq('id', opp.owner_id)
    .single()

  const response: DealJourneyResponse = {
    opp: {
      id:          opp.id,
      name:        opp.name ?? '',
      arr:         Number(opp.arr ?? 0),
      stage:       opp.stage ?? '',
      created_date: opp.created_date ?? '',
      close_date:   opp.close_date ?? '',
      lead_source:  opp.lead_source,
      segment:      opp.segment,
      owner_name:   ownerRow?.name ?? null,
    },
    contact,
    touches,
  }

  return NextResponse.json(response)
}
