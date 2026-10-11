'use client'

import React, { useEffect, useState } from 'react'

type Poll = {
  _id: string;
  question: string;
  options: Array<{ id: string; label: string; votes: number }>;
  active: boolean;
}

export default function Polls({ meetingId }: { meetingId: string }) {
  const [polls, setPolls] = useState<Poll[]>([])
  const [creating, setCreating] = useState(false)
  const [q, setQ] = useState('')
  const [opts, setOpts] = useState('')

  const fetchPolls = async () => {
    try {
      const resp = await fetch(`/api/polls/meeting/${encodeURIComponent(meetingId)}`)
      if (!resp.ok) return
      const body = await resp.json()
      setPolls(body.polls || [])
    } catch (err) {
      console.error('fetch polls', err)
    }
  }

  useEffect(() => { if (meetingId) fetchPolls() }, [meetingId])

  const create = async () => {
    if (!q || !opts) return
    const options = opts.split('\n').map(s => s.trim()).filter(Boolean)
    try {
      const resp = await fetch('/api/polls/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ meetingId, question: q, options }) })
      if (resp.ok) {
        setQ(''); setOpts(''); setCreating(false); fetchPolls();
      }
    } catch (err) { console.error('create poll', err) }
  }

  const vote = async (pollId: string, optionId: string) => {
    try {
      const resp = await fetch('/api/polls/vote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pollId, optionId }) })
      if (resp.ok) fetchPolls()
    } catch (err) { console.error('vote', err) }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Polls</h4>
        <button onClick={() => setCreating(!creating)} className="text-sm text-zinc-300">{creating ? 'Cancel' : 'Create Poll'}</button>
      </div>

      {creating && (
        <div className="p-3 bg-zinc-900/60 rounded">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Question" className="w-full mb-2 p-2 border rounded" />
          <textarea value={opts} onChange={e => setOpts(e.target.value)} placeholder="One option per line" className="w-full p-2 border rounded mb-2" rows={4} />
          <div className="flex justify-end">
            <button onClick={create} className="px-3 py-1 bg-zinc-700 text-white rounded">Create</button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {polls.map(p => (
          <div key={p._id} className="p-2 bg-zinc-900/60 rounded">
            <div className="font-medium">{p.question}</div>
            <div className="mt-2 space-y-2">
              {p.options.map(o => (
                <div key={o.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <button onClick={() => vote(p._id, o.id)} className="px-2 py-1 bg-zinc-800 rounded">Vote</button>
                    <div>{o.label}</div>
                  </div>
                  <div className="text-sm">{o.votes}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
