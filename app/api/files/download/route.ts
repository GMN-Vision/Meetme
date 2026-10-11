import { NextResponse } from 'next/server'
import { supabaseServer } from '../../../../lib/supabaseServer'
import { MEETING_FILES_BUCKET } from '../../../../lib/meeting-storage'

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

    const { data, error } = await supabaseServer.storage
      .from(MEETING_FILES_BUCKET)
      .download(path)

    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'file not found' }, { status: 404 })
    }

    const arrayBuffer = await data.arrayBuffer()
    const fileName = getFileNameFromPath(path)

    return new Response(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': data.type || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 })
  }
}