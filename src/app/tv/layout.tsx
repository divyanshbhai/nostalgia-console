import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Nostalgia Console TV',
  description: 'Turn your TV into a retro gaming console',
  manifest: '/tv/manifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Nostalgia TV' },
}

export const viewport: Viewport = {
  themeColor: '#7c3aed',
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
}

export default function TVLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
