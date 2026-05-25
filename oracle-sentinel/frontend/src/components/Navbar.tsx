import React from 'react'

export default function Navbar(){
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[rgba(4,7,16,0.7)] backdrop-blur-2xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 md:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-apex via-cyan-400 to-sentinel shadow-[0_14px_44px_rgba(56,221,251,0.26)] ring-1 ring-white/10">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 12h18" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M12 3v18" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div className="text-lg font-semibold tracking-tight text-white md:text-xl">Oracle Sentinel</div>
            <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Real-time oracle intelligence</div>
          </div>
        </div>
        <nav className="flex items-center gap-3">
          <button className="inline-flex h-10 items-center justify-center rounded-full border border-white/10 bg-white/6 px-4 text-sm font-medium text-slate-100 transition-colors duration-150 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-apex)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent">Connect</button>
          <button className="inline-flex h-10 items-center justify-center rounded-full bg-gradient-to-r from-[var(--color-apex)] via-cyan-300 to-[var(--color-sentinel)] px-4 text-sm font-semibold text-slate-950 shadow-[0_14px_34px_rgba(56,221,251,0.2)] transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-apex)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent">Docs</button>
        </nav>
      </div>
    </header>
  )
}
