import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/components/theme-provider'

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
      </body>
    </html>
  )
}
