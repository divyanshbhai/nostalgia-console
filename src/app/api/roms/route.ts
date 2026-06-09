import { NextResponse } from 'next/server'
import { getROMLibrary, getROMsByConsole, CONSOLE_META, type LibraryConsoleType } from '@/lib/rom-library'

export const dynamic = 'force-dynamic'

export async function GET() {
  const byConsole = getROMsByConsole()

  const consoles = (Object.keys(CONSOLE_META) as LibraryConsoleType[])
    .filter(c => byConsole.has(c))
    .map(c => ({
      type: c,
      meta: CONSOLE_META[c],
      count: byConsole.get(c)!.length,
      roms: byConsole.get(c)!.map(r => ({
        id: r.id,
        title: r.title,
        consoleType: r.consoleType,
        emulatorType: r.emulatorType,
        filename: r.filename,
        size: r.size,
      })),
    }))

  return NextResponse.json({
    total: getROMLibrary().length,
    consoles,
  }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
