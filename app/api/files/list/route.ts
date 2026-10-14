import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { MEETING_FILES_BUCKET, getMeetingStorageRoot } from '@/lib/meeting-storage'
import SharedFile from '@/models/SharedFile'
import dbConnect from '@/lib/db'

export const dynamic = 'force-dynamic'

async function legacyFiles(folder: string) {
  const files: Array<{ name: string; path: string }> = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabaseServer.storage.from(MEETING_FILES_BUCKET).list(folder, { limit: 1000, offset })
    if (error) throw new Error(error.message)
    for (const file of data || []) {
      if (file?.name && file.name !== '.emptyFolderPlaceholder') files.push({ name: file.name, path: `${folder}/${file.name}` })
    }
    if (!data || data.length < 1000) return files
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const scopeType = 'meeting' as const
    const scopeId = url.searchParams.get('scopeId') || url.searchParams.get('meetingId') || ''
    if (!scopeId) return NextResponse.json({ error: 'missing scopeId' }, { status: 400 })

    const folder = getMeetingStorageRoot(scopeType, scopeId)

    await dbConnect()
    const [localResult, legacyResult] = await Promise.allSettled([
      SharedFile.find({ meetingId: scopeId, ready: true }).sort({ createdAt: -1 }).lean(),
      legacyFiles(folder),
    ])
    if (localResult.status === 'rejected') throw localResult.reason
    const local = localResult.value
    return NextResponse.json({
      files: [...local.map(file => ({ name: file.name, path: file.path, size: file.size, uploadedAt: new Date(file.createdAt).getTime() })),
        ...(legacyResult.status === 'fulfilled' ? legacyResult.value : [])],
      ...(legacyResult.status === 'rejected' ? { warning: 'Older shared files are temporarily unavailable. Server files are still available.' } : {}),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (err: any) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
