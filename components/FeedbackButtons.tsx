'use client'

import React from 'react'

const BUTTONS: { key: string; label: string; emoji: string; type: string }[] = [
  { key: 'agree', label: 'Agree', emoji: '👍', type: 'agree' },
  { key: 'confused', label: 'Confused', emoji: '❓', type: 'confused' },
  { key: 'repeat', label: 'Repeat', emoji: '🔁', type: 'repeat' },
  { key: 'interesting', label: 'Interesting', emoji: '🔥', type: 'interesting' },
]

export default function FeedbackButtons({ meetingId, userName, userEmail }: { meetingId: string; userName?: string; userEmail?: string }) {
  const send = async (type: string) => {
    try {
      await fetch('/api/feedback/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId, type, userName: userName || '', userEmail: userEmail || null }),
      })
      // small visual cue
      const el = document.createElement('div')
      el.textContent = 'Thanks'
      el.style.position = 'fixed'
      el.style.right = '12px'
      el.style.bottom = '12px'
      el.style.background = 'rgba(0,0,0,0.7)'
      el.style.color = 'white'
      el.style.padding = '6px 10px'
      el.style.borderRadius = '8px'
      document.body.appendChild(el)
      setTimeout(() => el.remove(), 900)
    } catch (err) {
      console.error('feedback send', err)
    }
  }

  return (
    <div className="absolute left-4 bottom-24 z-50 flex gap-2">
      {BUTTONS.map((b) => (
        <button key={b.key} onClick={() => send(b.type)} title={b.label} className="px-3 py-2 bg-zinc-900/90 dark:bg-zinc-800 rounded shadow">
          <span className="text-lg mr-2">{b.emoji}</span>
          <span className="text-sm hidden sm:inline">{b.label}</span>
        </button>
      ))}
    </div>
  )
}
