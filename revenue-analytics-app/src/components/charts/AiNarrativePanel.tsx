'use client'

import { useQuery } from '@tanstack/react-query'
import { Sparkles, RefreshCw } from 'lucide-react'

type NarrativeResponse = {
  narrative: string
  generated_at: string
  cached: boolean
}

export default function AiNarrativePanel() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<NarrativeResponse>({
    queryKey: ['cockpit-narrative'],
    queryFn: () => fetch('/api/cockpit/narrative').then((r) => r.json()),
    staleTime: 60 * 60 * 1000, // 1 hour
  })

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-5 h-5 rounded bg-indigo-100 flex items-center justify-center">
          <Sparkles className="w-3 h-3 text-indigo-600" />
        </div>
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          AI Executive Summary
        </span>
        <span className="ml-auto flex items-center gap-2">
          {data?.cached && (
            <span className="text-xs text-slate-400 bg-gray-100 px-2 py-0.5 rounded-full">Cached</span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-40"
            title="Refresh narrative"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </span>
      </div>

      {isLoading || isFetching ? (
        <div className="space-y-2">
          <div className="h-3.5 bg-gray-100 rounded animate-pulse w-full" />
          <div className="h-3.5 bg-gray-100 rounded animate-pulse w-5/6" />
          <div className="h-3.5 bg-gray-100 rounded animate-pulse w-4/6" />
        </div>
      ) : isError ? (
        <p className="text-sm text-red-500">Failed to load narrative. Check ANTHROPIC_API_KEY.</p>
      ) : (
        <p className="text-sm text-slate-700 leading-relaxed">{data?.narrative}</p>
      )}

      {data?.generated_at && !isLoading && (
        <p className="text-xs text-slate-400 mt-3">
          Generated {new Date(data.generated_at).toLocaleString()}
        </p>
      )}
    </div>
  )
}
