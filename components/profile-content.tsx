"use client"

import { useState, useEffect } from "react"
import { useUser } from "@clerk/nextjs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { BookOpen, Calendar, Clock } from "lucide-react"
import { getMangaById, getTitle, getCoverImageUrl } from "@/lib/api"
import Image from "next/image"
import logger from "@/lib/logger"

export default function ProfileContent() {
  const { user, isLoaded, isSignedIn } = useUser()
  const [readingHistory, setReadingHistory] = useState<any[]>([])
  const [bookmarks, setBookmarks] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadUserData() {
      if (!isLoaded || !isSignedIn) return

      setIsLoading(true)
      try {
        // Fetch reading history
        const historyResponse = await fetch("/api/reading-progress")
        const historyData = await historyResponse.json()

        // Fetch bookmarks
        const bookmarksResponse = await fetch("/api/bookmarks")
        const bookmarksData = await bookmarksResponse.json()

        // Enhance reading history with manga details
        const enhancedHistory = await Promise.all(
          (historyData.readingHistory || []).slice(0, 10).map(async (item: any) => {
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

        // Enhance bookmarks with manga details
        const enhancedBookmarks = await Promise.all(
          (bookmarksData.bookmarks || []).slice(0, 10).map(async (item: any) => {
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

        setReadingHistory(enhancedHistory)
        setBookmarks(enhancedBookmarks)
      } catch (error) {
        logger.error("Failed to load user data", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadUserData()
  }, [isLoaded, isSignedIn])

  if (!isLoaded || !isSignedIn) {
    return (
      <div className="text-center py-12">
        <p>Please sign in to view your profile.</p>
      </div>
    )
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={user?.imageUrl} alt={user?.fullName || "User"} />
            <AvatarFallback>{user?.firstName?.charAt(0) || user?.username?.charAt(0) || "U"}</AvatarFallback>
          </Avatar>
          <div>
            <CardTitle>{user?.fullName || user?.username}</CardTitle>
            <CardDescription>{user?.primaryEmailAddress?.emailAddress}</CardDescription>
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="reading">
        <TabsList className="mb-4">
          <TabsTrigger value="reading">Reading History</TabsTrigger>
          <TabsTrigger value="bookmarks">Bookmarks</TabsTrigger>
        </TabsList>

        <TabsContent value="reading" className="space-y-4">
          <h2 className="text-xl font-semibold">Recent Reading</h2>
          {isLoading ? (
            <ReadingHistorySkeleton />
          ) : readingHistory.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {readingHistory.map((item) => (
                <Card key={item.id} className="overflow-hidden">
                  <CardContent className="p-0">
                    <Link href={`/manga/${item.mangaId}`} className="flex">
                      <div className="relative h-[120px] w-[80px] flex-shrink-0">
                        <Image
                          src={item.coverUrl || "/placeholder.svg"}
                          alt={item.title || "Manga cover"}
                          fill
                          className="object-cover"
                          sizes="80px"
                        />
                      </div>
                      <div className="p-4 flex-1">
                        <h3 className="font-medium line-clamp-1">{item.title || "Unknown Manga"}</h3>
                        <div className="flex items-center text-sm text-muted-foreground mt-1">
                          <Clock className="mr-1 h-4 w-4" />
                          {new Date(item.readAt).toLocaleDateString()}
                        </div>
                        <Button size="sm" variant="ghost" asChild className="mt-2">
                          <Link href={`/manga/${item.mangaId}/chapter/${item.chapterId}`}>
                            <BookOpen className="mr-1 h-4 w-4" />
                            Continue Reading
                          </Link>
                        </Button>
                      </div>
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No reading history yet.</p>
          )}

          {readingHistory.length > 0 && (
            <div className="text-center mt-4">
              <Button asChild variant="outline">
                <Link href="/reading-history">View All Reading History</Link>
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="bookmarks" className="space-y-4">
          <h2 className="text-xl font-semibold">Your Bookmarks</h2>
          {isLoading ? (
            <BookmarksSkeleton />
          ) : bookmarks.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {bookmarks.map((item) => (
                <Card key={item.id} className="overflow-hidden">
                  <CardContent className="p-0">
                    <Link href={`/manga/${item.mangaId}`} className="flex">
                      <div className="relative h-[120px] w-[80px] flex-shrink-0">
                        <Image
                          src={item.coverUrl || "/placeholder.svg"}
                          alt={item.title || "Manga cover"}
                          fill
                          className="object-cover"
                          sizes="80px"
                        />
                      </div>
                      <div className="p-4 flex-1">
                        <h3 className="font-medium line-clamp-1">{item.title || "Unknown Manga"}</h3>
                        <div className="flex items-center text-sm text-muted-foreground mt-1">
                          <Calendar className="mr-1 h-4 w-4" />
                          {new Date(item.createdAt).toLocaleDateString()}
                        </div>
                        <Button size="sm" variant="ghost" asChild className="mt-2">
                          <Link href={`/manga/${item.mangaId}`}>
                            <BookOpen className="mr-1 h-4 w-4" />
                            View Manga
                          </Link>
                        </Button>
                      </div>
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No bookmarks yet.</p>
          )}

          {bookmarks.length > 0 && (
            <div className="text-center mt-4">
              <Button asChild variant="outline">
                <Link href="/bookmarks">View All Bookmarks</Link>
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  )
}

function ReadingHistorySkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {Array(4)
        .fill(0)
        .map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <CardContent className="p-0 flex">
              <Skeleton className="h-[120px] w-[80px]" />
              <div className="p-4 flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-8 w-32 mt-2" />
              </div>
            </CardContent>
          </Card>
        ))}
    </div>
  )
}

function BookmarksSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {Array(4)
        .fill(0)
        .map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <CardContent className="p-0 flex">
              <Skeleton className="h-[120px] w-[80px]" />
              <div className="p-4 flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-8 w-32 mt-2" />
              </div>
            </CardContent>
          </Card>
        ))}
    </div>
  )
}

