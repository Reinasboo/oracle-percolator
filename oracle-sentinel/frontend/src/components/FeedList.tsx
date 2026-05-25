import React from 'react'

export default function FeedList({feeds}:{feeds:{feed_id:string,feed_name?:string,price?:number,confidence?:number}[]}){
  return (
    <div className="space-y-2">
      {feeds.map((f)=> (
        <div key={f.feed_id} className="p-3 rounded-md bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.03)] flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-300">{f.feed_name || f.feed_id}</div>
            <div className="text-lg font-semibold">{f.price !== undefined ? `$${f.price.toFixed(2)}` : '—'}</div>
          </div>
          <div className="text-right">
            <div className="text-sm text-slate-400">Confidence</div>
            <div className="font-mono">{f.confidence !== undefined ? (f.confidence*100).toFixed(0)+'%' : '—'}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
