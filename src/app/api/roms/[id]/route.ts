import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import { getROMById } from '@/lib/rom-library'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const rom = getROMById(id)

  if (!rom) {
    return NextResponse.json({ error: 'ROM not found' }, { status: 404 })
  }

  if (!fs.existsSync(rom.filepath)) {
    return NextResponse.json({ error: 'ROM file missing on disk' }, { status: 404 })
  }

  const buffer = fs.readFileSync(rom.filepath)

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(rom.filename)}"`,
      'Content-Length': String(buffer.byteLength),
      'Cache-Control': 'public, max-age=86400',
    },
  })
}
