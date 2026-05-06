export function fmtUSD(value: number, compact = true): string {
  if (!compact) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
  }
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toFixed(0)}`
}

export function fmtPct(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`
}

export function fmtMultiple(value: number): string {
  return `${value.toFixed(1)}x`
}

export function fmtMonths(value: number): string {
  return `${value.toFixed(1)} mo`
}

export function fmtDays(value: number): string {
  return `${Math.round(value)} days`
}

export function fmtNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(value))
}
