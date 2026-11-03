"use client"
import { useEffect, useMemo, useState } from 'react'
import { Download, Upload, Trash2, FileText, Music2, Video, Image as ImageIcon, Presentation, ExternalLink } from 'lucide-react'
import FileAllowance, { useFileAllowance } from './FileAllowance'
import { uploadSharedFile, formatFileBytes } from '@/lib/file-upload-client'
import { JITSI_PRESENT_EVENT } from '@/lib/jitsi-features'
import { getPresentationKind, PREVIEW_TYPES, sharedFileExtension } from '@/lib/shared-file-types'
import { HoverBorderGradient } from '@/components/ui/hover-border-gradient'
import { FileUpload } from '@/components/ui/file-upload'

export default function FileShare({
  meetingId,
  scopeId,
  scopeType = 'meeting',
  title = 'Meeting Files',
  className,
  presentationEnabled = false,
  participantKey = '',
  showHeader = true,
}: {
  meetingId?: string
  scopeId?: string
  scopeType?: 'meeting'
  title?: string
  className?: string
  presentationEnabled?: boolean
  participantKey?: string
  showHeader?: boolean
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
    <div className={className || 'rounded-3xl border border-zinc-700/70 bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-950 p-5'}>
      {showHeader && <div className="mb-5 flex items-start justify-between gap-3 border-b border-zinc-700/70 pb-4">
        <div className="min-w-0">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-zinc-100"><FileText className="h-5 w-5" /></span>
          <h2 className="text-base font-semibold tracking-tight text-white">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-400">Files and previews shared in this room.</p>
        </div>
        <span className="shrink-0 rounded-full border border-zinc-700 bg-zinc-950/60 px-2.5 py-1 text-xs text-zinc-300">{loadingList ? 'Syncing...' : `${files.length} files`}</span>
      </div>}

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
      <div className="mb-3 flex flex-col gap-2">
        <FileUpload compact value={selected} disabled={uploading} onChange={files => setSelected(files[0] || null)} />
        <HoverBorderGradient
          onClick={handleUpload}
          disabled={!selected || uploading || !isReady || !allowance.limits || selected.size > allowance.limits.availableFileBytes}
          className="w-full gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Upload className="h-4 w-4" />
          {uploading ? `Uploading ${progress}%` : 'Share'}
        </HoverBorderGradient>
      </div>

      <ul className="space-y-2" aria-label="Shared files">
        {files.map((f) => (
          <li key={f.path} className={`rounded-xl border p-2.5 transition-colors ${previewPath === f.path ? 'border-zinc-500 bg-zinc-800/70' : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-600 hover:bg-zinc-900/70'}`}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between xl:flex-col xl:items-stretch">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {PREVIEW_TYPES[sharedFileExtension(f.name)]?.startsWith('audio/') ? <Music2 className="h-4 w-4 shrink-0 text-sky-300" /> : PREVIEW_TYPES[sharedFileExtension(f.name)]?.startsWith('video/') ? <Video className="h-4 w-4 shrink-0 text-sky-300" /> : PREVIEW_TYPES[sharedFileExtension(f.name)]?.startsWith('image/') ? <ImageIcon className="h-4 w-4 shrink-0 text-sky-300" /> : getPresentationKind(f.name) === 'slides' ? <Presentation className="h-4 w-4 shrink-0 text-sky-300" /> : <FileText className="h-4 w-4 shrink-0 text-sky-300" />}
              <button type="button" onClick={() => setPreviewPath(path => path === f.path ? '' : f.path)} className="min-w-0 truncate text-left text-sm text-zinc-100 hover:text-white hover:underline" aria-expanded={previewPath === f.path}>
                {f.name.split('/').pop()}
              </button>
            </div>
            <div className="flex items-center justify-end gap-1.5 border-t border-zinc-800 pt-2 sm:shrink-0 sm:border-0 sm:pt-0 xl:border-t xl:pt-2">
              {presentationEnabled && meetingId && getPresentationKind(f.name) && (
                <button type="button" onClick={() => {
                  const detail = { meetingId, path: f.path, name: f.name, message: '' }
                  const event = new CustomEvent(JITSI_PRESENT_EVENT, { cancelable: true, detail })
                  window.dispatchEvent(event)
                  setNotice(detail.message || (event.defaultPrevented ? 'Media sent to the Jitsi stage. Return to the meeting to control playback.' : 'Join the meeting before presenting this file.'))
                }} aria-label={`Present ${f.name} in meeting`} className="min-h-10 rounded-lg border border-zinc-700 px-3 text-xs text-zinc-100 transition hover:bg-zinc-800 sm:min-h-8">Present</button>
              )}
              <a href={getDownloadHref(f.path)} target="_blank" rel="noreferrer" className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 sm:h-8 sm:w-8" title="Download" aria-label={`Download ${f.name}`}>
                <Download className="h-4 w-4" />
              </a>
              <button onClick={() => handleDelete(f.path)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-700 text-zinc-400 transition hover:border-rose-400/50 hover:bg-rose-500/10 hover:text-rose-300 sm:h-8 sm:w-8" title="Delete" aria-label={`Delete ${f.name}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          {previewPath === f.path && previewFile && <div className="mt-3 overflow-hidden rounded-lg border border-white/10 bg-black/30 p-2">
            {previewType?.startsWith('image/') ? <img src={previewUrl} alt={f.name} className="max-h-52 w-full rounded object-contain" /> :
              previewType?.startsWith('audio/') ? <audio key={previewUrl} src={previewUrl} controls preload="metadata" className="w-full" /> :
              previewType?.startsWith('video/') ? <video key={previewUrl} src={previewUrl} controls preload="metadata" className="max-h-52 w-full rounded bg-black" /> :
              previewType === 'application/pdf' ? <iframe src={previewUrl} title={`Preview ${f.name}`} className="h-48 w-full rounded bg-white sm:h-64" /> :
              officePreviewUrl && getPresentationKind(f.name) ? <iframe src={officePreviewUrl} title={`Preview ${f.name}`} className="h-48 w-full rounded bg-white sm:h-64" /> :
              <p className="px-2 py-3 text-xs text-zinc-400">Preview is unavailable for this format. Download the file to open it.</p>}
            <a href={getDownloadHref(f.path)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-sky-300 hover:text-sky-200"><ExternalLink className="h-3 w-3" /> Open or download</a>
          </div>}
          </li>
        ))}
      </ul>

    </div>
  )
}
