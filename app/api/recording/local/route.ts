import { NextResponse } from 'next/server';
export async function POST() {
  return NextResponse.json({ error: 'Local recording has been removed. Use host-controlled server recording.' }, { status: 410 });
}
