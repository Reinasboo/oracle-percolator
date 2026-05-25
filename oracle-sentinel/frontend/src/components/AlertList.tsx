import React from 'react'

export default function AlertList({alerts}:{alerts:{id:string,severity:string,message:string}[]}){
  return (
    <div className="space-y-2">
      {alerts.length===0 && <div className="rounded-2xl border border-dashed border-white/10 bg-white/4 p-4 text-sm text-slate-400">No alerts yet. Feed anomalies will appear here.</div>}
      {alerts.map(a=> (
        <div key={a.id} className={`rounded-2xl border p-4 ${a.severity==='critical' ? 'border-[rgba(255,0,110,0.22)] bg-[rgba(255,0,110,0.1)]' : 'border-white/8 bg-white/4'}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs uppercase tracking-[0.24em] text-slate-400">{a.severity.toUpperCase()}</div>
            <div className="h-2 w-2 rounded-full bg-[var(--color-apex)]" />
          </div>
          <div className="mt-2 text-sm text-slate-200">{a.message}</div>
        </div>
      ))}
    </div>
  )
}
