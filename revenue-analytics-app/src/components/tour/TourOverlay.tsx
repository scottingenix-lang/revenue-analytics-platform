'use client'

import { useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'

const STEPS = [
  {
    page: '/executive-overview',
    tourId: 'gtm-scorecard',
    pageLabel: 'Executive Overview',
    title: 'The Quarter is Behind Pace',
    body: "The GTM Scorecard shows pace-adjusted attainment — not just what's closed, but whether it's enough given how much of the quarter has elapsed. When the badge turns amber or red, you have a problem that needs attention today, not at the QBR.",
    boldLine: "The quarter is pacing behind so let's go to the Pipeline & Sales Velocity page to see what we can do.",
  },
  {
    page: '/pipeline',
    tourId: 'forecast',
    scrollToTop: true,
    pageLabel: 'Pipeline',
    title: 'The Q2 Forecast Bar',
    body: "The monthly breakdown of open pipeline shows where deals are clustered. Back-weighted pipeline means most of it naturally closes in June — too late to help a behind-quarter sprint. The months in the open pipeline bar show you exactly how much ARR is realistically pullable into earlier months.",
    boldLine: "Expand the Fast-Pacing Non-Committed Deals panel to see which deals we need to focus on to hit the goal.",
  },
  {
    page: '/pipeline',
    tourId: 'fast-candidates',
    scrollToTop: true,
    pageLabel: 'Pipeline',
    title: 'Deals Ready to Accelerate',
    body: "Fast-pacing deals are reaching their current stage faster than 75% of comparable deals in the same segment and stage. That velocity signal means the buyer is engaged and ready. These are your best candidates for executive sponsorship, a commercial push, or an early close incentive.",
    boldLine: "Pick the top 3-5 deals to pull via ARR, Close Date, and Pacing.",
  },
  {
    page: '/pipeline',
    tourId: 'stalled-deals',
    scrollToTop: true,
    pageLabel: 'Pipeline',
    title: 'Pipeline Clean Up',
    body: "Every stalled deal inflates your pipeline number, so we highlight deals that are 300+ slower than the Closed Won pace.",
    boldLine: "Assign a next action to every red deal and delete any deals you know are lost.",
  },
  {
    page: '/attribution',
    tourId: 'attribution-models',
    pageLabel: 'Attribution',
    title: 'What\'s Actually Driving Pipeline',
    body: "Three attribution models show which marketing channels Convert the most Deals, Drive the most MQLs, and which campaigns have recently gained the most engagement. We see here that Trade Shows and the Website have been generating the most deals.",
    boldLine: "Ensure ABM campaigns have steps that include the top converting channels.",
  },
  {
    page: '/attribution',
    tourId: 'win-rate-cross-section',
    scrollToTop: true,
    pageLabel: 'Attribution',
    title: 'Which ICP Audiences to Focus On',
    body: "Looking at the target Industries and Company Size × Win Rate will tell you two things: 1. Where to focus ABM campaigns 2. More direction when evaluating which deals to pull into this quarter.",
    boldLine: "Relay this information to the sales and marketing teams for planning future quarters and for making in-quarter adjustments.",
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

    let cancelled = false
    const tryHighlight = (attemptsLeft: number) => {
      if (cancelled) return
      const el = document.querySelector(`[data-tour="${current.tourId}"]`) as HTMLElement | null
      if (!el) {
        if (attemptsLeft > 0) setTimeout(() => tryHighlight(attemptsLeft - 1), 200)
        return
      }
      el.classList.add('tour-highlight')
      highlightRef.current = el
      if (current.scrollToTop) {
        const container = document.querySelector('main')
        if (container) {
          const top = el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 16
          container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
        }
      } else {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
    const timeout = setTimeout(() => tryHighlight(10), 350)

    return () => {
      cancelled = true
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
      {/* Tour panel */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-4xl px-4">
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
                <span className="text-xs text-white/60">{step + 1} of {TOTAL}</span>
              </div>
              <button
                onClick={exitTour}
                className="text-xs text-white/70 hover:text-white transition-colors"
              >
                Exit tour ✕
              </button>
            </div>

            {/* Content */}
            <h3 className="text-base font-bold text-white mb-1.5">{current.title}</h3>
            <p className="text-sm text-white/80 leading-relaxed mb-2">{current.body}</p>
            {current.boldLine && (
              <p className="text-sm font-bold italic text-white leading-relaxed mb-4">{current.boldLine}</p>
            )}

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
                    href="/executive-overview"
                    onClick={() => document.querySelectorAll('.tour-highlight').forEach((el) => el.classList.remove('tour-highlight'))}
                    className="px-5 py-1.5 text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
                  >
                    Explore the platform →
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
