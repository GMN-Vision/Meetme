import { NextResponse } from 'next/server'
import { supabaseServer } from '../../../../lib/supabaseServer'
import { MEETING_FILES_BUCKET } from '../../../../lib/meeting-storage'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const path = url.searchParams.get('path') || ''
    if (!path) return NextResponse.json({ error: 'missing path' }, { status: 400 })

    const { data, error } = await supabaseServer.storage
      .from(MEETING_FILES_BUCKET)
      .createSignedUrl(path, 60 * 10)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ url: data?.signedUrl || '' })
  } catch (err: any) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
