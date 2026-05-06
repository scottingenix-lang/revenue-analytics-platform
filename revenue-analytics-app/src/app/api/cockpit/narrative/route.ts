import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const CACHE_HOURS = 24

export async function GET() {
  const supabase = await createClient()

  // Check for a cached narrative within CACHE_HOURS
  const cutoff = new Date(Date.now() - CACHE_HOURS * 60 * 60 * 1000).toISOString()
  const { data: cached } = await supabase
    .from('ai_alerts')
    .select('body, created_at')
    .eq('title', 'Weekly Narrative Summary')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (cached) {
    return NextResponse.json({
      narrative: cached.body,
      generated_at: cached.created_at,
      cached: true,
    })
  }

  // Gather metrics snapshot
  const trailing12 = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const trailing90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [arrData, mvmtData, pipelineData, winData, gmData] = await Promise.all([
    supabase.from('sub_subscriptions').select('arr').eq('status', 'active'),
    supabase.from('sub_arr_movements').select('movement_type, arr_delta').gte('effective_date', trailing12),
    supabase.from('sls_opportunities').select('arr, stage').not('stage', 'in', '("6","Closed Lost")'),
    supabase.from('sls_opportunities').select('stage').in('stage', ['6', 'Closed Lost']).gte('close_date', trailing90),
    supabase.from('fin_margin').select('gross_margin_pct').order('fiscal_month', { ascending: false }).limit(3),
  ])

  const total_arr = (arrData.data ?? []).reduce((s, r) => s + Number(r.arr), 0)
  const mvs = mvmtData.data ?? []
  const expansion = mvs.filter((m) => m.movement_type === 'Expansion').reduce((s, m) => s + Number(m.arr_delta), 0)
  const contraction = mvs.filter((m) => m.movement_type === 'Contraction').reduce((s, m) => s + Math.abs(Number(m.arr_delta)), 0)
  const churn = mvs.filter((m) => m.movement_type === 'Churn').reduce((s, m) => s + Math.abs(Number(m.arr_delta)), 0)
  const startArr = total_arr - expansion + contraction + churn
  const nrr = startArr > 0 ? Math.round(((startArr + expansion - contraction - churn) / startArr) * 1000) / 10 : 0

  const pipeline_arr = (pipelineData.data ?? []).reduce((s, o) => s + Number(o.arr ?? 0), 0)
  const closed = winData.data ?? []
  const won = closed.filter((o) => o.stage === '6').length
  const win_rate = won + (closed.length - won) > 0 ? Math.round((won / closed.length) * 1000) / 10 : 0

  const gm_rows = gmData.data ?? []
  const gross_margin = gm_rows.length > 0
    ? Math.round((gm_rows.reduce((s, r) => s + Number(r.gross_margin_pct), 0) / gm_rows.length) * 1000) / 10
    : 0

  const metrics = {
    total_arr_m: Math.round(total_arr / 1_000_000 * 10) / 10,
    nrr_pct: nrr,
    expansion_arr_k: Math.round(expansion / 1_000),
    churn_arr_k: Math.round(churn / 1_000),
    contraction_arr_k: Math.round(contraction / 1_000),
    open_pipeline_m: Math.round(pipeline_arr / 1_000_000 * 10) / 10,
    win_rate_pct_trailing_90d: win_rate,
    gross_margin_pct: gross_margin,
  }

  // Call Claude
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({
      narrative: 'AI narrative unavailable — ANTHROPIC_API_KEY not configured.',
      generated_at: new Date().toISOString(),
      cached: false,
    })
  }

  const client = new Anthropic({ apiKey })
  const started_at = new Date().toISOString()

  let narrative = ''
  let input_tokens = 0
  let output_tokens = 0
  let latency_ms = 0
  let status: 'success' | 'error' = 'success'
  let error_message: string | undefined

  try {
    const t0 = Date.now()
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system:
        'You are a revenue analytics assistant. Write a 4-6 sentence executive summary of this week\'s GTM performance. Be specific. Cite the metric name, the value, and whether it is trending up, down, or flat. Use plain English. No bullet points. No markdown. Tone: confident but not boastful.',
      messages: [
        {
          role: 'user',
          content: `Here is the current metrics snapshot:\n${JSON.stringify(metrics, null, 2)}`,
        },
      ],
    })
    latency_ms = Date.now() - t0
    narrative = message.content[0].type === 'text' ? message.content[0].text : ''
    input_tokens = message.usage.input_tokens
    output_tokens = message.usage.output_tokens
  } catch (err) {
    status = 'error'
    error_message = err instanceof Error ? err.message : 'Unknown error'
    narrative = 'AI narrative generation failed. Please check server logs.'
  }

  // Log the run
  const { data: runData } = await supabase
    .from('ai_agent_runs')
    .insert({
      agent_name: 'narrative_summary',
      started_at,
      completed_at: new Date().toISOString(),
      status,
      input_tokens,
      output_tokens,
      cost_usd: (input_tokens * 0.00000025 + output_tokens * 0.00000125),
      latency_ms,
      records_processed: 1,
      error_message,
    })
    .select('id')
    .maybeSingle()

  // Store alert
  if (status === 'success' && runData?.id) {
    await supabase.from('ai_alerts').insert({
      agent_run_id: runData.id,
      severity: 'Info',
      title: 'Weekly Narrative Summary',
      body: narrative,
      metric_name: 'narrative',
    })
  }

  return NextResponse.json({
    narrative,
    generated_at: new Date().toISOString(),
    cached: false,
  })
}
