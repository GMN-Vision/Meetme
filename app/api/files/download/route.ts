import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabaseServer'
import { MEETING_FILES_BUCKET } from '@/lib/meeting-storage'
import { localDownload } from '@/lib/server-file-storage'

export const runtime = 'nodejs'

function getFileNameFromPath(path: string) {
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] || 'download'
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const path = url.searchParams.get('path') || ''

    if (!path) {
      return NextResponse.json({ error: 'missing path' }, { status: 400 })
    }
    if (path.startsWith('local/')) return await localDownload(path, req)

    const { data, error } = await supabaseServer.storage
      .from(MEETING_FILES_BUCKET)
      .download(path)

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'file not found' }, { status: 404 })
    }

    const arrayBuffer = await data.arrayBuffer()
    const fileName = getFileNameFromPath(path)
    const mediaTypes: Record<string, string> = { mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf' }
    const mediaType = mediaTypes[fileName.split('.').pop()?.toLowerCase() || '']
    const preview = url.searchParams.get('preview') === '1' && mediaType

    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': preview ? mediaType : 'application/octet-stream',
        'Content-Disposition': `${preview ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(fileName).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16))}`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 })
  }
}
