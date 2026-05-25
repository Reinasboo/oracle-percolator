import React from 'react'

export default function AlertList({alerts}:{alerts:{id:string,severity:string,message:string}[]}){
  return (
    <div className="space-y-2">
      {alerts.length===0 && <div className="p-3 rounded-md bg-[rgba(0,0,0,0.2)] text-slate-400">No alerts</div>}
      {alerts.map(a=> (
        <div key={a.id} className={`p-3 rounded-md ${a.severity==='critical' ? 'bg-[rgba(255,0,110,0.08)] border-[rgba(255,0,110,0.12)]' : 'bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.03)]'}`}>
          <div className="text-sm font-semibold">{a.severity.toUpperCase()}</div>
          <div className="text-sm text-slate-300">{a.message}</div>
        </div>
      ))}
    </div>
  )
}
