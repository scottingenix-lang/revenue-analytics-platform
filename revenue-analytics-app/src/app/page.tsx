import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Disclaimer banner */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-center text-sm text-amber-800">
        <strong>Portfolio Prototype:</strong> This application is built with synthetic data for
        demonstration purposes only. Not affiliated with Onspring Technologies.
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="max-w-2xl text-center space-y-6">
          {/* Logo mark */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center">
              <svg
                className="w-7 h-7 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
                />
              </svg>
            </div>
            <span className="text-2xl font-semibold text-slate-900">Revenue Analytics Platform</span>
          </div>

          <h1 className="text-4xl font-bold text-slate-900 leading-tight">
            AI-augmented revenue intelligence
            <br />
            <span className="text-indigo-600">for modern GTM teams</span>
          </h1>

          <p className="text-lg text-slate-500">
            Unified ARR tracking, attribution modeling, pipeline velocity, and retention analysis —
            all in one place.
          </p>

          <div>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-8 py-3 rounded-lg transition-colors"
            >
              Sign In
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </div>

      <footer className="py-6 text-center text-sm text-slate-400">
        © 2026 Revenue Analytics Platform — Portfolio Demo
      </footer>
    </div>
  )
}
