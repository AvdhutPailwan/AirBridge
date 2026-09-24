import type { Metadata } from 'next';
import { Geist, Geist_Mono, Inter } from "next/font/google"
import Script from 'next/script';

import "@workspace/ui/globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@workspace/ui/lib/utils";

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: 'AirBridge | Fast, Secure & Free Peer-to-Peer File Sharing',
  description: 'Share large files, folders, and videos instantly between devices on the same network. AirBridge is a free, secure, peer-to-peer file transfer tool with no file size limits and no logins required.',
  keywords: 'file sharing, peer to peer, p2p, share files locally, fast file transfer, secure file share, AirDrop alternative, send large files, local network file transfer',
  openGraph: {
    title: 'AirBridge | Fast, Secure & Free Peer-to-Peer File Sharing',
    description: 'Share massive files instantly between devices on the same network with zero upload time. Free, secure, and no logins required.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AirBridge | Peer-to-Peer File Sharing',
    description: 'Share large files locally without the cloud.',
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontMono.variable, "font-sans", inter.variable)}
    >
      <head>
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
