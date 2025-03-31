"use client"

import { useState, useEffect } from "react"
import { useUser } from "@clerk/nextjs"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { BookOpen, Calendar, Trash2 } from "lucide-react"
import { getMangaById, getTitle, getCoverImageUrl } from "@/lib/api"
import { getBookmarks, removeBookmark } from "@/lib/bookmarks"
import Image from "next/image"
import logger from "@/lib/logger"

export default function BookmarksClient() {
  const { isLoaded, isSignedIn } = useUser()
  const [bookmarks, setBookmarks] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadBookmarks() {
      if (!isLoaded || !isSignedIn) return

      setIsLoading(true)
      try {
        // Fetch bookmarks
        const bookmarksData = await getBookmarks()

        // Enhance bookmarks with manga details
        const enhancedBookmarks = await Promise.all(
          bookmarksData.map(async (item: any) => {
            try {
              const manga = await getMangaById(item.mangaId)
              return {
                ...item,
                manga,
                title: getTitle(manga),
                coverUrl: getCoverImageUrl(manga),
              }
            } catch (error) {
              logger.error(`Failed to fetch manga details for ID: ${item.mangaId}`, error)
              return item
            }
          }),
        )

        setBookmarks(enhancedBookmarks)
      } catch (error) {
        logger.error("Failed to load bookmarks", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadBookmarks()
  }, [isLoaded, isSignedIn])

  const handleRemoveBookmark = async (mangaId: string) => {
    try {
      const success = await removeBookmark(mangaId)
      if (success) {
        setBookmarks((prev) => prev.filter((item) => item.mangaId !== mangaId))
      }
    } catch (error) {
      logger.error(`Failed to remove bookmark for manga ID: ${mangaId}`, error)
    }
  }

  if (!isLoaded || !isSignedIn) {
    return (
      <div className="text-center py-12">
        <p>Please sign in to view your bookmarks.</p>
      </div>
    )
  }

  return (
    <>
      {isLoading ? (
        <BookmarksSkeleton />
      ) : bookmarks.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {bookmarks.map((item) => (
            <Card key={item.id} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="flex">
                  <Link href={`/manga/${item.mangaId}`} className="relative h-[150px] w-[100px] flex-shrink-0">
                    <Image
                      src={item.coverUrl || "/placeholder.svg"}
                      alt={item.title || "Manga cover"}
                      fill
                      className="object-cover"
                      sizes="100px"
                    />
                  </Link>
                  <div className="p-4 flex-1">
                    <Link href={`/manga/${item.mangaId}`} className="hover:underline">
                      <h3 className="font-medium line-clamp-1">{item.title || "Unknown Manga"}</h3>
                    </Link>
                    <div className="flex items-center text-sm text-muted-foreground mt-1">
                      <Calendar className="mr-1 h-4 w-4" />
                      {new Date(item.createdAt).toLocaleDateString()}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <Button size="sm" variant="ghost" asChild>
                        <Link href={`/manga/${item.mangaId}`}>
                          <BookOpen className="mr-1 h-4 w-4" />
                          Read
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-500 hover:text-red-700 hover:bg-red-100"
                        onClick={() => handleRemoveBookmark(item.mangaId)}
                      >
                        <Trash2 className="mr-1 h-4 w-4" />
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">You haven't bookmarked any manga yet.</p>
          <Button asChild>
            <Link href="/">Browse Manga</Link>
          </Button>
        </div>
      )}
    </>
  )
}

function BookmarksSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array(6)
        .fill(0)
        .map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <CardContent className="p-0 flex">
              <Skeleton className="h-[150px] w-[100px]" />
              <div className="p-4 flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <div className="flex gap-2 mt-2">
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="h-8 w-20" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
    </div>
  )
}

