import { NextResponse } from 'next/server'
import { supabaseServer } from '../../../../lib/supabaseServer'
import { MEETING_FILES_BUCKET, buildMeetingStoragePath } from '../../../../lib/meeting-storage'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../../lib/auth-options'
import { assertStorageCapacity, getWorkspaceQuota } from '../../../../lib/workspace-usage'

const UPLOAD_LIMITS: Record<string, number> = {
  free: 100 * 1024 * 1024,
  pro: 1024 * 1024 * 1024,
  business: 5 * 1024 * 1024 * 1024,
  enterprise: 10 * 1024 * 1024 * 1024,
}

export async function POST(req: Request) {
  try {
    console.log('[API/files/upload] Request received')
    const session = await getServerSession(authOptions)
    const userEmail = String(session?.user?.email || '').toLowerCase()
    const isAdmin = (session?.user as any)?.role === 'admin'
    if (!userEmail) {
      return NextResponse.json({ error: 'Sign in and select a plan to upload files' }, { status: 401 })
    }

    const formData = await req.formData()
    const scopeType = 'meeting' as const
    const scopeId = String(formData.get('scopeId') || formData.get('meetingId') || '')
    const file = formData.get('file') as File | null

    console.log('[API/files/upload] FormData parsed:', { scopeType, scopeId, hasFile: !!file, fileName: file?.name, fileSize: file?.size })

    if (!scopeId) {
      console.error('[API/files/upload] Missing scopeId')
      return NextResponse.json({ error: 'missing scopeId' }, { status: 400 })
    }
    if (!file) {
      console.error('[API/files/upload] Missing file')
      return NextResponse.json({ error: 'missing file' }, { status: 400 })
    }

    const workspaceQuota = await getWorkspaceQuota(userEmail, isAdmin)
    if (!workspaceQuota?.planDefinition.features.files) {
      return NextResponse.json({ error: 'File sharing requires Pro, Business, or Enterprise.', code: 'FEATURE_NOT_INCLUDED' }, { status: 402 })
    }

    const maxFileSize = UPLOAD_LIMITS[workspaceQuota.plan] || UPLOAD_LIMITS.free
    if (file.size > maxFileSize) {
      return NextResponse.json({ error: `file too large (max ${Math.round(maxFileSize / 1024 / 1024)}MB for this plan)` }, { status: 413 })
    }

    const storageCheck = await assertStorageCapacity(userEmail, file.size, isAdmin)
    if (!storageCheck.ok) {
      return NextResponse.json({ error: storageCheck.error, code: 'STORAGE_LIMIT_REACHED' }, { status: 402 })
    }

    const path = buildMeetingStoragePath(scopeType, scopeId, file.name)

    console.log('[API/files/upload] Uploading to Supabase:', { path, contentType: file.type, size: file.size })

    const arrayBuffer = await file.arrayBuffer()
    const fileBuffer = Buffer.from(arrayBuffer)

    const { data, error } = await supabaseServer.storage
      .from(MEETING_FILES_BUCKET)
      .upload(path, fileBuffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })

    if (error) {
      console.error('[API/files/upload] Supabase error:', error)
      return NextResponse.json({ error: error.message || 'upload failed' }, { status: 500 })
    }

    console.log('[API/files/upload] Upload successful:', data?.path || path)
    return NextResponse.json({ ok: true, path: data?.path || path, size: file.size, name: file.name })
  } catch (err: any) {
    console.error('[API/files/upload] Catch error:', String(err), err)
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 })
  }
}
