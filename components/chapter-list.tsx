"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { getChapterList, getChapterNumber, getChapterTitle } from "@/lib/api"
import { Calendar, RefreshCw } from "lucide-react"
import logger from "@/lib/logger"
import type { Chapter } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import { Progress } from "@/components/ui/progress"

export default function ChapterList({ mangaId }: { mangaId: string }) {
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  useEffect(() => {
    async function loadChapters() {
      try {
        setLoading(true)
        setError(null)
        setLoadingProgress(0)
        logger.info(`Loading chapters for manga ID: ${mangaId}`)

        const chapterList = await getChapterList(mangaId, (progress) => {
          setLoadingProgress(progress)
          // If we're past the first batch, show the "loading more" indicator
          if (progress > 0 && progress < 100) {
            setIsLoadingMore(true)
          }
        })

        setChapters(chapterList)
        setLoading(false)
        setIsLoadingMore(false)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error"
        logger.error(`Failed to load chapters for manga ID: ${mangaId}`, err)
        setError(`Failed to load chapters. ${errorMessage}`)
        setLoading(false)
        setIsLoadingMore(false)
      }
    }

    loadChapters()
  }, [mangaId, retryCount])

  const handleRetry = () => {
    logger.info(`Retrying chapter load for manga ID: ${mangaId}`)
    setRetryCount((prev) => prev + 1)
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
      {isLoadingMore && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Loading more chapters...</span>
            <span className="text-sm text-muted-foreground">{loadingProgress}%</span>
          </div>
          <Progress value={loadingProgress} className="h-2" />
        </div>
      )}

      {chapters.map((chapter) => {
        const chapterNumber = getChapterNumber(chapter)
        const chapterTitle = getChapterTitle(chapter)
        const publishDate = new Date(chapter.attributes.publishAt).toLocaleDateString()

        return (
          <div
            key={chapter.id}
            className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
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
            <Button size="sm" variant="ghost" asChild>
              <Link href={`/manga/${mangaId}/chapter/${chapter.id}`}>Read</Link>
            </Button>
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

