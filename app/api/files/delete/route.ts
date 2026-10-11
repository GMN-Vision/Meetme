import { NextResponse } from 'next/server'
import { supabaseServer } from '../../../../lib/supabaseServer'
import { MEETING_FILES_BUCKET } from '../../../../lib/meeting-storage'

export async function DELETE(req: Request) {
  try {
    const body = await req.json()
    const { path } = body || {}
    if (!path) return NextResponse.json({ error: 'missing path' }, { status: 400 })

    const { error } = await supabaseServer.storage.from(MEETING_FILES_BUCKET).remove([path])
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
