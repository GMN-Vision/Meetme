import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { MEETING_FILES_BUCKET, getMeetingStorageRoot } from '@/lib/meeting-storage'
import SharedFile from '@/models/SharedFile'
import dbConnect from '@/lib/db'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const scopeType = 'meeting' as const
    const scopeId = url.searchParams.get('scopeId') || url.searchParams.get('meetingId') || ''
    if (!scopeId) return NextResponse.json({ error: 'missing scopeId' }, { status: 400 })

    const folder = getMeetingStorageRoot(scopeType, scopeId)

    const { data, error } = await supabaseServer.storage.from(MEETING_FILES_BUCKET).list(folder, { limit: 100 })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // list() returns names relative to the folder; attach full storage path for actions.
    const files = (data || [])
      .filter((f: any) => f && f.name)
      .map((f: any) => ({
        name: f.name,
        path: `${folder}/${f.name}`,
      }))

    await dbConnect()
    const local = await SharedFile.find({ meetingId: scopeId, ready: true }).sort({ createdAt: -1 }).lean()
    return NextResponse.json({ files: [...local.map(file => ({ name: file.name, path: file.path, size: file.size, uploadedAt: new Date(file.createdAt).getTime() })), ...files] })
  } catch (err: any) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
