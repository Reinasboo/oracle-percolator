import React from 'react'

export default function Card({children, className}: {children: React.ReactNode, className?: string}){
  return (
    <div className={"rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg)] p-4 shadow-[var(--glass-shadow)] backdrop-blur-2xl "+(className||"")}>{children}</div>
  )
}
