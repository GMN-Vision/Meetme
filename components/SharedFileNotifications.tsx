"use client"

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, ExternalLink, FileText, X } from 'lucide-react'

type SharedItem = { name: string; path: string }

export default function SharedFileNotifications({ meetingId, filesOpen = false, onUnreadChange }: {
  meetingId: string
  filesOpen?: boolean
  onUnreadChange?: (count: number) => void
}) {
  const [items, setItems] = useState<SharedItem[]>([])
  const [dismissed, setDismissed] = useState(false)
  const filesOpenRef = useRef(filesOpen)
  filesOpenRef.current = filesOpen
  useEffect(() => { if (filesOpen) setItems([]) }, [filesOpen])
  useEffect(() => { onUnreadChange?.(items.length) }, [items.length, onUnreadChange])
  useEffect(() => {
    let cancelled = false
    let seen: Set<string> | null = null
    setItems([])
    setDismissed(false)
    const poll = async () => {
      try {
        const response = await fetch(`/api/files/list?meetingId=${encodeURIComponent(meetingId)}`, { cache: 'no-store' })
        if (!response.ok) return
        const data = await response.json()
        if (cancelled || !Array.isArray(data.files)) return
        const files: SharedItem[] = data.files
        if (seen) {
          const added = files.filter(file => !seen!.has(file.path))
          if (!filesOpenRef.current) {
            setItems(previous => [...added, ...previous].filter(file => files.some(current => current.path === file.path)).slice(0, 10))
            if (added.length) setDismissed(false)
          }
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

  if (!items.length || dismissed || typeof document === 'undefined') return null
  // The centered navigation has a transform; portal to the body so this toast
  // stays anchored to the viewport instead of the navigation's bounds.
  return createPortal(<aside aria-label="Shared file notifications" className="fixed right-4 top-24 z-[1050] w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950 text-white shadow-2xl">
    <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400"><FileText size={18} aria-hidden="true" /></span>
      <div className="min-w-0 flex-1"><p role="status" className="text-sm font-semibold">New shared {items.length === 1 ? 'file' : 'files'}</p><p className="mt-0.5 text-xs text-zinc-400">{items.length} unread · Available in Files</p></div>
      <button type="button" aria-label="Dismiss file notifications" onClick={() => setDismissed(true)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"><X size={16} aria-hidden="true" /></button>
    </div>
    <div className="max-h-[min(12rem,calc(100dvh-13rem))] overflow-y-auto p-2">
      {items.map(file => <div key={file.path} className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-zinc-900">
        <div className="min-w-0 flex-1"><p className="truncate text-sm" title={file.name}>{file.name}</p><p className="mt-0.5 text-[10px] uppercase tracking-wider text-zinc-500">{file.name.split('.').pop()} file</p></div>
        <a className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white focus-visible:ring-2 focus-visible:ring-emerald-400" aria-label={`Open ${file.name}`} title="Open file" target="_blank" rel="noreferrer" href={`/api/files/download?path=${encodeURIComponent(file.path)}&preview=1`}><ExternalLink size={15} /></a>
        <a className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white focus-visible:ring-2 focus-visible:ring-emerald-400" aria-label={`Download ${file.name}`} title="Download file" href={`/api/files/download?path=${encodeURIComponent(file.path)}`}><Download size={15} /></a>
      </div>)}
    </div>
  </aside>, document.body)
}
