import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { DiscoveryOpsRow, DiscoveryBookingWeek } from '@/lib/types'

function weekMonday(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  const dow = d.getUTCDay()              // 0=Sun … 6=Sat
  const diff = dow === 0 ? -6 : 1 - dow // days back to Monday
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

function fmtWeekLabel(mondayStr: string): string {
  const start = new Date(mondayStr + 'T00:00:00Z')
  const end   = new Date(mondayStr + 'T00:00:00Z')
  end.setUTCDate(end.getUTCDate() + 6)
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const endStr   = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return `${startStr}–${endStr}`
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sdrFilter  = searchParams.get('sdr')  ?? ''
  const sizeFilter = searchParams.get('size') ?? ''

  const supabase  = await createClient()
  const today     = new Date().toISOString().slice(0, 10)
  const fiveWeeks = new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [opsRes, upcomingRes, usersRes] = await Promise.all([
    supabase
      .from('mv_discovery_meeting_ops')
      .select('*')
      .order('held_rate', { ascending: false }),
    supabase
      .from('sls_opportunities')
      .select('discovery_meeting_date, discovery_meeting_status, sdr_id, segment')
      .gte('discovery_meeting_date', today)
      .lte('discovery_meeting_date', fiveWeeks)
      .in('discovery_meeting_status', ['Scheduled', 'Rescheduling', 'No Show - Rescheduling']),
    supabase.from('sls_users').select('id, name'),
  ])

  const userMap: Record<string, string> = {}
  for (const u of usersRes.data ?? []) userMap[u.id] = u.name

  // Build 5-week buckets starting from current-week Monday
  const curMonday = weekMonday(today)
  const weeks: DiscoveryBookingWeek[] = Array.from({ length: 4 }, (_, i) => {
    const d = new Date(curMonday + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + i * 7)
    const ws = d.toISOString().slice(0, 10)
    return { week_start: ws, week_label: fmtWeekLabel(ws), sdrs: {}, total: 0 }
  })

  for (const opp of upcomingRes.data ?? []) {
    if (!opp.discovery_meeting_date || !opp.sdr_id) continue
    const sdrName = userMap[opp.sdr_id] ?? 'Unknown'
    if (sdrFilter  && sdrName      !== sdrFilter)  continue
    if (sizeFilter && opp.segment  !== sizeFilter) continue

    const ws   = weekMonday(opp.discovery_meeting_date)
    const week = weeks.find((w) => w.week_start === ws)
    if (!week) continue
    week.sdrs[sdrName] = (week.sdrs[sdrName] ?? 0) + 1
    week.total++
  }

  const ops      = (opsRes.data ?? []) as DiscoveryOpsRow[]
  const sdrNames = Array.from(new Set(ops.map((o) => o.sdr_name))).sort()

  return NextResponse.json({ ops, weeks, sdrNames })
}
