import React from 'react'

export default function Card({children, className}: {children: React.ReactNode, className?: string}){
  return (
    <div className={"p-4 rounded-xl bg-[var(--glass-bg)] border border-[var(--glass-border)] shadow-sm "+(className||"")}>{children}</div>
  )
}
