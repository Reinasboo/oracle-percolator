import React from 'react'
import Navbar from './components/Navbar'
import Dashboard from './components/Dashboard'

export default function App() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(0,217,255,0.14),transparent_28%),radial-gradient(circle_at_top_right,rgba(124,58,237,0.16),transparent_30%),linear-gradient(180deg,#04060d_0%,#090d1d_46%,#050711_100%)] text-white">
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:72px_72px]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_50%_0%,rgba(56,221,251,0.14),transparent_55%)]" />
      <Navbar />
      <main className="relative mx-auto max-w-7xl px-4 py-6 md:px-6 lg:px-8">
        <Dashboard />
      </main>
    </div>
  )
}
