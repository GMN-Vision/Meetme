import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { MEETING_FILES_BUCKET } from '@/lib/meeting-storage'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth-options'
import SharedFile from '@/models/SharedFile'
import dbConnect from '@/lib/db'
import { diskPath, withStorageLock } from '@/lib/server-file-storage'
import { unlink } from 'node:fs/promises'
import Meeting from '@/models/Meeting'

export async function DELETE(req: Request) {
  try {
    const body = await req.json()
    const { path } = body || {}
    if (!path) return NextResponse.json({ error: 'missing path' }, { status: 400 })
    if (path.startsWith('local/')) {
      const session = await getServerSession(authOptions)
      const email = String(session?.user?.email || '').toLowerCase()
      if (!email) return NextResponse.json({ error: 'Sign in to delete files' }, { status: 401 })
      await dbConnect()
      return await withStorageLock(path, async () => {
        const file = await SharedFile.findOne({ path })
        if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 })
        const host = await Meeting.exists({ meetingId: file.meetingId, hostEmail: email })
        if (file.ownerEmail !== email && !host && (session?.user as any)?.role !== 'admin') {
          return NextResponse.json({ error: 'Only the uploader or meeting host can delete this file' }, { status: 403 })
        }
        await unlink(diskPath(path)).catch(error => { if (error.code !== 'ENOENT') throw error })
        await SharedFile.deleteOne({ _id: file._id })
        return NextResponse.json({ ok: true })
      })
    }

    const { error } = await supabaseServer.storage.from(MEETING_FILES_BUCKET).remove([path])
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
