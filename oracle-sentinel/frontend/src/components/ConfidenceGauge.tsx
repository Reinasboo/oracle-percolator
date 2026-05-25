import React from 'react'

export default function ConfidenceGauge({value}:{value:number}){
  const pct = Math.max(0, Math.min(1, value))
  const angle = pct * 180
  const color = pct > 0.95 ? 'text-teal-400' : pct > 0.85 ? 'text-sentinel' : pct > 0.7 ? 'text-yellow-400' : pct > 0.5 ? 'text-orange-400' : 'text-neon'

  return (
    <div className="w-40 h-24 flex flex-col items-center">
      <svg viewBox="0 0 100 50" className="w-40 h-24">
        <defs>
          <linearGradient id="g" x1="0%" x2="100%">
            <stop offset="0%" stopColor="#14B8A6" />
            <stop offset="100%" stopColor="#00D9FF" />
          </linearGradient>
        </defs>
        <path d="M10 45 A40 40 0 0 1 90 45" stroke="#243247" strokeWidth="10" fill="none" strokeLinecap="round" />
        <path d={`M10 45 A40 40 0 0 1 ${10 + 80 * (pct)} 45`} stroke="url(#g)" strokeWidth="10" fill="none" strokeLinecap="round" />
      </svg>
      <div className={`mt-1 text-lg font-semibold ${color}`}>{(pct*100).toFixed(0)}%</div>
      <div className="text-xs text-slate-400">Confidence</div>
    </div>
  )
}
