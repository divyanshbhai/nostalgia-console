import { NextResponse } from 'next/server'

export async function GET() {
  const manifest = {
    id: '/tv',
    name: 'Nostalgia Console TV',
    short_name: 'NC TV',
    description: 'Turn your TV into a multiplayer retro gaming console.',
    start_url: '/tv',
    scope: '/',
    display: 'standalone',
    orientation: 'landscape',
    background_color: '#0f0a1f',
    theme_color: '#7c3aed',
    icons: [
      {
        src: '/icons/tv-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icons/tv-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
    categories: ['games', 'entertainment'],
    prefer_related_applications: false,
  }

  return NextResponse.json(manifest, {
    headers: { 'Content-Type': 'application/manifest+json' },
  })
}
