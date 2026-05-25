import React, {useEffect, useMemo, useState} from 'react'
import ConfidenceGauge from './ConfidenceGauge'
import FeedList from './FeedList'
import FeedTrendChart from './FeedTrendChart'
import AlertList from './AlertList'
import { connectSocket, getSocket } from '../services/socket'

type HistoryPoint = {
  timestamp: number
  price: number
  confidence: number
  latencyMs: number
  spreadBps: number
  deviationBps: number
  sourceCount: number
}

type FeedState = {
  feed_id: string
  feed_name: string
  price: number
  confidence: number
  source_count: number
  venue: string
  latency_ms: number
  spread_bps: number
  deviation_bps: number
  anomaly_score: number
  status: string
  history: HistoryPoint[]
  updatedAt: string
}

const HISTORY_LIMIT = 24
const HISTORY_WINDOW_MINUTES = 5

function roundPrice(price: number) {
  return Math.abs(price) >= 10 ? Math.round(price * 100) / 100 : Math.round(price * 10000) / 10000
}

function formatPrice(price: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: Math.abs(price) >= 10 ? 2 : 4,
    maximumFractionDigits: Math.abs(price) >= 10 ? 2 : 4,
  }).format(price)
}

function formatPercent(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

function deriveTelemetry(price: number, confidence: number, volatility: number, sourceCount: number) {
  const spreadBps = Number(Math.max(0.01, volatility * 28 + sourceCount * 0.04).toFixed(2))
  const deviationBps = Number((Math.max(0.5, volatility * 180) + Math.abs(1 - confidence) * 55).toFixed(1))
  const latencyMs = Math.round(48 + volatility * 950 + sourceCount * 3)
  const anomalyScore = Number(Math.max(0, Math.min(1, volatility * 0.8 + (1 - confidence) * 0.6)).toFixed(2))

  return {spreadBps, deviationBps, latencyMs, anomalyScore}
}

function createHistory(price: number, confidence: number, anchor: number, sourceCount: number) {
  return Array.from({length: HISTORY_LIMIT}, (_, index) => {
    const offset = HISTORY_LIMIT - index - 1
    const oscillation = Math.sin(index / 2.5) * (price * 0.004)
    const drift = (index - HISTORY_LIMIT / 2) * price * 0.00045
    const samplePrice = roundPrice(Math.max(price * 0.985, price + drift + oscillation))
    const volatility = Math.abs(samplePrice - price) / Math.max(price, 1)
    const telemetry = deriveTelemetry(samplePrice, confidence, volatility, sourceCount)

    return {
      timestamp: anchor - offset * HISTORY_WINDOW_MINUTES * 60 * 1000,
      price: samplePrice,
      confidence: Math.max(0.55, Math.min(0.99, confidence - Math.abs(Math.cos(index / 3)) * 0.08 + (index % 3 === 0 ? 0.03 : 0))),
      latencyMs: telemetry.latencyMs,
      spreadBps: telemetry.spreadBps,
      deviationBps: telemetry.deviationBps,
      sourceCount,
    }
  })
}

function seedFeed(feed: {feed_id: string, feed_name: string, price: number, confidence: number, base_volatility: number, source_count: number, venue: string}, anchor: number): FeedState {
  const telemetry = deriveTelemetry(feed.price, feed.confidence, feed.base_volatility, feed.source_count)

  return {
    feed_id: feed.feed_id,
    feed_name: feed.feed_name,
    price: feed.price,
    confidence: feed.confidence,
    source_count: feed.source_count,
    venue: feed.venue,
    latency_ms: telemetry.latencyMs,
    spread_bps: telemetry.spreadBps,
    deviation_bps: telemetry.deviationBps,
    anomaly_score: telemetry.anomalyScore,
    status: feed.confidence > 0.9 ? 'healthy' : feed.confidence > 0.8 ? 'watch' : 'review',
    history: createHistory(feed.price, feed.confidence, anchor, feed.source_count),
    updatedAt: new Date(anchor).toISOString(),
  }
}

function seedFeeds(): FeedState[] {
  const now = Date.now()

  return [
    seedFeed({feed_id: 'SOL/USD', feed_name: 'SOL / USDC', price: 152.3, confidence: 0.92, base_volatility: 0.02, source_count: 7, venue: 'Pyth + Chainlink'}, now),
    seedFeed({feed_id: 'BTC/USD', feed_name: 'BTC / USD', price: 67600, confidence: 0.95, base_volatility: 0.01, source_count: 9, venue: 'Coinbase + Kraken'}, now),
    seedFeed({feed_id: 'ETH/USD', feed_name: 'ETH / USD', price: 3200.5, confidence: 0.94, base_volatility: 0.015, source_count: 8, venue: 'CEX composite'}, now),
    seedFeed({feed_id: 'USDC/USD', feed_name: 'USDC / USD', price: 1.0002, confidence: 0.99, base_volatility: 0.0001, source_count: 5, venue: 'Stablecoin peg basket'}, now),
    seedFeed({feed_id: 'RAY/USD', feed_name: 'RAY / USD', price: 7.45, confidence: 0.85, base_volatility: 0.035, source_count: 6, venue: 'DEX composite'}, now),
    seedFeed({feed_id: 'JUP/USD', feed_name: 'JUP / USD', price: 1.42, confidence: 0.83, base_volatility: 0.04, source_count: 5, venue: 'Liquid routing venues'}, now),
    seedFeed({feed_id: 'mSOL/SOL', feed_name: 'mSOL / SOL', price: 1.027, confidence: 0.97, base_volatility: 0.004, source_count: 4, venue: 'LST basket'}, now),
    seedFeed({feed_id: 'PYUSD/USD', feed_name: 'PYUSD / USD', price: 0.9998, confidence: 0.98, base_volatility: 0.00015, source_count: 4, venue: 'Peg monitor'}, now),
  ]
}

function mergeFeedSample(feedId: string, feed: FeedState | undefined, patch: Partial<Pick<FeedState, 'feed_name' | 'price' | 'confidence' | 'source_count' | 'venue' | 'latency_ms' | 'spread_bps' | 'deviation_bps' | 'anomaly_score' | 'status'>>, timestamp: number) {
  if (!feed) {
    const price = patch.price ?? 0
    const confidence = patch.confidence ?? 0
    const sourceCount = patch.source_count ?? 0

    return {
      feed_id: feedId,
      feed_name: patch.feed_name ?? feedId,
      price,
      confidence,
      source_count: sourceCount,
      venue: patch.venue ?? 'Unknown venue',
      latency_ms: patch.latency_ms ?? 0,
      spread_bps: patch.spread_bps ?? 0,
      deviation_bps: patch.deviation_bps ?? 0,
      anomaly_score: patch.anomaly_score ?? 0,
      status: patch.status ?? 'watch',
      history: patch.price !== undefined ? [{timestamp, price, confidence, latencyMs: patch.latency_ms ?? 0, spreadBps: patch.spread_bps ?? 0, deviationBps: patch.deviation_bps ?? 0, sourceCount}] : [],
      updatedAt: new Date(timestamp).toISOString(),
    }
  }

  const nextPrice = patch.price ?? feed.price
  const nextConfidence = patch.confidence ?? feed.confidence
  const nextSourceCount = patch.source_count ?? feed.source_count
  const nextLatency = patch.latency_ms ?? feed.latency_ms
  const nextSpread = patch.spread_bps ?? feed.spread_bps
  const nextDeviation = patch.deviation_bps ?? feed.deviation_bps
  const nextAnomaly = patch.anomaly_score ?? feed.anomaly_score
  const nextStatus = patch.status ?? feed.status

  const history = patch.price !== undefined
    ? [...feed.history, {
      timestamp,
      price: nextPrice,
      confidence: nextConfidence,
      latencyMs: nextLatency,
      spreadBps: nextSpread,
      deviationBps: nextDeviation,
      sourceCount: nextSourceCount,
    }].slice(-HISTORY_LIMIT)
    : feed.history.map((point, index, points) => (
      index === points.length - 1
        ? {
          ...point,
          confidence: nextConfidence,
          latencyMs: nextLatency,
          spreadBps: nextSpread,
          deviationBps: nextDeviation,
          sourceCount: nextSourceCount,
        }
        : point
    ))

  return {
    ...feed,
    feed_name: patch.feed_name ?? feed.feed_name,
    price: nextPrice,
    confidence: nextConfidence,
    source_count: nextSourceCount,
    venue: patch.venue ?? feed.venue,
    latency_ms: nextLatency,
    spread_bps: nextSpread,
    deviation_bps: nextDeviation,
    anomaly_score: nextAnomaly,
    status: nextStatus,
    history,
    updatedAt: new Date(timestamp).toISOString(),
  }
}

function percentChange(history: HistoryPoint[]) {
  if (history.length < 2) {
    return 0
  }

  const previous = history[history.length - 2].price
  const current = history[history.length - 1].price
  if (previous === 0) {
    return 0
  }

  return ((current - previous) / previous) * 100
}

function windowLabel(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

export default function Dashboard() {
  const [feeds, setFeeds] = useState<FeedState[]>(() => seedFeeds())
  const [alerts, setAlerts] = useState<any[]>([])
  const [selectedFeedId, setSelectedFeedId] = useState<string>('SOL/USD')

  useEffect(() => {
    const socket = connectSocket()

    socket.on('connect', () => {
      console.log('socket connected', socket.id)
    })

    socket.on('price_update', (data: any) => {
      const timestamp = Date.now()

      setFeeds((currentFeeds) => {
        const existing = currentFeeds.find((feed) => feed.feed_id === data.feed_id)
        const patch = {
          feed_name: data.feed_name,
          price: roundPrice(data.price),
          confidence: data.confidence ?? existing?.confidence ?? 0,
          source_count: data.source_count ?? existing?.source_count,
          venue: data.venue ?? existing?.venue,
          latency_ms: data.latency_ms ?? existing?.latency_ms,
          spread_bps: data.spread_bps ?? existing?.spread_bps,
          deviation_bps: data.deviation_bps ?? existing?.deviation_bps,
          anomaly_score: data.anomaly_score ?? existing?.anomaly_score,
          status: (data.confidence ?? existing?.confidence ?? 0) > 0.9 ? 'healthy' : (data.confidence ?? existing?.confidence ?? 0) > 0.8 ? 'watch' : 'review',
        }

        if (existing) {
          return currentFeeds.map((feed) => (
            feed.feed_id === data.feed_id
              ? mergeFeedSample(data.feed_id, feed, patch, timestamp)
              : feed
          ))
        }

        return [mergeFeedSample(data.feed_id, undefined, patch, timestamp), ...currentFeeds]
      })
    })

    socket.on('confidence_updated', (data: any) => {
      const timestamp = Date.now()

      setFeeds((currentFeeds) => currentFeeds.map((feed) => (
        feed.feed_id === data.feed_id
          ? mergeFeedSample(data.feed_id, feed, {
            confidence: data.confidence,
            latency_ms: data.latency_ms ?? feed.latency_ms,
            source_count: data.source_count ?? feed.source_count,
            spread_bps: data.spread_bps ?? feed.spread_bps,
            deviation_bps: data.deviation_bps ?? feed.deviation_bps,
            status: (data.confidence ?? feed.confidence) > 0.9 ? 'healthy' : (data.confidence ?? feed.confidence) > 0.8 ? 'watch' : 'review',
          }, timestamp)
          : feed
      )))
    })

    socket.on('outage_warning', (data: any) => {
      const probability = data.probability ?? data.predicted_outage_probability ?? 0
      setAlerts((currentAlerts) => [{
        id: `${data.feed_id}-${Date.now()}`,
        severity: probability > 0.7 ? 'critical' : 'warning',
        message: `Outage risk ${Math.round(probability * 100)}% · recovery ${data.estimated_recovery_time_minutes ?? 'unknown'} min`,
      }, ...currentAlerts].slice(0, 10))
    })

    socket.on('connect_error', (err: any) => console.warn('connect_error', err))

    return () => {
      const activeSocket = getSocket()
      activeSocket?.off('price_update')
      activeSocket?.off('confidence_updated')
      activeSocket?.off('outage_warning')
      activeSocket?.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!feeds.length) {
      return
    }

    if (!feeds.some((feed) => feed.feed_id === selectedFeedId)) {
      setSelectedFeedId(feeds[0].feed_id)
    }
  }, [feeds, selectedFeedId])

  const selectedFeed = useMemo(() => feeds.find((feed) => feed.feed_id === selectedFeedId) ?? feeds[0], [feeds, selectedFeedId])
  const latestConfidence = selectedFeed?.confidence ?? 0
  const latestPrice = selectedFeed?.price ?? 0
  const trendChange = selectedFeed ? percentChange(selectedFeed.history) : 0
  const lastUpdatedLabel = selectedFeed
    ? new Intl.DateTimeFormat('en-US', {hour: 'numeric', minute: '2-digit', second: '2-digit'}).format(new Date(selectedFeed.updatedAt))
    : '—'
  const averageConfidence = feeds.length ? feeds.reduce((sum, feed) => sum + feed.confidence, 0) / feeds.length : 0
  const medianLatency = feeds.length ? [...feeds].sort((left, right) => left.latency_ms - right.latency_ms)[Math.floor(feeds.length / 2)]?.latency_ms ?? 0 : 0
  const activeAlerts = alerts.length

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_420px] lg:items-start">
        <div className="min-w-0 rounded-[28px] border border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(0,217,255,0.14),transparent_30%),linear-gradient(180deg,rgba(10,14,39,0.92),rgba(10,14,39,0.68))] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-6 lg:justify-start">
            <div className="space-y-4 max-w-[62ch]">
              <div className="inline-flex items-center gap-2 rounded-full border border-[rgba(0,217,255,0.18)] bg-[rgba(0,217,255,0.08)] px-3 py-1 text-xs uppercase tracking-[0.24em] text-[#7cecff]">
                Oracle Sentinel demo
              </div>
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-white md:text-4xl">Multi-asset oracle telemetry with live confidence and market quality signals.</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 md:text-base">Track multiple assets, inspect source counts, latency, spread, deviation, and anomaly risk, and move between feeds without losing the broader market picture.</p>
              </div>
            </div>

            
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-1 w-full lg:max-w-[420px]">
          <div className="w-full">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-white/8 bg-white/5 px-3 py-3 w-32 sm:w-36">
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Assets</div>
                <div className="mt-1 text-2xl font-extrabold text-[var(--color-apex)]">{feeds.length}</div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/5 px-3 py-3 w-32 sm:w-36">
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Avg conf.</div>
                <div className="mt-1 text-2xl font-extrabold text-[var(--color-apex)]">{Math.round(averageConfidence * 100)}%</div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/5 px-3 py-3 w-32 sm:w-36">
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Median latency</div>
                <div className="mt-1 text-2xl font-extrabold text-[var(--color-apex)]">{medianLatency}ms</div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/5 px-3 py-3 w-32 sm:w-36">
                <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Alerts</div>
                <div className="mt-1 text-2xl font-extrabold text-[var(--color-apex)]">{activeAlerts}</div>
              </div>
            </div>
          </div>
          <div className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.18)]">
            <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Selected feed</div>
            <div className="mt-2 text-3xl font-semibold tracking-tight text-white">{selectedFeed?.feed_name ?? 'Live feed'}</div>
            <div className={`mt-2 text-sm font-medium ${trendChange >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{selectedFeed ? formatPercent(trendChange) : '—'}</div>
            <div className="mt-4 font-mono text-2xl font-extrabold tabular-nums text-[var(--color-apex)]">${formatPrice(latestPrice)}</div>
          </div>
          <div className="flex items-center justify-center rounded-[28px] border border-white/8 bg-white/4 p-4 backdrop-blur-xl">
            <ConfidenceGauge value={latestConfidence} />
          </div>
          <div className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(20,184,166,0.14),rgba(255,255,255,0.03))] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.18)]">
            <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Last update</div>
            <div className="mt-2 text-2xl font-semibold tracking-tight text-white">{lastUpdatedLabel}</div>
            <div className="mt-2 text-sm text-slate-300">{selectedFeed ? `${selectedFeed.history.length} samples · ${selectedFeed.source_count} sources` : 'Awaiting feed selection'}</div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {feeds.map((feed) => {
          const history = feed.history
          const previousPrice = history.length > 1 ? history[history.length - 2].price : feed.price
          const assetDelta = previousPrice === 0 ? 0 : ((feed.price - previousPrice) / previousPrice) * 100
          const isSelected = selectedFeed?.feed_id === feed.feed_id

          return (
            <button
              key={feed.feed_id}
              type="button"
              onClick={() => setSelectedFeedId(feed.feed_id)}
              aria-pressed={isSelected}
              className={`group rounded-[28px] border p-4 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-apex)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${isSelected ? 'border-[rgba(0,217,255,0.3)] bg-[rgba(0,217,255,0.08)] shadow-[0_0_0_1px_rgba(0,217,255,0.12),0_20px_45px_rgba(0,217,255,0.08)]' : 'border-white/8 bg-white/4 hover:-translate-y-0.5 hover:bg-white/6'}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.22em] text-slate-400">{feed.feed_id}</div>
                  <div className="mt-1 text-lg font-semibold text-white">{feed.feed_name}</div>
                </div>
                <div className={`rounded-full px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] ${feed.status === 'healthy' ? 'bg-emerald-400/10 text-emerald-200' : feed.status === 'watch' ? 'bg-amber-400/10 text-amber-200' : 'bg-rose-400/10 text-rose-200'}`}>
                  {feed.status}
                </div>
              </div>

              <div className="mt-4 flex items-end justify-between gap-4">
                <div>
                  <div className="font-mono text-2xl font-extrabold tabular-nums text-[var(--color-apex)]">${formatPrice(feed.price)}</div>
                  <div className={`mt-1 text-sm font-medium ${assetDelta >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {assetDelta >= 0 ? '+' : ''}{assetDelta.toFixed(2)}%
                  </div>
                </div>
                <div className="w-24 text-right text-xs text-slate-400">{feed.venue}</div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-300">
                <div className="rounded-xl border border-white/8 bg-black/10 px-2 py-2">
                  <div className="text-slate-500">Confidence</div>
                  <div className="mt-1 font-mono text-sm text-white">{Math.round(feed.confidence * 100)}%</div>
                </div>
                <div className="rounded-xl border border-white/8 bg-black/10 px-2 py-2">
                  <div className="text-slate-500">Latency</div>
                  <div className="mt-1 font-mono text-sm text-white">{feed.latency_ms}ms</div>
                </div>
                <div className="rounded-xl border border-white/8 bg-black/10 px-2 py-2">
                  <div className="text-slate-500">Sources</div>
                  <div className="mt-1 font-mono text-sm text-white">{feed.source_count}</div>
                </div>
                <div className="rounded-xl border border-white/8 bg-black/10 px-2 py-2">
                  <div className="text-slate-500">Spread</div>
                  <div className="mt-1 font-mono text-sm text-white">{feed.spread_bps.toFixed(2)}bps</div>
                </div>
              </div>
            </button>
          )
        })}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.45fr_0.85fr]">
        <div className="space-y-6">
          <FeedTrendChart feed={selectedFeed} />

          <div className="rounded-[28px] border border-[var(--glass-border)] bg-[rgba(10,14,39,0.45)] p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Signal context</div>
                <h2 className="mt-2 text-lg font-semibold text-white">Historical feed spread</h2>
                <p className="mt-1 text-sm text-slate-300">The demo now surfaces the backend-style fields the product cares about: source diversity, latency, spread, deviation, and anomaly risk.</p>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                {feeds.length} feeds tracked
              </div>
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="sticky top-6 space-y-4">
            <div>
              <div className="text-sm text-slate-300">Alerts</div>
              <div className="mt-2 space-y-2">
                <AlertList alerts={alerts} />
              </div>
            </div>

            <FeedList
              feeds={feeds}
              selectedFeedId={selectedFeed?.feed_id ?? selectedFeedId}
              onSelectFeed={setSelectedFeedId}
            />

            <div className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(124,58,237,0.12),rgba(255,255,255,0.03))] p-5 shadow-sm">
              <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Backend signals</div>
              <div className="mt-3 space-y-3 text-sm text-slate-300">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/10 px-3 py-2">
                  <span>Selected asset</span>
                  <span className="font-mono text-white">{selectedFeed?.feed_id ?? '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/10 px-3 py-2">
                  <span>Deviation</span>
                  <span className="font-mono text-white">{selectedFeed ? `${selectedFeed.deviation_bps.toFixed(1)}bps` : '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/10 px-3 py-2">
                  <span>Anomaly score</span>
                  <span className="font-mono text-white">{selectedFeed ? `${Math.round(selectedFeed.anomaly_score * 100)}%` : '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/10 px-3 py-2">
                  <span>Venue</span>
                  <span className="text-right text-white">{selectedFeed?.venue ?? '—'}</span>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </section>
    </div>
  )
}
