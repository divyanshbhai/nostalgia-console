import type { Metadata, Viewport } from 'next'

export const metadata: Metadata = {
  title: 'Nostalgia Controller',
  description: 'Use your phone as a retro gaming controller',
  manifest: '/controller/manifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Controller' },
}

export const viewport: Viewport = {
  themeColor: '#06b6d4',
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function ControllerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-page="controller"
      style={{ height: '100dvh', overflow: 'hidden', touchAction: 'none', overscrollBehavior: 'none' }}
    >
      {children}
    </div>
  )
}
