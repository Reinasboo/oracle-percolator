import React from 'react'
import Card from './Card'

export default function MetricCard({title, value, delta}:{title:string,value:string,delta?:string}){
  return (
    <Card className="flex flex-col gap-2 rounded-[28px] border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-5 shadow-[0_12px_40px_rgba(0,0,0,0.18)]">
      <div className="text-xs uppercase tracking-[0.24em] text-slate-400">{title}</div>
      <div className="flex items-baseline gap-3">
        <div className="text-3xl font-semibold tracking-tight text-white">{value}</div>
        {delta && <div className="text-sm font-medium text-teal-300">{delta}</div>}
      </div>
    </Card>
  )
}
