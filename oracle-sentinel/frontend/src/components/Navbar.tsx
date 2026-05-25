import React from 'react'

export default function Navbar(){
  return (
    <header className="bg-[rgba(10,14,39,0.6)] backdrop-blur-md border-b border-[rgba(0,217,255,0.06)]">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-gradient-to-br from-apex to-sentinel flex items-center justify-center shadow-neon-lg">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 12h18" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M12 3v18" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div className="text-xl font-semibold">Oracle Sentinel</div>
            <div className="text-sm text-slate-300">Real-time oracle intelligence</div>
          </div>
        </div>
        <nav className="flex items-center gap-4">
          <button className="px-4 py-2 rounded-md bg-gradient-to-r from-apex to-[var(--color-apex)] text-void font-semibold">Connect</button>
          <button className="px-3 py-2 rounded-md border border-[rgba(255,255,255,0.06)] text-slate-200">Docs</button>
        </nav>
      </div>
    </header>
  )
}
