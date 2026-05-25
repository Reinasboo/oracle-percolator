import React, {useMemo} from 'react'
import Card from './Card'

type FeedRow = {
  feed_id: string
  feed_name?: string
  price?: number
  confidence?: number
  updatedAt?: string
  source_count?: number
  venue?: string
  latency_ms?: number
  spread_bps?: number
  deviation_bps?: number
  anomaly_score?: number
  status?: string
  history?: {timestamp: number, price: number, confidence: number}[]
}

function formatPrice(price: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: Math.abs(price) >= 10 ? 2 : 4,
    maximumFractionDigits: Math.abs(price) >= 10 ? 2 : 4,
  }).format(price)
}

function FeedSparkline({history, selected}: {history: {timestamp: number, price: number}[], selected?: boolean}) {
  const path = useMemo(() => {
    if (history.length < 2) {
      return ''
    }

    const width = 112
    const height = 56
    const prices = history.map((point) => point.price)
    const min = Math.min(...prices)
    const max = Math.max(...prices)
    const range = Math.max(max - min, 1e-6)

    return history.reduce((accumulator, point, index) => {
      const x = (index / (history.length - 1)) * width
      const y = height - ((point.price - min) / range) * height
      return accumulator + `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)} `
    }, '')
  }, [history])

  return (
    <div className="w-full sm:w-28">
      <svg viewBox="0 0 112 56" className="h-14 w-full overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id={`spark-${selected ? 'active' : 'idle'}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={selected ? 'var(--color-apex)' : 'rgba(148,163,184,0.85)'} />
            <stop offset="100%" stopColor={selected ? 'var(--color-sentinel)' : 'rgba(148,163,184,0.55)'} />
          </linearGradient>
        </defs>
        <path d={path} fill="none" stroke={`url(#spark-${selected ? 'active' : 'idle'})`} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

export default function FeedList({feeds, selectedFeedId, onSelectFeed}:{feeds: FeedRow[], selectedFeedId?: string, onSelectFeed: (feedId: string) => void}) {
  return (
    <Card className="space-y-4 rounded-[28px] border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)]">
      <div>
        <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Sample dataset viewer</div>
        <h3 className="mt-2 text-lg font-semibold text-white">Historical sparks by feed</h3>
        <p className="mt-1 text-sm text-slate-300">Each asset keeps a small rolling history plus the oracle fields that matter for confidence, latency, and source diversity.</p>
      </div>

      {feeds.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 bg-white/3 px-4 py-6 text-sm text-slate-400">
          No feeds loaded yet. Wait for the next price tick to populate the dataset.
        </div>
      ) : (
        <div className="space-y-2">
          {feeds.map((feed) => {
            const history = feed.history?.slice(-12) ?? []
            const currentPrice = feed.price ?? 0
            const previousPrice = history.length > 1 ? history[history.length - 2].price : currentPrice
            const priceChange = previousPrice === 0 ? 0 : ((currentPrice - previousPrice) / previousPrice) * 100
            const isSelected = selectedFeedId === feed.feed_id

            return (
              <button
                key={feed.feed_id}
                type="button"
                onClick={() => onSelectFeed(feed.feed_id)}
                className={`flex w-full flex-col gap-3 rounded-2xl border px-3 py-3 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-apex)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent sm:flex-row sm:items-center ${isSelected ? 'border-[rgba(0,217,255,0.35)] bg-[rgba(0,217,255,0.09)] shadow-[0_0_0_1px_rgba(0,217,255,0.12)]' : 'border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.03)] hover:-translate-y-0.5 hover:bg-[rgba(255,255,255,0.05)]'}`}
                aria-pressed={isSelected}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-sm font-medium text-slate-100 sm:text-base">{feed.feed_name || feed.feed_id}</div>
                    {isSelected ? <span className="rounded-full border border-[rgba(0,217,255,0.22)] bg-[rgba(0,217,255,0.12)] px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-[var(--color-apex)]">Selected</span> : null}
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <div className="font-mono text-base font-semibold tabular-nums text-white sm:text-lg">${formatPrice(currentPrice)}</div>
                    <div className={`text-xs font-medium ${priceChange >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">{feed.history?.length ?? 0} samples · {feed.confidence !== undefined ? `${Math.round(feed.confidence * 100)}% confidence` : 'confidence pending'}</div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-300">
                    <span className="rounded-full border border-white/8 bg-white/4 px-2 py-1">{feed.source_count ?? 0} sources</span>
                    <span className="rounded-full border border-white/8 bg-white/4 px-2 py-1">{feed.latency_ms ?? 0}ms</span>
                    <span className="rounded-full border border-white/8 bg-white/4 px-2 py-1">{feed.spread_bps?.toFixed(2) ?? '0.00'}bps spread</span>
                  </div>
                </div>

                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <FeedSparkline history={history.length > 1 ? history : [{timestamp: Date.now(), price: currentPrice}, {timestamp: Date.now() + 1, price: currentPrice}]} selected={isSelected} />
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">sparkline</div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </Card>
  )
}
