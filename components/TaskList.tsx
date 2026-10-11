'use client';

import React, { useEffect, useState } from 'react';

type Task = {
  _id: string;
  title: string;
  description?: string;
  ownerName?: string;
  ownerEmail?: string | null;
  status: 'open' | 'in_progress' | 'done';
  createdAt: string;
};

export default function TaskList({ meetingId }: { meetingId?: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const url = meetingId ? `/api/tasks/meeting/${encodeURIComponent(meetingId)}` : '/api/tasks/mine';
      const resp = await fetch(url);
      if (!resp.ok) return;
      const body = await resp.json();
      setTasks(body.tasks || []);
    } catch (err) {
      console.error('fetch tasks', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
    // poll once after 8s in case of background creation
    const t = setTimeout(fetchTasks, 8000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId]);

  const markDone = async (id: string) => {
    try {
      const resp = await fetch('/api/tasks/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'done' }),
      });
      if (resp.ok) fetchTasks();
    } catch (err) {
      console.error('mark done', err);
    }
  };

  if (loading) return <div className="text-sm text-zinc-400">Loading tasks…</div>;
  if (!tasks.length) return <div className="text-sm text-zinc-400">No tasks yet.</div>;

  return (
    <div className="space-y-2">
      {tasks.map((t) => (
        <div key={t._id} className="p-3 bg-zinc-900/60 dark:bg-zinc-800 border rounded-lg">
          <div className="flex justify-between items-start">
            <div>
              <div className="font-medium">{t.title}</div>
              <div className="text-xs text-zinc-400">{t.ownerName || t.ownerEmail || 'Unassigned'}</div>
            </div>
            <div className="text-sm text-zinc-400">{t.status}</div>
          </div>
          <div className="mt-2 flex gap-2">
            {t.status !== 'done' && (
              <button onClick={() => markDone(t._id)} className="px-2 py-1 bg-emerald-500 text-white rounded">Mark done</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
