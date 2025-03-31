"use client"

import type React from "react"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { getChapterList, getChapterNumber, getChapterTitle } from "@/lib/api"
import { Calendar, RefreshCw, ChevronRight, Check, Eye } from "lucide-react"
import logger from "@/lib/logger"
import type { Chapter } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"
import { useUser } from "@clerk/nextjs"
import {
  getMangaReadingProgress,
  isChapterRead,
  markChapterAsRead,
  removeReadingProgress,
  type ReadingProgress,
} from "@/lib/reading-progress"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

export default function ChapterListWithProgress({
  mangaId,
}: {
  mangaId: string
}) {
  const { isSignedIn, isLoaded } = useUser()
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isForcingRefresh, setIsForcingRefresh] = useState(false)
  const [readingHistory, setReadingHistory] = useState<ReadingProgress[]>([])
  const [isLoadingReadingHistory, setIsLoadingReadingHistory] = useState(false)

  // Fetch chapters
  useEffect(() => {
    async function loadChapters() {
      try {
        setLoading(true)
        setError(null)
        setLoadingProgress(0)
        logger.info(`Loading chapters for manga ID: ${mangaId}`)

        const chapterList = await getChapterList(
          mangaId,
          (progress) => {
            setLoadingProgress(progress)
            // If we're past the first batch, show the "loading more" indicator
            if (progress > 0 && progress < 100) {
              setIsLoadingMore(true)
            }
          },
          isForcingRefresh, // Pass the force refresh flag
        )

        setChapters(chapterList)
        setLoading(false)
        setIsLoadingMore(false)
        setIsForcingRefresh(false) // Reset the force refresh flag
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error"
        logger.error(`Failed to load chapters for manga ID: ${mangaId}`, err)
        setError(`Failed to load chapters. ${errorMessage}`)
        setLoading(false)
        setIsLoadingMore(false)
        setIsForcingRefresh(false) // Reset the force refresh flag
      }
    }

    loadChapters()
  }, [mangaId, retryCount, isForcingRefresh])

  // Fetch reading history if user is signed in
  useEffect(() => {
    async function loadReadingHistory() {
      if (!isSignedIn || !isLoaded) return

      try {
        setIsLoadingReadingHistory(true)
        const history = await getMangaReadingProgress(mangaId)
        setReadingHistory(history)
      } catch (err) {
        logger.error(`Failed to load reading history for manga ID: ${mangaId}`, err)
      } finally {
        setIsLoadingReadingHistory(false)
      }
    }

    loadReadingHistory()
  }, [mangaId, isSignedIn, isLoaded])

  const handleRetry = () => {
    logger.info(`Retrying chapter load for manga ID: ${mangaId}`)
    setRetryCount((prev) => prev + 1)
  }

  const handleForceRefresh = () => {
    logger.info(`Force refreshing chapter list for manga ID: ${mangaId}`)
    setIsForcingRefresh(true)
  }

  const handleToggleReadStatus = async (chapter: Chapter, event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()

    if (!isSignedIn) return

    try {
      const isRead = isChapterRead(chapter.id, readingHistory)

      if (isRead) {
        // Remove from reading history
        const success = await removeReadingProgress(chapter.id)
        if (success) {
          setReadingHistory((prev) => prev.filter((item) => item.chapterId !== chapter.id))
        }
      } else {
        // Add to reading history
        const result = await markChapterAsRead(mangaId, chapter.id)
        if (result) {
          setReadingHistory((prev) => [...prev, result])
        }
      }
    } catch (err) {
      logger.error(`Failed to toggle read status for chapter ID: ${chapter.id}`, err)
    }
  }

  if (loading && !isLoadingMore) {
    return <ChapterListSkeleton />
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">{error}</p>
        <Button onClick={handleRetry} className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    )
  }

  if (chapters.length === 0 && !loading) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No chapters available</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Chapters ({chapters.length})</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={handleForceRefresh}
          disabled={loading || isLoadingMore}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isLoadingMore ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {isLoadingMore && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Loading more chapters...</span>
            <span className="text-sm text-muted-foreground">{loadingProgress}%</span>
          </div>
          <Progress value={loadingProgress} className="h-2" />
        </div>
      )}

      {chapters.map((chapter, index) => {
        const chapterNumber = getChapterNumber(chapter)
        const chapterTitle = getChapterTitle(chapter)
        const publishDate = new Date(chapter.attributes.publishAt).toLocaleDateString()
        const isRead = isSignedIn && isChapterRead(chapter.id, readingHistory)

        return (
          <div
            key={`${chapter.id}-${index}`}
            className={`flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors ${
              isRead ? "border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900" : ""
            }`}
          >
            <div className="flex-1">
              <Link href={`/manga/${mangaId}/chapter/${chapter.id}`} className="font-medium hover:underline">
                <span className="mr-2">Chapter {chapterNumber}</span>
                {chapterTitle}
              </Link>
            </div>
            <div className="flex items-center text-sm text-muted-foreground mr-4">
              <Calendar className="mr-1 h-4 w-4" />
              {publishDate}
            </div>
            <div className="flex items-center gap-2">
              {isSignedIn && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant={isRead ? "default" : "outline"}
                        className={`h-8 w-8 ${isRead ? "bg-green-500 hover:bg-green-600" : ""}`}
                        onClick={(e) => handleToggleReadStatus(chapter, e)}
                      >
                        {isRead ? <Check className="h-4 w-4 text-white" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{isRead ? "Mark as unread" : "Mark as read"}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              <Button size="sm" variant="ghost" asChild>
                <Link href={`/manga/${mangaId}/chapter/${chapter.id}`} className="flex items-center">
                  Read
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ChapterListSkeleton() {
  return (
    <div className="space-y-2">
      {Array(10)
        .fill(0)
        .map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
    </div>
  )
}

