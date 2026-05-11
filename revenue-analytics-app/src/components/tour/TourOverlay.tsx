'use client'

import { useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'

const STEPS = [
  {
    page: '/executive-overview',
    tourId: 'gtm-scorecard',
    pageLabel: 'Executive Overview',
    title: 'GTM Scorecard',
    body: "See immediately whether the quarter is on track. Pace-adjusted attainment accounts for how much of the quarter has elapsed — so 40% closed with 45% of days gone means you're slightly ahead, not behind. The status badge reflects that math in real time.",
  },
  {
    page: '/executive-overview',
    tourId: 'kpi-tiles',
    pageLabel: 'Executive Overview',
    title: 'Executive Health Metrics',
    body: 'Eleven GTM health metrics in one row: ARR growth, NRR, pipeline coverage, win rate, average deal size, sales cycle, CAC payback, LTV/CAC, gross margin, Magic Number, and Rule of 40. A complete executive snapshot without a single spreadsheet.',
  },
  {
    page: '/executive-overview',
    tourId: 'arr-trend',
    pageLabel: 'Executive Overview',
    title: 'ARR Trend by Segment',
    body: 'Trailing 12-month ARR broken down by SMB, Mid-Market, and Enterprise. Spot which segments are accelerating, plateauing, or declining before the board meeting — and answer the first question every investor asks.',
  },
  {
    page: '/pipeline',
    tourId: 'pipeline-kpis',
    pageLabel: 'Pipeline',
    title: 'Pipeline Health',
    body: 'Open deals, total pipeline ARR, probability-weighted ARR, coverage ratio, win rate, and average sales cycle. These are the leading indicators of the quarter — changes here show up in revenue 30–60 days later.',
  },
  {
    page: '/pipeline',
    tourId: 'stage-velocity',
    pageLabel: 'Pipeline',
    title: 'Stage Velocity & Conversion',
    body: 'Time-in-stage and conversion rate for every funnel step, filterable by rep, company size, or industry. When a stage shows rising days and falling conversion, that\'s exactly where coaching should focus.',
  },
  {
    page: '/pipeline',
    tourId: 'stalled-deals',
    pageLabel: 'Pipeline',
    title: 'Stalled Deals',
    body: "Deals that haven't advanced in longer than the benchmark for their stage. The overage badge shows how far past typical each deal is. These are revenue-at-risk that show up nowhere in a standard CRM view.",
  },
  {
    page: '/pipeline',
    tourId: 'discovery-booking',
    pageLabel: 'Pipeline',
    title: 'Discovery Calendar',
    body: 'A forward 4-week view of booked discovery meetings, stacked by SDR. Low volume in weeks 3–4 is an early warning sign of pipeline gaps 60–90 days out — visible now, while there\'s still time to act.',
  },
  {
    page: '/attribution',
    tourId: 'attribution-models',
    pageLabel: 'Attribution',
    title: 'Attribution Models',
    body: 'Five models — First Touch, Last Touch, Linear, Time Decay, and W-Shaped — each telling a different story about which channels drive revenue. First Touch reveals what starts conversations; W-Shaped balances the full journey. Compare them before your next budget cycle.',
  },
  {
    page: '/attribution',
    tourId: 'funnel-conversion',
    pageLabel: 'Attribution',
    title: 'Funnel Conversion Rates',
    body: 'Lead → MQL → SQL → each pipeline stage → closed-won. Break it down by source, company size, or industry to find where your best-fit leads convert best — and where volume is leaking out of the funnel.',
  },
  {
    page: '/attribution',
    tourId: 'win-rate-cross-section',
    pageLabel: 'Attribution',
    title: 'Win Rate by Segment Combination',
    body: 'The highest and lowest-performing combinations of company size × industry. Knowing that Enterprise Healthcare closes at 20% while SMB SaaS closes at 70%+ informs both targeting strategy and how you weight opportunities in your forecast.',
  },
  {
    page: '/unit-economics',
    tourId: 'unit-economics-kpis',
    pageLabel: 'Unit Economics',
    title: 'Unit Economics',
    body: 'CAC, payback period, LTV, LTV/CAC, gross margin, ARR growth, and Magic Number. These seven metrics answer a single question investors always ask: is growth efficient? A Magic Number above 0.75 means every marketing dollar generates meaningful ARR.',
  },
  {
    page: '/unit-economics',
    tourId: 'channel-roi',
    pageLabel: 'Unit Economics',
    title: 'Channel ROI Health',
    body: 'Each channel ranked by influence weight — win-rate × √deal volume — paired with its cost-per-acquisition. Green = high influence, low CAC. Red = expensive and underperforming. This is where the budget reallocation conversation starts.',
  },
  {
    page: '/retention',
    tourId: 'retention-kpis',
    pageLabel: 'Retention',
    title: 'Retention Metrics',
    body: 'NRR above 100% means existing customers alone can compound ARR growth — the fundamental SaaS flywheel. GRR below 90% signals churn is outrunning expansion. These two numbers define whether you have a leaky bucket or a self-reinforcing growth engine.',
  },
  {
    page: '/retention',
    tourId: 'arr-waterfall',
    pageLabel: 'Retention',
    title: 'ARR Movement Detail',
    body: "New business, expansion, contraction, and churn broken down by period and filterable by company size and industry. This answers not just what your NRR is, but exactly where it's coming from — and which customer segments are driving or dragging it.",
  },
]

const TOTAL = STEPS.length

const PAGE_COLORS: Record<string, string> = {
  'Executive Overview': 'bg-indigo-500/20 text-indigo-300',
  'Pipeline':           'bg-sky-500/20 text-sky-300',
  'Attribution':        'bg-violet-500/20 text-violet-300',
  'Unit Economics':     'bg-emerald-500/20 text-emerald-300',
  'Retention':          'bg-amber-500/20 text-amber-300',
}

function TourOverlayInner() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const pathname     = usePathname()
  const highlightRef = useRef<HTMLElement | null>(null)

  const isTour  = searchParams.get('tour') === '1'
  const stepRaw = parseInt(searchParams.get('step') ?? '0', 10)
  const step    = Math.max(0, Math.min(isNaN(stepRaw) ? 0 : stepRaw, TOTAL - 1))
  const isLast  = step === TOTAL - 1
  const current = STEPS[step]

  useEffect(() => {
    if (!isTour || pathname !== current.page) return

    // Clear any previous highlight
    document.querySelectorAll('.tour-highlight').forEach((el) => el.classList.remove('tour-highlight'))
    highlightRef.current = null

    const timeout = setTimeout(() => {
      const el = document.querySelector(`[data-tour="${current.tourId}"]`) as HTMLElement | null
      if (el) {
        el.classList.add('tour-highlight')
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        highlightRef.current = el
      }
    }, 350)

    return () => {
      clearTimeout(timeout)
      document.querySelectorAll('.tour-highlight').forEach((el) => el.classList.remove('tour-highlight'))
    }
  }, [isTour, step, pathname, current.page, current.tourId])

  if (!isTour) return null

  function goTo(nextStep: number) {
    const clamped  = Math.max(0, Math.min(nextStep, TOTAL - 1))
    const nextPage = STEPS[clamped].page
    router.push(`${nextPage}?tour=1&step=${clamped}`)
  }

  function exitTour() {
    document.querySelectorAll('.tour-highlight').forEach((el) => el.classList.remove('tour-highlight'))
    router.push(pathname)
  }

  const progress   = ((step + 1) / TOTAL) * 100
  const pageColor  = PAGE_COLORS[current.pageLabel] ?? 'bg-slate-500/20 text-slate-300'

  return (
    <>
      {/* Subtle dim — pointer-events:none so users can still interact with the page */}
      <div className="fixed inset-0 bg-black/20 pointer-events-none z-40" aria-hidden="true" />

      {/* Tour panel */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4">
        <div className="bg-slate-900 rounded-2xl shadow-2xl border border-white/10 overflow-hidden">

          {/* Progress bar */}
          <div className="h-0.5 bg-white/10">
            <div
              className="h-full bg-indigo-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="p-5">
            {/* Header row */}
            <div className="flex items-center justify-between gap-4 mb-3">
              <div className="flex items-center gap-2.5">
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${pageColor}`}>
                  {current.pageLabel}
                </span>
                <span className="text-xs text-slate-500">{step + 1} of {TOTAL}</span>
              </div>
              <button
                onClick={exitTour}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                Exit tour ✕
              </button>
            </div>

            {/* Content */}
            <h3 className="text-base font-bold text-white mb-1.5">{current.title}</h3>
            <p className="text-sm text-slate-400 leading-relaxed mb-4">{current.body}</p>

            {/* Footer: dots + nav */}
            <div className="flex items-center justify-between gap-3">
              {/* Step dots */}
              <div className="flex items-center gap-1">
                {STEPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => goTo(i)}
                    aria-label={`Go to step ${i + 1}`}
                    className={`rounded-full transition-all duration-200 ${
                      i === step
                        ? 'w-5 h-1.5 bg-indigo-400'
                        : 'w-1.5 h-1.5 bg-white/20 hover:bg-white/40'
                    }`}
                  />
                ))}
              </div>

              {/* Nav buttons */}
              <div className="flex items-center gap-2 shrink-0">
                {step > 0 && (
                  <button
                    onClick={() => goTo(step - 1)}
                    className="px-4 py-1.5 text-sm text-slate-300 hover:text-white border border-white/10 rounded-lg hover:border-white/20 transition-colors"
                  >
                    ← Back
                  </button>
                )}
                {isLast ? (
                  <Link
                    href="/login"
                    onClick={() => document.querySelectorAll('.tour-highlight').forEach((el) => el.classList.remove('tour-highlight'))}
                    className="px-5 py-1.5 text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
                  >
                    Go to Platform →
                  </Link>
                ) : (
                  <button
                    onClick={() => goTo(step + 1)}
                    className="px-5 py-1.5 text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
                  >
                    Next →
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default function TourOverlay() {
  return (
    <Suspense fallback={null}>
      <TourOverlayInner />
    </Suspense>
  )
}
