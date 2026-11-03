'use client'

import { useEffect, useState } from 'react'

type SharedItem = { path: string }

// Tracks new uploads for the Files button's unread badge. No toast is rendered.
export default function SharedFileNotifications({ meetingId, onUnreadChange }: {
  meetingId: string
  onUnreadChange?: (count: number) => void
}) {
  const [unread, setUnread] = useState<string[]>([])

  useEffect(() => { onUnreadChange?.(unread.length) }, [unread.length, onUnreadChange])

  useEffect(() => {
    const clearUnread = () => setUnread([])
    window.addEventListener('room:open-files', clearUnread)
    return () => window.removeEventListener('room:open-files', clearUnread)
  }, [])

  useEffect(() => {
    let cancelled = false
    let seen: Set<string> | null = null
    let timer: number
    setUnread([])

    const poll = async () => {
      try {
        const response = await fetch(`/api/files/list?meetingId=${encodeURIComponent(meetingId)}`, { cache: 'no-store' })
        if (!response.ok) return
        const data = await response.json()
        if (cancelled || !Array.isArray(data.files)) return
        const files: SharedItem[] = data.files
        if (seen) {
          const added = files.map(file => file.path).filter(path => !seen!.has(path))
          setUnread(previous => [...added, ...previous].filter(path => files.some(file => file.path === path)).slice(0, 10))
        } else {
          seen = new Set()
        }
        files.forEach(file => seen!.add(file.path))
      } catch { /* Retry after temporary network errors. */ }
    }

    const tick = async () => { await poll(); if (!cancelled) timer = window.setTimeout(tick, 3000) }
    void tick()
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [meetingId])

  return null
}
