'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { FileUpload } from './FileUpload'
import FileAllowance, { useFileAllowance } from './FileAllowance'
import { uploadSharedFile, formatFileBytes } from '@/lib/file-upload-client'

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
  const [progress, setProgress] = useState(0)
  const allowance = useFileAllowance()
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
    if (uploading) return
    if (!allowance.limits) { pushNotice('Wait for your upload allowance to load'); return }
    if (file.size > allowance.limits.availableFileBytes) {
      pushNotice('You can send up to ' + formatFileBytes(allowance.limits.availableFileBytes) + ' with your current plan and storage')
      return
    }
    setUploading(true)
    setProgress(0)
    try {
        const body = await uploadSharedFile(file, meetingId, setProgress)
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
    } catch (err) {
      console.error('[UploadMedia] upload error:', err)
      pushNotice(err instanceof Error ? err.message : 'Upload error. Try again.')
    }

    await allowance.refresh()
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
        allowance.refresh()
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
        'w-full rounded-[1.5rem] border border-zinc-800 bg-zinc-900/95 p-4 text-zinc-100 shadow-xl'
      }
    >
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-zinc-800 pb-4">
        <div>
          <p className="text-sm uppercase tracking-[0.26em] text-zinc-300">Upload Media</p>
          <h3 className="mt-1 font-display text-xl font-semibold text-zinc-100">Share files with everyone</h3>
          <p className="mt-1 text-sm text-zinc-400">Drop a file or browse from your device. Everyone in the room will see it.</p>
        </div>
        <span className="rounded-full bg-zinc-800 px-3 py-1 text-sm font-semibold text-zinc-300 ring-1 ring-zinc-600">
          {files.length} shared
        </span>
      </div>

      <FileAllowance allowance={allowance} />
      {uploading && <p className="mb-3 text-sm text-zinc-300" role="status">Uploading {progress}%</p>}
      <div className="mb-4 space-y-2">
        {notifications.map((notification) => (
          <div
            key={notification.id}
            className="rounded-2xl border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-300 shadow-sm animate-in fade-in slide-in-from-top-2"
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
            <p className="text-sm font-semibold text-zinc-100">Shared media</p>
            <p className="text-xs text-zinc-400">Click to download</p>
          </div>
          <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {files.map((file) => {
              const fileName = file.name.split('/').pop() || file.name
              return (
                <li
                  key={file.path}
                  className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 px-3 py-3 shadow-sm transition hover:border-zinc-600 hover:bg-zinc-800/40"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-800 text-zinc-300 ring-1 ring-zinc-600">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <a
                    href={downloadUrls[file.path] || '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1 text-sm font-medium text-zinc-100 truncate hover:text-zinc-300"
                  >
                    {fileName}
                  </a>
                  <div className="flex items-center gap-2">
                    <a
                      href={downloadUrls[file.path] || '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full bg-zinc-800 px-3 py-1 text-xs font-medium text-zinc-100 transition hover:bg-zinc-800"
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
        <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900 px-4 py-6 text-center text-sm text-zinc-400">
          No shared media yet. The first upload will appear here for everyone in the room.
        </div>
      )}
    </div>
  )
}
