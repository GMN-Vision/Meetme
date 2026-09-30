'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { FileUpload } from './FileUpload'

interface MediaFile {
  name: string
  path: string
  uploadedAt: number
}

interface MeetingActivityItem {
  _id: string
  userName: string
  userEmail?: string
  type: string
  details?: string
  createdAt: string
}

interface NotificationItem {
  id: string
  message: string
}

export default function UploadMedia({
  meetingId,
  userEmail,
  className,
}: {
  meetingId: string
  userEmail?: string
  className?: string
}) {
  const [files, setFiles] = useState<MediaFile[]>([])
  const [downloadUrls, setDownloadUrls] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [recentActivity, setRecentActivity] = useState<MeetingActivityItem[]>([])

  const userLabel = useMemo(() => {
    if (!userEmail) return 'Someone'
    return userEmail.split('@')[0] || userEmail
  }, [userEmail])

  const pushNotice = (message: string) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    setNotifications((prev) => [{ id, message }, ...prev].slice(0, 3))
    window.setTimeout(() => {
      setNotifications((prev) => prev.filter((item) => item.id !== id))
    }, 4200)
  }

  const fetchFiles = async () => {
    if (!meetingId) return
    try {
      const res = await fetch(`/api/files/list?meetingId=${encodeURIComponent(meetingId)}&t=${Date.now()}`, {
        cache: 'no-store',
      })
      const data = await res.json()
      const filesList = (data.files || []).map((file: any) => ({
        name: file.name,
        path: file.path,
        uploadedAt: file.uploadedAt || Date.now(),
      }))
      setFiles(filesList)

      const urlPairs = await Promise.all(
        filesList.map(async (file: MediaFile) => {
          try {
            const response = await fetch(`/api/files/url?path=${encodeURIComponent(file.path)}&t=${Date.now()}`, {
              cache: 'no-store',
            })
            if (!response.ok) return [file.path, ''] as const
            const body = await response.json()
            return [file.path, body.url || ''] as const
          } catch {
            return [file.path, ''] as const
          }
        })
      )

      setDownloadUrls(Object.fromEntries(urlPairs))
    } catch (err) {
      console.error('[UploadMedia] fetchFiles error:', err)
    }
  }

  const fetchActivity = async () => {
    if (!meetingId) return
    try {
      const res = await fetch(`/api/meeting-activity?meetingId=${encodeURIComponent(meetingId)}`)
      const data = await res.json()
      const items = (data.activity || []).filter((item: MeetingActivityItem) => item.type === 'file_shared')
      setRecentActivity(items.slice(0, 5))
    } catch (err) {
      console.error('[UploadMedia] fetchActivity error:', err)
    }
  }

  useEffect(() => {
    fetchFiles()
    fetchActivity()

    const interval = window.setInterval(() => {
      fetchFiles()
      fetchActivity()
    }, 3500)

    return () => window.clearInterval(interval)
  }, [meetingId])

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0] || null
    if (file) {
      pushNotice(`Selected ${file.name}`)
    }
  }

  const handleFileUpload = async (uploadedFiles: File[]) => {
    if (uploadedFiles.length === 0 || !meetingId) {
      pushNotice('Pick a file first')
      return
    }

    const file = uploadedFiles[0]
    setUploading(true)
    const formData = new FormData()
    formData.append('meetingId', meetingId)
    formData.append('file', file)

    try {
      const res = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const errorMsg = body.error || 'Upload failed'
        pushNotice(errorMsg)
      } else {
        const body = await res.json().catch(() => ({}))
        const uploadedName = file.name
        pushNotice(`Shared media: ${uploadedName}`)

        await fetch('/api/meeting-activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            meetingId,
            type: 'file_shared',
            userName: userLabel,
            userEmail,
            details: uploadedName,
          }),
        }).catch(() => null)

        await Promise.all([fetchFiles(), fetchActivity()])

        if (body?.path) {
          console.log('[UploadMedia] uploaded:', body.path)
        }
      }
    } catch (err) {
      console.error('[UploadMedia] upload error:', err)
      pushNotice('Upload error. Try again.')
    }

    setUploading(false)
  }

  const handleDelete = async (path: string) => {
    try {
      const res = await fetch('/api/files/delete', {
        method: 'DELETE',
        body: JSON.stringify({ path }),
        headers: { 'Content-Type': 'application/json' },
      })
      if (res.ok) {
        pushNotice('Media removed')
        await fetchFiles()
      } else {
        pushNotice('Failed to remove media')
      }
    } catch (err) {
      console.error('[UploadMedia] delete error:', err)
    }
  }

  return (
    <div
      className={
        className ||
        'w-full rounded-[1.5rem] border border-slate-200 bg-white/95 p-4 text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.2)]'
      }
    >
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <p className="text-sm uppercase tracking-[0.26em] text-cyan-600">Upload Media</p>
          <h3 className="mt-1 font-display text-xl font-semibold text-slate-950">Share files with everyone</h3>
          <p className="mt-1 text-sm text-slate-500">Drop a file or browse from your device. Everyone in the room will see it.</p>
        </div>
        <span className="rounded-full bg-cyan-50 px-3 py-1 text-sm font-semibold text-cyan-700 ring-1 ring-cyan-200">
          {files.length} shared
        </span>
      </div>

      <div className="mb-4 space-y-2">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className="rounded-2xl border border-cyan-100 bg-cyan-50 px-3 py-2 text-sm text-cyan-900 shadow-sm animate-in fade-in slide-in-from-top-2"
          >
            {notification.message}
          </div>
        ))}
        {recentActivity.length > 0 && (
          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-900 shadow-sm animate-in fade-in">
            <span className="font-semibold">Room update:</span> {recentActivity[0].userName} shared{' '}
            {recentActivity[0].details || 'media'}
          </div>
        )}
      </div>

      <div className="mb-4">
        <FileUpload onChange={handleFileUpload} />
      </div>

      {files.length > 0 ? (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">Shared media</p>
            <p className="text-xs text-slate-500">Click to download</p>
          </div>
          <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {files.map((file) => {
              const fileName = file.name.split('/').pop() || file.name
              return (
                <li
                  key={file.path}
                  className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm transition hover:border-cyan-200 hover:bg-cyan-50/40"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <a
                    href={downloadUrls[file.path] || '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1 text-sm font-medium text-slate-900 truncate hover:text-cyan-700"
                  >
                    {fileName}
                  </a>
                  <div className="flex items-center gap-2">
                    <a
                      href={downloadUrls[file.path] || '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-200"
                    >
                      Download
                    </a>
                    <button
                      onClick={() => handleDelete(file.path)}
                      className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-600 transition hover:bg-red-100"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
          No shared media yet. The first upload will appear here for everyone in the room.
        </div>
      )}
    </div>
  )
}
