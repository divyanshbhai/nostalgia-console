import { NextRequest, NextResponse } from 'next/server'
import { searchROMs } from '@/lib/rom-library'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q') ?? ''
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '50'), 100)

  const results = searchROMs(q, limit).map(r => ({
    id: r.id,
    title: r.title,
    consoleType: r.consoleType,
    emulatorType: r.emulatorType,
    filename: r.filename,
    size: r.size,
  }))

  return NextResponse.json({ results, query: q })
}
