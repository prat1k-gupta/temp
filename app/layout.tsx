import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/components/theme-provider'
import { Providers } from '@/components/providers'

export const metadata: Metadata = {
  title: 'Freestand Flow Builder',
  description: 'Build conversational experiences with Freestand',
  generator: 'Freestand',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans" style={{ fontFamily: 'Roboto, Arial, Helvetica, sans-serif' }}>
        <Providers>
          <ThemeProvider
            attribute="class"
            defaultTheme="light"
            enableSystem
            disableTransitionOnChange
          >
            {children}
            <Toaster />
            <Analytics />
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  )
}
