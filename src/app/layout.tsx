import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/toaster'
import { ServiceWorkerRegistration } from '@/components/service-worker-registration'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Nostalgia Console — Retro Gaming on Any TV',
  description: 'Turn your TV into a multiplayer retro gaming console. Use your phone as the controller. No hardware required.',
  keywords: ['retro gaming', 'emulator', 'AirConsole', 'Android TV', 'phone controller', 'NES', 'SNES', 'GBA'],
  authors: [{ name: 'Nostalgia Console' }],
  icons: { icon: 'https://cdn-icons-png.flaticon.com/512/2780/2780137.png' },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Nostalgia Console',
  },
  openGraph: {
    title: 'Nostalgia Console',
    description: 'Turn your TV into a retro gaming console. Phone as controller.',
    type: 'website',
  },
}

// Next.js 16 viewport export — handles all viewport/theme-color meta correctly
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',      // enables safe-area-inset-* CSS variables
  themeColor: '#0f0a1f',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}>
        {children}
        <Toaster />
        <ServiceWorkerRegistration />
      </body>
    </html>
  )
}
