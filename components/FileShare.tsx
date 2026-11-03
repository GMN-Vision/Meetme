"use client"
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Upload, Trash2, FileText, Music2, Video, Image as ImageIcon, Presentation, ExternalLink } from 'lucide-react'
import FileAllowance, { useFileAllowance } from './FileAllowance'
import { uploadSharedFile, formatFileBytes } from '@/lib/file-upload-client'
import { JITSI_PRESENT_EVENT } from '@/lib/jitsi-features'
import { getPresentationKind, PREVIEW_TYPES, sharedFileExtension } from '@/lib/shared-file-types'

export default function FileShare({
  meetingId,
  scopeId,
  scopeType = 'meeting',
  title = 'Meeting Files',
  className,
  presentationEnabled = false,
  participantKey = '',
}: {
  meetingId?: string
  scopeId?: string
  scopeType?: 'meeting'
  title?: string
  className?: string
  presentationEnabled?: boolean
  participantKey?: string
}) {
  const [files, setFiles] = useState<Array<{ name: string; path: string }>>([])
  const [syncNotice, setSyncNotice] = useState('')
  const [selected, setSelected] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const allowance = useFileAllowance()
  const [notice, setNotice] = useState('')
  const [loadingList, setLoadingList] = useState(false)
  const [previewPath, setPreviewPath] = useState('')
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
      if (!res.ok) throw new Error(data.error || 'Failed to refresh files')
      setFiles(data.files || [])
      setSyncNotice(data.warning || '')
    } catch (err) {
      console.error('fetchFiles', err)
      setSyncNotice('Files could not be refreshed. Retrying automatically…')
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
    return `/api/files/download?path=${encodeURIComponent(path)}`
  }

  const previewFile = files.find(file => file.path === previewPath)
  const previewType = previewFile ? PREVIEW_TYPES[sharedFileExtension(previewFile.name)] : ''
  const previewUrl = previewFile ? `${getDownloadHref(previewFile.path)}&preview=1` : ''
  const officePreviewUrl = previewFile && meetingId && participantKey ? `/present?${new URLSearchParams({ path: previewFile.path, name: previewFile.name, meetingId, participantKey, embedded: '1' })}` : ''

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

      <details className="mb-2 text-xs text-zinc-400">
        <summary className="cursor-pointer py-1 hover:text-zinc-200">Upload allowance</summary>
        <FileAllowance allowance={allowance} />
      </details>
      {syncNotice && <p className="mb-3 text-xs text-amber-300" role="status">{syncNotice}</p>}
      {selected && <p className="mb-2 text-xs text-zinc-400">Selected: {formatFileBytes(selected.size)}</p>}
      <div className="mb-3 flex flex-col gap-2">
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

      <ul className="space-y-2" aria-label="Shared files">
        {files.map((f) => (
          <li key={f.path} className={`rounded-xl border p-2.5 ${previewPath === f.path ? 'border-sky-400/40 bg-sky-400/10' : 'border-white/10 bg-white/[.04]'}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex flex-1 items-center gap-2">
              {PREVIEW_TYPES[sharedFileExtension(f.name)]?.startsWith('audio/') ? <Music2 className="h-4 w-4 shrink-0 text-sky-300" /> : PREVIEW_TYPES[sharedFileExtension(f.name)]?.startsWith('video/') ? <Video className="h-4 w-4 shrink-0 text-sky-300" /> : PREVIEW_TYPES[sharedFileExtension(f.name)]?.startsWith('image/') ? <ImageIcon className="h-4 w-4 shrink-0 text-sky-300" /> : getPresentationKind(f.name) === 'slides' ? <Presentation className="h-4 w-4 shrink-0 text-sky-300" /> : <FileText className="h-4 w-4 shrink-0 text-sky-300" />}
              <button type="button" onClick={() => setPreviewPath(path => path === f.path ? '' : f.path)} className="min-w-0 truncate text-left text-sm text-zinc-100 hover:text-sky-200" aria-expanded={previewPath === f.path}>
                {f.name.split('/').pop()}
              </button>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {presentationEnabled && meetingId && getPresentationKind(f.name) && (
                <button type="button" onClick={() => {
                  const detail = { meetingId, path: f.path, name: f.name, message: '' }
                  const event = new CustomEvent(JITSI_PRESENT_EVENT, { cancelable: true, detail })
                  window.dispatchEvent(event)
                  setNotice(detail.message || (event.defaultPrevented ? 'Media sent to the Jitsi stage. Return to the meeting to control playback.' : 'Join the meeting before presenting this file.'))
                }} aria-label={`Present ${f.name} in meeting`} className="rounded-lg border border-zinc-700 px-2 py-1 text-xs text-zinc-100">Present</button>
              )}
              <a href={getDownloadHref(f.path)} target="_blank" rel="noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-800" title="Download">
                <Download className="h-4 w-4" />
              </a>
              <button onClick={() => handleDelete(f.path)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-700 hover:bg-rose-200" title="Delete">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          {previewPath === f.path && previewFile && <div className="mt-3 overflow-hidden rounded-lg border border-white/10 bg-black/30 p-2">
            {previewType?.startsWith('image/') ? <img src={previewUrl} alt={f.name} className="max-h-52 w-full rounded object-contain" /> :
              previewType?.startsWith('audio/') ? <audio key={previewUrl} src={previewUrl} controls preload="metadata" className="w-full" /> :
              previewType?.startsWith('video/') ? <video key={previewUrl} src={previewUrl} controls preload="metadata" className="max-h-52 w-full rounded bg-black" /> :
              previewType === 'application/pdf' ? <iframe src={previewUrl} title={`Preview ${f.name}`} className="h-64 w-full rounded bg-white" /> :
              officePreviewUrl && getPresentationKind(f.name) ? <iframe src={officePreviewUrl} title={`Preview ${f.name}`} className="h-64 w-full rounded bg-white" /> :
              <p className="px-2 py-3 text-xs text-zinc-400">Preview is unavailable for this format. Download the file to open it.</p>}
            <a href={getDownloadHref(f.path)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-sky-300 hover:text-sky-200"><ExternalLink className="h-3 w-3" /> Open or download</a>
          </div>}
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
