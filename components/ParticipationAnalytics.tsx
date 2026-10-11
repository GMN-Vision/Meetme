'use client'

import React, { useEffect, useState } from 'react'

type Speaker = { id: string; name: string; duration: number; percent: number }

export default function ParticipationAnalytics({ meetingId }: { meetingId: string }) {
  const [loading, setLoading] = useState(true)
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [total, setTotal] = useState<number>(0)

  useEffect(() => {
    const fetchAnalytics = async () => {
      setLoading(true)
      try {
        const resp = await fetch(`/api/analytics/participation/${encodeURIComponent(meetingId)}`)
        if (!resp.ok) return
        const body = await resp.json()
        setSpeakers(body.speakers || [])
        setTotal(body.totalDuration || 0)
      } catch (err) {
        console.error('fetch analytics', err)
      } finally {
        setLoading(false)
      }
    }

    if (meetingId) fetchAnalytics()
  }, [meetingId])

  if (loading) return <div className="text-sm text-zinc-400">Loading participation…</div>
  if (!speakers.length) return <div className="text-sm text-zinc-400">No participation data.</div>

  return (
    <div className="space-y-3">
      <div className="text-sm text-zinc-400">Total speaking time: {Math.round(total)}s</div>
      <div className="space-y-2">
        {speakers.map((s) => (
          <div key={s.id} className="flex items-center gap-3">
            <div className="w-28 text-sm font-medium">{s.name}</div>
            <div className="flex-1 bg-zinc-800 rounded h-4 overflow-hidden">
              <div style={{ width: `${s.percent}%` }} className="h-4 bg-zinc-700" />
            </div>
            <div className="w-12 text-right text-sm">{s.percent}%</div>
          </div>
        ))}
      </div>
    </div>
  )
}
