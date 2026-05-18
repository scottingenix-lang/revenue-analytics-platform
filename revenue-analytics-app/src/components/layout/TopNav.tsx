'use client'

import { useRouter, usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'
import { LogOut, ChevronDown } from 'lucide-react'

const PAGE_TITLES: Record<string, string> = {
  '/executive-overview': 'Executive Overview',
  '/attribution':        'Attribution',
  '/pipeline':           'Pipeline & Sales Velocity',
  '/retention':          'Retention & Expansion',
  '/unit-economics':     'Unit Economics',
  '/admin':              'Admin / Data Quality',
}

const PAGE_SUBTITLES: Record<string, string> = {
  '/executive-overview': 'A unified view of growth efficiency, forecasting health, pipeline quality, and operational risk across the revenue organization.',
  '/attribution':        'Track how marketing channels, campaigns, and touches drive pipeline and closed revenue across the buyer journey.',
  '/pipeline':           'Analyze deal flow, stage conversion, rep performance, and forecast accuracy across the active pipeline.',
  '/retention':          'Monitor net and gross revenue retention, cohort health, and expansion ARR trends across the customer base.',
  '/unit-economics':     'Evaluate the efficiency of revenue growth through CAC, payback period, LTV, and gross margin metrics.',
  '/admin':              'Manage data integrations, monitor AI model activity, and review the metric formulas powering this platform.',
}

export default function TopNav() {
  const router = useRouter()
  const pathname = usePathname()
  const [email, setEmail] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const title    = PAGE_TITLES[pathname]    ?? 'Dashboard'
  const subtitle = PAGE_SUBTITLES[pathname] ?? null

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null)
    })
  }, [])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const initials = email ? email[0].toUpperCase() : '?'

  return (
    <header className="bg-white border-b border-gray-200 flex items-center justify-between px-6 py-3 flex-shrink-0">
      <div>
        <h1 className="text-base font-semibold text-slate-800 leading-snug">{title}</h1>
        {subtitle && <p className="text-sm text-purple-600 mt-0.5 whitespace-nowrap">{subtitle}</p>}
      </div>

      {/* User menu */}
      <div className="relative">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-100 transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-semibold">
            {initials}
          </div>
          <span className="text-sm text-slate-700 max-w-[160px] truncate hidden sm:block">
            {email}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-20 py-1">
              <div className="px-3 py-2 border-b border-gray-100">
                <p className="text-xs text-slate-500 truncate">{email}</p>
              </div>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 hover:bg-gray-50 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  )
}
