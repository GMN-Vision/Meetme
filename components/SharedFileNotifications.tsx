"use client"

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

type SharedItem = { name: string; path: string }

export default function SharedFileNotifications({ meetingId }: { meetingId: string }) {
  const [items, setItems] = useState<SharedItem[]>([])
  useEffect(() => {
    let cancelled = false
    let seen: Set<string> | null = null
    setItems([])
    const poll = async () => {
      try {
        const response = await fetch(`/api/files/list?meetingId=${encodeURIComponent(meetingId)}`, { cache: 'no-store' })
        if (!response.ok) return
        const data = await response.json()
        if (cancelled || !Array.isArray(data.files)) return
        const files: SharedItem[] = data.files
        if (seen) {
          const added = files.filter(file => !seen!.has(file.path))
          setItems(previous => [...added, ...previous].filter(file => files.some(current => current.path === file.path)).slice(0, 10))
        }
        if (!seen) seen = new Set()
        files.forEach(file => seen!.add(file.path))
      } catch { /* Keep notifications during temporary network outages. */ }
    }
    const tick = async () => { await poll(); if (!cancelled) timer = window.setTimeout(tick, 3000) }
    let timer: number
    void tick()
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [meetingId])

  if (!items.length || typeof document === 'undefined') return null
  // The centered navigation has a transform; portal to the body so this toast
  // stays anchored to the viewport instead of the navigation's bounds.
  return createPortal(<aside aria-label="Shared file notifications" className="fixed right-4 top-24 z-[1050] max-h-[min(20rem,calc(100dvh-7rem))] w-80 max-w-[calc(100vw-2rem)] overflow-auto rounded-xl border border-white/20 bg-zinc-900 p-3 text-white shadow-xl">
    <p role="status" className="mb-2 text-sm font-semibold">Someone shared {items.length === 1 ? 'a file' : `${items.length} files`}</p>
    {items.map(file => <div key={file.path} className="mb-3 text-sm">
      <p className="truncate">{file.name}</p>
      <div className="mt-1 flex gap-4">
        <a className="text-sky-300 underline" target="_blank" rel="noreferrer" href={`/api/files/download?path=${encodeURIComponent(file.path)}&preview=1`}>Open / watch</a>
        <a className="text-sky-300 underline" href={`/api/files/download?path=${encodeURIComponent(file.path)}`}>Download</a>
      </div>
    </div>)}
    <button className="text-xs text-zinc-300" onClick={() => setItems([])}>Dismiss notifications</button>
  </aside>, document.body)
}
