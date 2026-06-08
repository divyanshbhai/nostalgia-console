import { NextResponse } from 'next/server'

export async function GET() {
  const manifest = {
    id: '/controller',
    name: 'Nostalgia Controller',
    short_name: 'NC Controller',
    description: 'Use your phone as a retro gaming controller. Connect to any TV.',
    start_url: '/controller',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0a1a1f',
    theme_color: '#06b6d4',
    icons: [
      {
        src: '/icons/controller-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icons/controller-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
    categories: ['games', 'utilities'],
    prefer_related_applications: false,
  }

  return NextResponse.json(manifest, {
    headers: { 'Content-Type': 'application/manifest+json' },
  })
}
