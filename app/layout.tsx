import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import { ReactFlowProvider } from '@xyflow/react'

export const metadata: Metadata = {
  title: 'Magic Flow',
  description: 'Created with Magic Flow',
  generator: 'Magic Flow',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable}`}>
        <ReactFlowProvider>
          {children}
        </ReactFlowProvider>
        <Analytics />
      </body>
    </html>
  )
}
