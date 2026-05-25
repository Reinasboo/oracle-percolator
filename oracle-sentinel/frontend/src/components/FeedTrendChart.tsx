import React, {useMemo} from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import Card from './Card'

type HistoryPoint = {
  timestamp: number
  price: number
  confidence: number
  latencyMs?: number
  spreadBps?: number
  deviationBps?: number
  sourceCount?: number
}

type FeedTrendChartProps = {
  feed?: {
    feed_id: string
    feed_name: string
    price: number
    confidence: number
    source_count?: number
    venue?: string
    latency_ms?: number
    spread_bps?: number
    deviation_bps?: number
    anomaly_score?: number
    status?: string
    history: HistoryPoint[]
    updatedAt: string
  }
}

function formatPrice(price: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: Math.abs(price) >= 10 ? 2 : 4,
    maximumFractionDigits: Math.abs(price) >= 10 ? 2 : 4,
  }).format(price)
}

export default function FeedTrendChart({feed}: FeedTrendChartProps) {
  const chartData = useMemo(() => {
    const history = feed?.history ?? []

    return history.map((point, index) => {
      const previous = history[index - 1]
      const changePct = previous && previous.price !== 0
        ? Math.abs(((point.price - previous.price) / previous.price) * 100)
        : 0
      const rollingWindow = history.slice(Math.max(0, index - 2), index + 1)
      const realizedVolatility = rollingWindow.length > 1
        ? rollingWindow.reduce((sum, currentPoint, currentIndex) => {
          if (currentIndex === 0) {
            return sum
          }

          const priorPoint = rollingWindow[currentIndex - 1]
          if (priorPoint.price === 0) {
            return sum
          }

          return sum + Math.abs(((currentPoint.price - priorPoint.price) / priorPoint.price) * 100)
        }, 0) / (rollingWindow.length - 1)
        : 0

      return {
        ...point,
        label: new Intl.DateTimeFormat('en-US', {hour: '2-digit', minute: '2-digit'}).format(point.timestamp),
        confidenceScore: Math.round(point.confidence * 100),
        volatilityScore: Number((Math.max(changePct, realizedVolatility)).toFixed(2)),
        latencyScore: Math.round(point.latencyMs ?? feed?.latency_ms ?? 0),
      }
    })
  }, [feed])

  const latest = feed?.history[feed.history.length - 1]
  const latestVolatility = chartData[chartData.length - 1]?.volatilityScore ?? 0
  const latestLatency = chartData[chartData.length - 1]?.latencyScore ?? 0

  return (
    <Card className="space-y-5 rounded-[28px] border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.2)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Selected feed</div>
          <h2 className="mt-2 text-xl font-semibold text-white">{feed?.feed_name ?? 'No feed selected'}</h2>
          <p className="mt-1 text-sm text-slate-300">Live price history with confidence, volatility, latency, and the same oracle telemetry the backend should preserve in production.</p>
        </div>

        {feed ? (
          <div className="grid grid-cols-2 gap-3 text-right">
            <div className="rounded-2xl border border-white/8 bg-white/4 px-3 py-2">
              <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Price</div>
              <div className="mt-1 font-mono text-lg font-extrabold tabular-nums text-[var(--color-apex)]">${formatPrice(feed.price)}</div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/4 px-3 py-2">
              <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Confidence</div>
              <div className="mt-1 font-mono text-lg font-extrabold tabular-nums text-white">{Math.round(feed.confidence * 100)}%</div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Venue</div>
          <div className="mt-1 truncate text-sm text-white">{feed?.venue ?? 'Composite market'}</div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Sources</div>
          <div className="mt-1 text-sm text-white">{feed?.source_count ?? 0}</div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Latency</div>
          <div className="mt-1 text-sm text-white">{feed?.latency_ms ?? 0}ms</div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/4 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Anomaly</div>
          <div className="mt-1 text-sm text-white">{Math.round((feed?.anomaly_score ?? 0) * 100)}%</div>
        </div>
      </div>

      <div className="h-[340px] rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] p-4">
        {chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-slate-400">
            Select a feed to view its trend line.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{top: 8, right: 12, left: 0, bottom: 0}}>
              <defs>
                <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="rgba(0,217,255,0.42)" stopOpacity={0.38} />
                  <stop offset="95%" stopColor="rgba(0,217,255,0.02)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.07)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{fill: 'rgba(226,232,240,0.72)', fontSize: 12}} axisLine={false} tickLine={false} minTickGap={24} />
              <YAxis yAxisId="price" tick={{fill: 'rgba(226,232,240,0.72)', fontSize: 12}} axisLine={false} tickLine={false} width={64} tickFormatter={(value: number) => `$${formatPrice(value)}`} domain={["dataMin - 1", "dataMax + 1"]} />
              <YAxis yAxisId="confidence" orientation="right" tick={{fill: 'rgba(226,232,240,0.72)', fontSize: 12}} axisLine={false} tickLine={false} width={48} tickFormatter={(value: number) => `${value}%`} domain={[55, 100]} />
              <Tooltip
                contentStyle={{
                  background: 'rgba(10,14,39,0.96)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 16,
                  color: 'white',
                }}
                labelStyle={{color: 'rgba(226,232,240,0.75)'}}
                formatter={(value: number, name: string) => {
                  if (name === 'confidenceScore') {
                    return [`${value}%`, 'Confidence']
                  }

                  return [`$${formatPrice(value)}`, 'Price']
                }}
              />
              <Area yAxisId="price" type="monotone" dataKey="price" stroke="rgba(0,217,255,1)" strokeWidth={2} fill="url(#priceFill)" dot={false} activeDot={{r: 4}} />
              <Line yAxisId="confidence" type="monotone" dataKey="confidenceScore" stroke="rgba(124,58,237,1)" strokeWidth={2} dot={false} strokeDasharray="4 4" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Risk profile</div>
            <h3 className="mt-1 text-base font-semibold text-white">Confidence, volatility, and latency</h3>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
            Volatility {latestVolatility.toFixed(2)}% · Latency {latestLatency}ms
          </div>
        </div>

        <div className="h-64 rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-4">
          {chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-slate-400">
              Risk metrics appear here once the feed starts moving.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{top: 8, right: 12, left: 0, bottom: 0}}>
                <CartesianGrid stroke="rgba(255,255,255,0.07)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{fill: 'rgba(226,232,240,0.72)', fontSize: 12}} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis yAxisId="confidence" tick={{fill: 'rgba(226,232,240,0.72)', fontSize: 12}} axisLine={false} tickLine={false} width={44} domain={[55, 100]} tickFormatter={(value: number) => `${value}%`} />
                <YAxis yAxisId="volatility" orientation="right" tick={{fill: 'rgba(226,232,240,0.72)', fontSize: 12}} axisLine={false} tickLine={false} width={58} domain={[0, 'dataMax + 1']} tickFormatter={(value: number) => `${value}%`} />
                <YAxis yAxisId="latency" hide domain={[0, 'dataMax + 20']} />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(10,14,39,0.96)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 16,
                    color: 'white',
                  }}
                  labelStyle={{color: 'rgba(226,232,240,0.75)'}}
                  formatter={(value: number, name: string) => {
                    if (name === 'confidenceScore') {
                      return [`${value}%`, 'Confidence']
                    }

                    if (name === 'volatilityScore') {
                      return [`${value}%`, 'Volatility']
                    }

                    if (name === 'latencyScore') {
                      return [`${value}ms`, 'Latency']
                    }

                    return [String(value), name]
                  }}
                />
                <Line yAxisId="confidence" type="monotone" dataKey="confidenceScore" stroke="rgba(0,217,255,1)" strokeWidth={2} dot={false} />
                <Line yAxisId="volatility" type="monotone" dataKey="volatilityScore" stroke="rgba(255,0,110,1)" strokeWidth={2} dot={false} strokeDasharray="4 4" />
                <Line yAxisId="latency" type="monotone" dataKey="latencyScore" stroke="rgba(20,184,166,1)" strokeWidth={2} dot={false} strokeDasharray="2 4" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-2">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Latest latency</div>
            <div className="mt-1 text-sm text-white">{latestLatency}ms</div>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-2">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Spread</div>
            <div className="mt-1 text-sm text-white">{feed?.spread_bps?.toFixed(2) ?? '0.00'}bps</div>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/4 px-3 py-2">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Deviation</div>
            <div className="mt-1 text-sm text-white">{feed?.deviation_bps?.toFixed(1) ?? '0.0'}bps</div>
          </div>
        </div>
      </div>

      {latest ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/8 bg-white/4 px-3 py-2">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Latest tick</div>
            <div className="mt-1 font-mono text-sm text-slate-100">{new Intl.DateTimeFormat('en-US', {hour:'numeric', minute:'2-digit', second:'2-digit'}).format(latest.timestamp)}</div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/4 px-3 py-2">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Sample count</div>
            <div className="mt-1 font-mono text-sm text-slate-100">{chartData.length} points</div>
          </div>
          <div className="rounded-2xl border border-white/8 bg-white/4 px-3 py-2">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Confidence band</div>
            <div className="mt-1 font-mono text-sm text-slate-100">{Math.round(latest.confidence * 100)}%</div>
          </div>
        </div>
      ) : null}
    </Card>
  )
}