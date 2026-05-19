'use client'

import { useState, useMemo, useRef } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

type CalcBasis = 'dollars' | 'deals'
type ValueToCalc = 'quota' | 'reps' | 'winrate'
type OutputFrame = 'quarterly' | 'annually'

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtDollar(v: number): string {
  if (!isFinite(v) || isNaN(v)) return '—'
  return '$' + Math.round(v).toLocaleString('en-US')
}

function fmtPct(v: number): string {
  if (!isFinite(v) || isNaN(v)) return '—'
  return v.toFixed(1) + '%'
}

function fmtReps(v: number): string {
  if (!isFinite(v) || isNaN(v)) return '—'
  return v.toFixed(1)
}

function fmtDeals(v: number): string {
  if (!isFinite(v) || isNaN(v)) return '—'
  return Math.round(v).toLocaleString('en-US')
}

// ── Quarter label helper ──────────────────────────────────────────────────────
// absIdx is 0-based from Q1 2026. Negative values go into 2025, etc.

function absIdxToLabel(absIdx: number): string {
  const year = 2026 + Math.floor(absIdx / 4)
  const qNum = ((absIdx % 4) + 4) % 4 + 1
  return `Q${qNum}${String(year).slice(2)}`
}

// ── Parse raw string to number ────────────────────────────────────────────────

function num(s: string): number {
  const v = parseFloat(s.replace(/,/g, ''))
  return isNaN(v) ? 0 : v
}

function safeDivide(a: number, b: number): number {
  if (b === 0 || !isFinite(b)) return Infinity
  return a / b
}

// ── Sub-components ────────────────────────────────────────────────────────────

type TileColor = 'indigo' | 'sky' | 'violet' | 'purple' | 'emerald' | 'teal' | 'amber' | 'cyan'

const TILE_COLORS: Record<TileColor, { bg: string; border: string; label: string; sub: string }> = {
  indigo:  { bg: 'bg-indigo-700/70',  border: 'border-l-[3px] border-indigo-300',  label: 'text-white',  sub: 'text-white' },
  sky:     { bg: 'bg-sky-900/60',     border: 'border-l-[3px] border-sky-400',     label: 'text-sky-300',     sub: 'text-sky-400' },
  violet:  { bg: 'bg-violet-900/60',  border: 'border-l-[3px] border-violet-400',  label: 'text-violet-300',  sub: 'text-violet-400' },
  purple:  { bg: 'bg-purple-900/60',  border: 'border-l-[3px] border-purple-400',  label: 'text-purple-300',  sub: 'text-purple-400' },
  emerald: { bg: 'bg-emerald-900/60', border: 'border-l-[3px] border-emerald-400', label: 'text-emerald-300', sub: 'text-emerald-400' },
  teal:    { bg: 'bg-teal-900/60',    border: 'border-l-[3px] border-teal-400',    label: 'text-teal-300',    sub: 'text-teal-400' },
  amber:   { bg: 'bg-amber-900/60',   border: 'border-l-[3px] border-amber-400',   label: 'text-amber-300',   sub: 'text-amber-400' },
  cyan:    { bg: 'bg-cyan-900/60',    border: 'border-l-[3px] border-cyan-400',    label: 'text-cyan-300',    sub: 'text-cyan-400' },
}

function MetricTile({
  label, value, sub, color = 'indigo',
}: {
  label: string; value: string; sub?: string; color?: TileColor
}) {
  const c = TILE_COLORS[color]
  return (
    <div className={`${c.bg} ${c.border} rounded-xl p-4 min-w-0`}>
      <div className={`text-xs font-semibold uppercase tracking-wide mb-1 truncate ${c.label}`}>
        {label}
      </div>
      <div className="text-xl font-bold text-white truncate">{value}</div>
      {sub && <div className={`text-xs mt-0.5 ${c.sub}`}>{sub}</div>}
    </div>
  )
}

const DROPDOWN_CLS =
  'w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 cursor-pointer'

const INPUT_BASE =
  'w-full px-3 py-2 rounded-lg border text-sm focus:outline-none transition-colors'

const INPUT_NORMAL =
  INPUT_BASE +
  ' border-slate-200 bg-white text-slate-900 focus:ring-2 focus:ring-indigo-400'

const INPUT_COMPUTED =
  INPUT_BASE +
  ' border-2 border-teal-400 bg-teal-50 text-teal-900 font-semibold cursor-not-allowed'

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CalculatorPage() {
  // ── Dropdown state ──────────────────────────────────────────────────────────
  const [calcBasis, setCalcBasis] = useState<CalcBasis>('dollars')
  const [valueToCalc, setValueToCalc] = useState<ValueToCalc>('quota')
  const [outputFrame, setOutputFrame] = useState<OutputFrame>('annually')
  const [startQ, setStartQ] = useState<number>(1) // Q1 default
  const [salesCycle, setSalesCycle] = useState<number>(1) // ≤1 Quarter default

  // ── Input field state (raw strings) ────────────────────────────────────────
  const [goalCurrent, setGoalCurrent] = useState('')
  const [goalNext, setGoalNext] = useState('')
  const [numReps, setNumReps] = useState('')
  const [winRatePct, setWinRatePct] = useState('')
  const [attainmentPct, setAttainmentPct] = useState('')
  const [pipeline, setPipeline] = useState('')
  const [dealSize, setDealSize] = useState('')
  const [quotaPerRep, setQuotaPerRep] = useState('')

  // Tracks which dollar field is currently focused (shows raw value while editing)
  const [focusedField, setFocusedField] = useState<string | null>(null)

  // ── Parsed numeric values ───────────────────────────────────────────────────
  const g = num(goalCurrent)
  const gNext = num(goalNext)
  const reps = num(numReps)
  const wr = num(winRatePct) / 100
  const att = num(attainmentPct) / 100
  const pipe = num(pipeline)
  const ds = num(dealSize)
  const quota = num(quotaPerRep)

  // ── Pipeline is always computed from Goal / Win Rate ──────────────────────
  // Exception: when "Win Rate" is the Value to Calculate, pipeline becomes the
  // user-supplied input ("Current Open Pipeline Total") and win rate is derived.
  const isPipelineComputed = valueToCalc !== 'winrate'

  // The win rate to use for all table / pipeline calculations
  const effectiveWR = isPipelineComputed ? wr : safeDivide(g, pipe)

  // The computed pipeline value (Goal / Win Rate) — always the planning target
  const computedPipelineValue = safeDivide(g, wr)

  // ── Computed output value (for the highlighted/disabled field) ─────────────
  const computedValue = useMemo((): number => {
    switch (valueToCalc) {
      case 'quota':
        // Quarterly = (goal/4) / (reps × att); Annual = goal / (reps × att)
        return outputFrame === 'annually'
          ? safeDivide(g, reps * att)
          : safeDivide(g / 4, reps * att)
      case 'reps':
        // = goal / (quota × att) — same regardless of outputFrame
        return safeDivide(g, quota * att)
      case 'winrate':
        // = (goal / pipeline) × 100 — pipeline is the user-supplied input here
        return safeDivide(g, pipe) * 100
    }
  }, [valueToCalc, outputFrame, g, wr, att, reps, pipe, quota])

  // ── Output frame scale ─────────────────────────────────────────────────────
  const frameScale = outputFrame === 'quarterly' ? 0.25 : 1

  // ── Deal-count conversion ──────────────────────────────────────────────────
  // All internal math runs in dollars. In deal-count mode, dollar values are
  // divided by Avg Deal Size for display. Win Rate, Reps, Attainment are unitless.
  function fmtDollarOrDeals(dollarAmt: number): string {
    if (calcBasis === 'dollars') return fmtDollar(dollarAmt)
    return ds > 0 ? fmtDeals(dollarAmt / ds) : '—'
  }

  // ── Format computed value for display in the disabled input field ──────────
  function fmtComputed(): string {
    if (!isFinite(computedValue)) return '—'
    switch (valueToCalc) {
      case 'quota':
        return fmtDollarOrDeals(computedValue)
      case 'reps':
        return fmtReps(computedValue)
      case 'winrate':
        return fmtPct(computedValue)
    }
  }

  // ── Effective (annual) values for metric tiles ─────────────────────────────
  const effectivePipeline = isPipelineComputed ? safeDivide(g, wr) : pipe
  const effectiveReps =
    valueToCalc === 'reps' ? safeDivide(g, quota * att) : reps
  const effectiveAnnualQuota =
    valueToCalc === 'quota' ? safeDivide(g, reps * att) : quota
  const effectiveWinRatePct =
    valueToCalc === 'winrate' ? safeDivide(g, pipe) * 100 : num(winRatePct)

  // ── 4-Quarter table columns ────────────────────────────────────────────────
  const tableColumns = useMemo(() => {
    // Use effectiveWR so the table reflects the derived win rate when computing it
    const tableWR = isPipelineComputed ? wr : safeDivide(g, pipe)

    return Array.from({ length: 4 }, (_, i) => {
      const bookAbsIdx = startQ - 1 + i
      const pipeAbsIdx = bookAbsIdx - salesCycle
      const isNextYear = bookAbsIdx >= 4
      const bookingGoal = isNextYear ? gNext : g

      const quarterlyBookings = bookingGoal / 4
      const quarterlyPipeline = safeDivide(quarterlyBookings, tableWR)

      const tableReps = valueToCalc === 'reps'
        ? safeDivide(bookingGoal, quota * att)
        : reps

      const tableQuotaPerRep = safeDivide(quarterlyBookings, tableReps * att)

      return {
        colLabel: absIdxToLabel(bookAbsIdx),
        pipeLabel: absIdxToLabel(pipeAbsIdx),
        quarterlyBookings,
        quarterlyPipeline,
        winRatePct: tableWR * 100,
        tableReps,
        tableQuotaPerRep,
        attainmentPct: att * 100,
      }
    })
  }, [startQ, salesCycle, g, gNext, wr, pipe, att, reps, quota, valueToCalc, isPipelineComputed])

  // ── PDF download ───────────────────────────────────────────────────────────
  const printRef = useRef<HTMLDivElement>(null)

  async function handleDownload() {
    if (!printRef.current) return
    const [{ toPng }, { default: jsPDF }] = await Promise.all([
      import('html-to-image'),
      import('jspdf'),
    ])
    const el = printRef.current
    const dataUrl = await toPng(el, { pixelRatio: 2 })
    const w = el.scrollWidth
    const h = el.scrollHeight
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [w, h] })
    pdf.addImage(dataUrl, 'PNG', 0, 0, w, h)
    pdf.save('revenue-planning-calculator.pdf')
  }

  // ── Reset ──────────────────────────────────────────────────────────────────
  function handleReset() {
    setCalcBasis('dollars')
    setValueToCalc('quota')
    setOutputFrame('annually')
    setStartQ(1)
    setSalesCycle(1)
    setGoalCurrent('')
    setGoalNext('')
    setNumReps('')
    setWinRatePct('')
    setAttainmentPct('')
    setPipeline('')
    setDealSize('')
    setQuotaPerRep('')
    setFocusedField(null)
  }

  // ── Input helpers ──────────────────────────────────────────────────────────
  function isComputed(field: ValueToCalc) {
    return valueToCalc === field
  }

  function handleNumInput(
    val: string,
    setter: (v: string) => void,
    opts?: { isPercent?: boolean }
  ) {
    const cleaned = val.replace(/[^0-9.]/g, '')
    if (cleaned === '' || cleaned === '.') {
      setter(cleaned)
      return
    }
    let n = parseFloat(cleaned)
    if (isNaN(n)) return
    if (n < 0) n = 0
    if (opts?.isPercent && n > 100) n = 100
    setter(cleaned) // store raw so user can keep typing decimals
  }

  // Format a raw numeric string for display in a blurred dollar/deal field
  function fmtFieldVal(raw: string, dollarSign: boolean): string {
    const n = parseFloat(raw.replace(/,/g, ''))
    if (isNaN(n) || raw === '' || raw === '.') return raw
    const withCommas = Math.round(n).toLocaleString('en-US')
    return dollarSign ? '$' + withCommas : withCommas
  }

  // Format a raw percent string for display when blurred
  function fmtPctField(raw: string): string {
    const n = parseFloat(raw)
    if (isNaN(n) || raw === '' || raw === '.') return raw
    return n % 1 === 0 ? n.toFixed(0) + '%' : n.toFixed(1) + '%'
  }

  const salesCycleOptions = ['≤1 Quarter', '≤2 Quarters', '≤3 Quarters', '≤4 Quarters']
  const basisUnit = calcBasis === 'dollars' ? '$' : 'deals'
  const hasError = !isFinite(computedValue)

  const computedLabel: Record<ValueToCalc, string> = {
    quota: 'Quota per Rep',
    reps: 'Number of Reps',
    winrate: 'Avg Win Rate',
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-8 w-1 rounded-full bg-indigo-600" />
            <span className="text-xs font-bold uppercase tracking-widest text-indigo-600">
              Revenue Intelligence
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-tight">
            Revenue Planning Calculator
          </h1>
          <p className="mt-2 text-slate-500 text-base max-w-2xl">
            Align pipeline, quota, reps, and win rate to your bookings goal —
            with sales cycle properly accounted for. Change any input and watch
            the table shift in real time.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* ── Calculator card ───────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

          {/* ── Calculator Settings header band ──────────────────────────────── */}
          <div className="bg-indigo-700 px-6 py-4">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-bold text-white">Calculator Settings</h2>
              <div className="flex-1 h-px bg-indigo-500" />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

            <div>
              <label className="block text-xs font-semibold text-indigo-200 uppercase tracking-wide mb-1.5">
                Calculation Basis
              </label>
              <select
                value={calcBasis}
                onChange={e => setCalcBasis(e.target.value as CalcBasis)}
                className={DROPDOWN_CLS}
              >
                <option value="dollars">Dollar Amount</option>
                <option value="deals">Deal Count</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-indigo-200 uppercase tracking-wide mb-1.5">
                Value to Calculate
              </label>
              <select
                value={valueToCalc}
                onChange={e => setValueToCalc(e.target.value as ValueToCalc)}
                className={DROPDOWN_CLS}
              >
                <option value="quota">Quota per Rep</option>
                <option value="reps">Number of Reps</option>
                <option value="winrate">Win Rate</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-indigo-200 uppercase tracking-wide mb-1.5">
                Timeframe Output
              </label>
              <select
                value={outputFrame}
                onChange={e => setOutputFrame(e.target.value as OutputFrame)}
                className={DROPDOWN_CLS}
              >
                <option value="annually">Annually</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-indigo-200 uppercase tracking-wide mb-1.5">
                Starting Quarter
              </label>
              <select
                value={startQ}
                onChange={e => setStartQ(Number(e.target.value))}
                className={DROPDOWN_CLS}
              >
                <option value={1}>Q1</option>
                <option value={2}>Q2</option>
                <option value={3}>Q3</option>
                <option value={4}>Q4</option>
              </select>
            </div>
            </div>{/* end dropdowns grid */}
          </div>{/* end Calculator Settings band */}

          <div className="p-6">

          {/* Computed output callout */}
          {!hasError && (
            <div className="mb-6 px-4 py-3 bg-teal-50 border border-teal-200 rounded-xl flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-teal-400 shrink-0" />
              <span className="text-sm font-semibold text-teal-800">
                {computedLabel[valueToCalc]}{' '}
                ({outputFrame === 'annually' ? 'Annual' : 'Quarterly'}):
              </span>
              <span className="text-sm font-bold text-teal-700">{fmtComputed()}</span>
              <span className="ml-auto text-xs text-teal-600 italic">
                computed from your inputs below
              </span>
            </div>
          )}

          {hasError && (
            <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              Cannot compute — check that win rate, attainment, rep count, and pipeline are all greater than zero.
            </div>
          )}

          {/* Input fields — 3-column grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">

            {/* Annual Bookings Goal — Current Year */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Annual Bookings Goal — 2026
                <span className="ml-1 text-xs text-slate-400">({basisUnit})</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={focusedField === 'goalCurrent' ? goalCurrent : fmtFieldVal(goalCurrent, calcBasis === 'dollars')}
                onFocus={() => setFocusedField('goalCurrent')}
                onBlur={() => setFocusedField(null)}
                onChange={e => handleNumInput(e.target.value, setGoalCurrent)}
                className={INPUT_NORMAL}
                placeholder={calcBasis === 'dollars' ? '$10,000,000' : '10000000'}
              />
            </div>

            {/* Annual Bookings Goal — Next Year */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Annual Bookings Goal — 2027
                <span className="ml-1 text-xs text-slate-400">({basisUnit})</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={focusedField === 'goalNext' ? goalNext : fmtFieldVal(goalNext, calcBasis === 'dollars')}
                onFocus={() => setFocusedField('goalNext')}
                onBlur={() => setFocusedField(null)}
                onChange={e => handleNumInput(e.target.value, setGoalNext)}
                className={INPUT_NORMAL}
                placeholder={calcBasis === 'dollars' ? '$13,000,000' : '13000000'}
              />
            </div>

            {/* Number of Sales Reps */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                Number of Sales Reps
                {isComputed('reps') && (
                  <span className="text-xs font-bold text-teal-600 uppercase tracking-wide">
                    ← Computed
                  </span>
                )}
              </label>
              <input
                type="text"
                inputMode="numeric"
                disabled={isComputed('reps')}
                value={isComputed('reps') ? fmtReps(computedValue) : numReps}
                onChange={e => handleNumInput(e.target.value, setNumReps)}
                className={isComputed('reps') ? INPUT_COMPUTED : INPUT_NORMAL}
                placeholder="10"
              />
            </div>

            {/* Avg Deal Win Rate */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                Avg Deal Win Rate
                <span className="text-xs text-slate-400">(%)</span>
                {isComputed('winrate') && (
                  <span className="text-xs font-bold text-teal-600 uppercase tracking-wide">
                    ← Computed
                  </span>
                )}
              </label>
              <input
                type="text"
                inputMode="numeric"
                disabled={isComputed('winrate')}
                value={isComputed('winrate') ? fmtPct(computedValue) : focusedField === 'winRatePct' ? winRatePct : fmtPctField(winRatePct)}
                onFocus={() => setFocusedField('winRatePct')}
                onBlur={() => setFocusedField(null)}
                onChange={e => handleNumInput(e.target.value, setWinRatePct, { isPercent: true })}
                className={isComputed('winrate') ? INPUT_COMPUTED : INPUT_NORMAL}
                placeholder="25%"
              />
            </div>

            {/* Avg Sales Cycle Length — dropdown within the input grid */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Avg Sales Cycle Length
              </label>
              <select
                value={salesCycle}
                onChange={e => setSalesCycle(Number(e.target.value))}
                className={DROPDOWN_CLS}
              >
                {salesCycleOptions.map((label, i) => (
                  <option key={i} value={i + 1}>{label}</option>
                ))}
              </select>
            </div>

            {/* Avg Quota Attainment */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Avg Quota Attainment
                <span className="ml-1 text-xs text-slate-400">(%)</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={focusedField === 'attainmentPct' ? attainmentPct : fmtPctField(attainmentPct)}
                onFocus={() => setFocusedField('attainmentPct')}
                onBlur={() => setFocusedField(null)}
                onChange={e => handleNumInput(e.target.value, setAttainmentPct, { isPercent: true })}
                className={INPUT_NORMAL}
                placeholder="75%"
              />
            </div>

            {/* Pipeline — always computed except when solving for Win Rate */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                {isPipelineComputed ? 'Pipeline Required' : 'Current Open Pipeline Total'}
                <span className="text-xs text-slate-400">
                  {calcBasis === 'dollars' ? '($)' : '(Number of Deals)'}
                </span>
                {isPipelineComputed && (
                  <span className="text-xs font-bold text-teal-600 uppercase tracking-wide">
                    ← Computed
                  </span>
                )}
              </label>
              <input
                type="text"
                inputMode="numeric"
                disabled={isPipelineComputed}
                value={
                  isPipelineComputed
                    ? fmtDollarOrDeals(computedPipelineValue)
                    : (focusedField === 'pipeline' ? pipeline : fmtDollarOrDeals(num(pipeline) * frameScale))
                }
                onFocus={isPipelineComputed ? undefined : () => setFocusedField('pipeline')}
                onBlur={isPipelineComputed ? undefined : () => setFocusedField(null)}
                onChange={isPipelineComputed ? undefined : e => handleNumInput(e.target.value, setPipeline)}
                className={isPipelineComputed ? INPUT_COMPUTED : INPUT_NORMAL}
                placeholder={calcBasis === 'dollars' ? '$40,000,000' : '40000000'}
              />
              {calcBasis === 'deals' && (
                <p className="mt-1 text-xs text-slate-400">Open Deals</p>
              )}
            </div>

            {/* Pipeline per Rep — always computed */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                {calcBasis === 'dollars' ? 'Pipeline per Rep' : 'Open Deals per Rep'}
                <span className="text-xs text-slate-400">
                  {calcBasis === 'dollars' ? '($)' : '(Number of Deals)'}
                </span>
                <span className="text-xs font-bold text-teal-600 uppercase tracking-wide">← Computed</span>
              </label>
              <input
                type="text"
                disabled
                value={fmtDollarOrDeals(effectivePipeline / effectiveReps * frameScale)}
                className={INPUT_COMPUTED}
              />
            </div>

            {/* Quota per Rep */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                Quota per Rep
                <span className="text-xs text-slate-400">
                  {calcBasis === 'dollars' ? '($/yr)' : '(Number of Deals)'}
                </span>
                {isComputed('quota') && (
                  <span className="text-xs font-bold text-teal-600 uppercase tracking-wide">
                    ← Computed
                  </span>
                )}
              </label>
              <input
                type="text"
                inputMode="numeric"
                disabled={isComputed('quota')}
                value={isComputed('quota') ? fmtComputed() : focusedField === 'quotaPerRep' ? quotaPerRep : fmtDollarOrDeals(num(quotaPerRep) * frameScale)}
                onFocus={() => setFocusedField('quotaPerRep')}
                onBlur={() => setFocusedField(null)}
                onChange={e => handleNumInput(e.target.value, setQuotaPerRep)}
                className={isComputed('quota') ? INPUT_COMPUTED : INPUT_NORMAL}
                placeholder={calcBasis === 'dollars' ? '$1,333,333' : '1333333'}
              />
              {calcBasis === 'deals' && (
                <p className="mt-1 text-xs text-slate-400">{outputFrame === 'quarterly' ? 'wins/qtr' : 'wins/yr'}</p>
              )}
            </div>

            {/* Avg Deal Size */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Avg Deal Size
                <span className="ml-1 text-xs text-slate-400">($)</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={focusedField === 'dealSize' ? dealSize : fmtFieldVal(dealSize, true)}
                onFocus={() => setFocusedField('dealSize')}
                onBlur={() => setFocusedField(null)}
                onChange={e => handleNumInput(e.target.value, setDealSize)}
                className={INPUT_NORMAL}
                placeholder="$50,000"
              />
            </div>

          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-3 mt-5">
            <button
              onClick={handleReset}
              className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white text-sm font-semibold transition-colors"
            >
              Reset All
            </button>
            <button
              onClick={handleDownload}
              className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white text-sm font-semibold transition-colors"
            >
              Download as PDF
            </button>
          </div>
          </div>{/* end p-6 inputs section */}
        </div>

        {/* ── Output panel (dark, gradient top→bottom) ─────────────────────── */}
        <div ref={printRef} className="bg-gradient-to-b from-indigo-950 via-slate-900 to-slate-950 rounded-2xl p-6 text-white shadow-xl">

          {/* Section heading */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white">Revenue Planning Results</h2>
            <div className="mt-2 h-px bg-indigo-300" />
          </div>

          {/* Metric tiles — 2 cols mobile, 4 cols sm+ */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <MetricTile
              label="Annual Bookings Goal"
              value={fmtDollarOrDeals(g)}
              sub="2026 current year"
            />
            <MetricTile
              label="Pipeline"
              value={fmtDollarOrDeals(effectivePipeline)}
              sub="annual"
            />
            <MetricTile
              label="Number of Reps"
              value={fmtReps(effectiveReps)}
              sub="fully-ramped equiv."
            />
            <MetricTile
              label="Quota per Rep"
              value={fmtDollarOrDeals(effectiveAnnualQuota)}
              sub="annual stretch"
            />
            <MetricTile
              label="Avg Win Rate"
              value={fmtPct(effectiveWinRatePct)}
            />
            <MetricTile
              label="Avg Quota Attainment"
              value={fmtPct(att * 100)}
            />
            <MetricTile
              label="Avg Deal Size"
              value={fmtDollar(ds)}
            />
            <MetricTile
              label="Avg Sales Cycle"
              value={salesCycleOptions[salesCycle - 1]}
            />
          </div>

          {/* Section heading */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-white">Pipeline to Bookings Goal Adjustment</h2>
            <div className="mt-2 h-px bg-indigo-300" />
          </div>

          {/* 4-Quarter Table */}
          <div className="overflow-x-auto -mx-2 px-2">
            <table className="w-full min-w-[640px] text-sm border-separate border-spacing-y-0.5">
              <thead>
                <tr>
                  <th className="text-left py-3 pr-6 pl-3 text-white font-bold text-sm w-56 bg-slate-700 rounded-l-lg">
                    Metric
                  </th>
                  {tableColumns.map(col => (
                    <th
                      key={col.colLabel}
                      className="text-center py-3 px-3 text-white font-bold text-sm bg-slate-700 last:rounded-r-lg"
                    >
                      {col.colLabel}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>

                {/* ── Pipeline cluster ─────────────────────────────────────── */}
                {/* Pipeline Generated in — subheader */}
                <tr>
                  <td className="py-2.5 pr-6 pl-3 rounded-l-lg bg-sky-500 font-semibold">
                    <span className="text-sm italic text-white font-semibold">
                      Pipeline Generated in
                    </span>
                  </td>
                  {tableColumns.map(col => (
                    <td
                      key={col.colLabel}
                      className="py-2.5 px-3 text-center bg-sky-500 last:rounded-r-lg"
                    >
                      <span className="text-sm italic text-white font-semibold">
                        {col.pipeLabel}
                      </span>
                    </td>
                  ))}
                </tr>
                {/* Pipeline */}
                <tr>
                  <td className="py-2.5 pr-6 pl-3 bg-sky-700 rounded-l-lg text-white font-semibold text-sm">
                    Pipeline
                  </td>
                  {tableColumns.map(col => (
                    <td
                      key={col.colLabel}
                      className="py-2.5 px-3 text-center bg-sky-700 last:rounded-r-lg text-white font-bold text-sm"
                    >
                      {fmtDollarOrDeals(col.quarterlyPipeline)}
                    </td>
                  ))}
                </tr>
                {/* Avg Win Rate */}
                <tr>
                  <td className="py-2.5 pr-6 pl-3 bg-sky-800 rounded-l-lg text-white text-sm">
                    Avg Win Rate
                  </td>
                  {tableColumns.map(col => (
                    <td
                      key={col.colLabel}
                      className="py-2.5 px-3 text-center bg-sky-800 last:rounded-r-lg text-white text-sm"
                    >
                      {fmtPct(col.winRatePct)}
                    </td>
                  ))}
                </tr>

                {/* Spacer */}
                <tr><td colSpan={5} className="py-1.5" /></tr>

                {/* ── Bookings cluster ─────────────────────────────────────── */}
                {/* Current Quarter — subheader */}
                <tr>
                  <td className="py-2.5 pr-6 pl-3 rounded-l-lg bg-violet-500">
                    <span className="text-sm italic text-white font-semibold">
                      Current Quarter
                    </span>
                  </td>
                  {tableColumns.map(col => (
                    <td
                      key={col.colLabel}
                      className="py-2.5 px-3 text-center bg-violet-500 last:rounded-r-lg"
                    >
                      <span className="text-sm italic text-white font-semibold">
                        {col.colLabel}
                      </span>
                    </td>
                  ))}
                </tr>
                {/* Bookings */}
                <tr>
                  <td className="py-2.5 pr-6 pl-3 bg-violet-700 rounded-l-lg text-white font-semibold text-sm">
                    Bookings
                  </td>
                  {tableColumns.map(col => (
                    <td
                      key={col.colLabel}
                      className="py-2.5 px-3 text-center bg-violet-700 last:rounded-r-lg text-white font-bold text-sm"
                    >
                      {fmtDollarOrDeals(col.quarterlyBookings)}
                    </td>
                  ))}
                </tr>
                {/* Number of Reps */}
                <tr>
                  <td className="py-2.5 pr-6 pl-3 bg-violet-800 rounded-l-lg text-white text-sm">
                    Number of Reps
                  </td>
                  {tableColumns.map(col => (
                    <td
                      key={col.colLabel}
                      className="py-2.5 px-3 text-center bg-violet-800 last:rounded-r-lg text-white text-sm"
                    >
                      {fmtReps(col.tableReps)}
                    </td>
                  ))}
                </tr>
                {/* Quota per Rep */}
                <tr>
                  <td className="py-2.5 pr-6 pl-3 bg-violet-700 rounded-l-lg text-white text-sm">
                    Quota per Rep
                  </td>
                  {tableColumns.map(col => (
                    <td
                      key={col.colLabel}
                      className="py-2.5 px-3 text-center bg-violet-700 last:rounded-r-lg text-white text-sm"
                    >
                      {fmtDollarOrDeals(col.tableQuotaPerRep)}
                    </td>
                  ))}
                </tr>
                {/* Avg Quota Attainment */}
                <tr>
                  <td className="py-2.5 pr-6 pl-3 bg-violet-800 rounded-l-lg rounded-bl-lg text-white text-sm">
                    Avg Quota Attainment
                  </td>
                  {tableColumns.map(col => (
                    <td
                      key={col.colLabel}
                      className="py-2.5 px-3 text-center bg-violet-800 last:rounded-r-lg last:rounded-br-lg text-white text-sm"
                    >
                      {fmtPct(col.attainmentPct)}
                    </td>
                  ))}
                </tr>

              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-5 mt-6 pt-5 border-t border-slate-700/40">
            <div className="flex items-center gap-2 text-sm text-white">
              <div className="h-3 w-3 rounded bg-sky-500" />
              Pipeline cluster — generated N quarters prior
            </div>
            <div className="flex items-center gap-2 text-sm text-white">
              <div className="h-3 w-3 rounded bg-violet-500" />
              Bookings cluster — quarter of close
            </div>
            <div className="ml-auto text-sm text-white italic">
              Linear / equal quarterly splits · V1
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pb-8 text-center text-xs text-slate-400">
          Revenue Planning Calculator · V1 · All math is linear; no seasonality weighting, rep ramp, or segment splits.
        </div>

      </div>
    </div>
  )
}
