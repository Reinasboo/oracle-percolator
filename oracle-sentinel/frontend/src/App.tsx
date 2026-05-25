import React from 'react'
import Navbar from './components/Navbar'
import Dashboard from './components/Dashboard'

export default function App() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="p-6 max-w-7xl mx-auto">
        <Dashboard />
      </main>
    </div>
  )
}
