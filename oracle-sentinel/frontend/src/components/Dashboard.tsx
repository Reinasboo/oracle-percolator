import React, {useEffect, useState} from 'react'
import MetricCard from './MetricCard'
import ChartPlaceholder from './ChartPlaceholder'
import ConfidenceGauge from './ConfidenceGauge'
import FeedList from './FeedList'
import AlertList from './AlertList'
import { connectSocket, getSocket } from '../services/socket'

export default function Dashboard(){
  const [feeds, setFeeds] = useState<any[]>([
    {feed_id: 'SOL/USD', feed_name: 'SOL / USDC', price: 152.30, confidence: 0.92}
  ])
  const [confidence, setConfidence] = useState<number>(0.92)
  const [alerts, setAlerts] = useState<any[]>([])

  useEffect(()=>{
    const socket = connectSocket();

    socket.on('connect', ()=>{
      console.log('socket connected', socket.id)
    })

    socket.on('price_update', (data:any)=>{
      setFeeds((cur)=>{
        const existing = cur.find(f=>f.feed_id===data.feed_id)
        if(existing){
          return cur.map(f=> f.feed_id===data.feed_id ? {...f, price: data.price} : f)
        }
        return [{feed_id:data.feed_id, feed_name:data.feed_name, price: data.price, confidence: data.confidence || 0}, ...cur]
      })
    })

    socket.on('confidence_updated', (data:any)=>{
      setConfidence(data.confidence)
      setFeeds((cur)=> cur.map(f=> f.feed_id===data.feed_id ? {...f, confidence: data.confidence} : f))
    })

    socket.on('outage_warning', (data:any)=>{
      setAlerts((cur)=> [{id: data.feed_id+'-'+Date.now(), severity: 'warning', message: `Outage risk ${Math.round(data.probability*100)}%`}, ...cur].slice(0,10))
    })

    socket.on('connect_error', (err:any)=> console.warn('connect_error', err))

    return ()=>{
      const s = getSocket()
      s?.off('price_update')
      s?.off('confidence_updated')
      s?.off('outage_warning')
      s?.disconnect()
    }
  },[])

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <MetricCard title="SOL / USDC" value={`$${feeds[0]?.price?.toFixed(2) || '—'}`} delta={feeds[0]?.price ? '+0.8%' : undefined} />
          <div className="flex items-center justify-center">
            <ConfidenceGauge value={confidence} />
          </div>
          <MetricCard title="Outage Risk" value="2%" delta="Low" />
        </div>

        <div className="space-y-4">
          <ChartPlaceholder />
          <ChartPlaceholder />
        </div>
      </div>

      <aside className="space-y-4">
        <div className="sticky top-6">
          <div className="text-sm text-slate-300">Alerts</div>
          <div className="mt-2 space-y-2">
            <AlertList alerts={alerts} />
          </div>
          <div className="mt-6">
            <div className="text-sm text-slate-300 mb-2">Feeds</div>
            <FeedList feeds={feeds} />
          </div>
        </div>
      </aside>
    </div>
  )
}
