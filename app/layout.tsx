import type React from "react"
import type { Metadata } from "next"
import { ClerkProvider } from "@clerk/nextjs"
import { Inter } from "next/font/google"
import "./globals.css"
import UserNav from "@/components/user-nav"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Home, Search } from "lucide-react"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "MangaReader",
  description: "Read your favorite manga online",
  generator: "v0.dev",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ClerkProvider>
          <header className="border-b">
            <div className="container mx-auto px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-6">
                <Link href="/" className="text-xl font-bold">
                  MangaReader
                </Link>
                <nav className="hidden md:flex items-center gap-4">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/">
                      <Home className="h-4 w-4 mr-2" />
                      Home
                    </Link>
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/search">
                      <Search className="h-4 w-4 mr-2" />
                      Search
                    </Link>
                  </Button>
                </nav>
              </div>
              <UserNav />
            </div>
          </header>
          <main>{children}</main>
        </ClerkProvider>
      </body>
    </html>
  )
}

