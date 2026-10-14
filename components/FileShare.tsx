"use client"
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Upload, Trash2, FileText } from 'lucide-react'
import FileAllowance, { useFileAllowance } from './FileAllowance'
import { uploadSharedFile, formatFileBytes } from '@/lib/file-upload-client'

export default function FileShare({
  meetingId,
  scopeId,
  scopeType = 'meeting',
  title = 'Meeting Files',
  className,
}: {
  meetingId?: string
  scopeId?: string
  scopeType?: 'meeting'
  title?: string
  className?: string
}) {
  const [files, setFiles] = useState<Array<{ name: string; path: string }>>([])
  const [downloadUrls, setDownloadUrls] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const allowance = useFileAllowance()
  const [notice, setNotice] = useState('')
  const [loadingList, setLoadingList] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const resolvedScopeId = scopeId || meetingId || ''
  const isReady = useMemo(() => Boolean(resolvedScopeId), [resolvedScopeId])

  const fetchFiles = async () => {
    if (!resolvedScopeId) return
    setLoadingList(true)
    try {
      const res = await fetch(
        `/api/files/list?scopeType=${encodeURIComponent(scopeType)}&scopeId=${encodeURIComponent(resolvedScopeId)}&t=${Date.now()}`,
        { cache: 'no-store' }
      )
      const data = await res.json()
      setFiles(data.files || [])
      setDownloadUrls({})
    } catch (err) {
      console.error('fetchFiles', err)
      setNotice('Failed to refresh files')
    } finally {
      setLoadingList(false)
    }
  }

  useEffect(() => {
    fetchFiles()
    const interval = window.setInterval(() => {
      fetchFiles()
    }, 3000)
    return () => window.clearInterval(interval)
  }, [resolvedScopeId, scopeType])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) setSelected(e.target.files[0])
  }

  const handleUpload = async () => {
    if (!selected || !resolvedScopeId) {
      console.log('[FileShare] Missing selected or scopeId', { selected, resolvedScopeId })
      setNotice('Select a file first')
      return
    }
    if (!allowance.limits) { setNotice('Wait for your upload allowance to load'); return }
    if (selected.size > allowance.limits.availableFileBytes) {
      setNotice('You can send up to ' + formatFileBytes(allowance.limits.availableFileBytes) + ' with your current plan and storage')
      return
    }
    setUploading(true)
    setProgress(0)
    try {
      await uploadSharedFile(selected, resolvedScopeId, setProgress)
      setSelected(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setNotice('File shared with everyone in this room')
      await fetchFiles()
    } catch (err) {
      console.error('[FileShare] Upload error:', err)
      setNotice('Upload error: ' + String(err))
    }
    await allowance.refresh()
    setUploading(false)
  }

  const handleDelete = async (path: string) => {
    const res = await fetch('/api/files/delete', {
      method: 'DELETE',
      body: JSON.stringify({ path }),
      headers: { 'Content-Type': 'application/json' },
    })
    if (res.ok) {
      setNotice('File deleted')
      allowance.refresh()
      fetchFiles()
    } else {
      setNotice('Delete failed')
    }
  }

  const getDownloadHref = (path: string) => {
    const internal = `/api/files/download?path=${encodeURIComponent(path)}`
    return downloadUrls[path] || internal
  }

  return (
    <div className={className || 'rounded-2xl border border-zinc-800 bg-zinc-900 p-4'}>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-zinc-100">{title}</div>
        <div className="text-xs text-zinc-400">{loadingList ? 'Syncing...' : `${files.length} files`}</div>
      </div>

      {notice ? (
        <div className="mb-3 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-xs text-zinc-300">
          {notice}
        </div>
      ) : null}

      <FileAllowance allowance={allowance} />
      {selected && <p className="mb-2 text-xs text-zinc-400">Selected: {formatFileBytes(selected.size)}</p>}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input ref={fileInputRef} type="file" disabled={uploading} onChange={handleChange} className="block w-full text-sm text-zinc-100 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-xs file:font-medium file:text-zinc-100 hover:file:bg-zinc-800" />
        <button
          onClick={handleUpload}
          disabled={!selected || uploading || !isReady || !allowance.limits || selected.size > allowance.limits.availableFileBytes}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Upload className="h-4 w-4" />
          {uploading ? `Uploading ${progress}%` : 'Share'}
        </button>
      </div>

      <ul className="max-h-64 space-y-2 overflow-y-auto">
        {files.map((f) => (
          <li key={f.path} className="flex items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2">
            <div className="min-w-0 flex items-center gap-2">
              <FileText className="h-4 w-4 shrink-0 text-zinc-400" />
              <a href={getDownloadHref(f.path)} target="_blank" rel="noreferrer" className="truncate text-sm text-zinc-100 hover:text-zinc-300 hover:underline">
                {f.name.split('/').pop()}
              </a>
            </div>
            <div className="flex items-center gap-2">
              <a href={getDownloadHref(f.path)} target="_blank" rel="noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-800" title="Download">
                <Download className="h-4 w-4" />
              </a>
              <button onClick={() => handleDelete(f.path)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-700 hover:bg-rose-200" title="Delete">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {files.length === 0 ? (
        <div className="mt-3 rounded-lg border border-dashed border-zinc-800 bg-zinc-900 px-3 py-4 text-center text-xs text-zinc-400">
          No shared files yet. Upload once and everyone in this room can view/download here.
        </div>
      ) : null}
    </div>
  )
}
