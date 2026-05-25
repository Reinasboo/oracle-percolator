import React from 'react'
import Card from './Card'

export default function MetricCard({title, value, delta}:{title:string,value:string,delta?:string}){
  return (
    <Card className="flex flex-col gap-2">
      <div className="text-sm text-slate-300">{title}</div>
      <div className="flex items-baseline gap-3">
        <div className="text-2xl font-semibold">{value}</div>
        {delta && <div className="text-sm text-teal-300">{delta}</div>}
      </div>
    </Card>
  )
}
