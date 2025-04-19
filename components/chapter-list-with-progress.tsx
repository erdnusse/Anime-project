"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { getChapterList, getChapterNumber, getChapterTitle } from "@/lib/api"
import {
  Calendar,
  RefreshCw,
  ChevronRight,
  Check,
  Eye,
  ChevronLeft,
  ChevronLeftIcon as ChevronDoubleLeft,
  ChevronRightIcon as ChevronDoubleRight,
} from "lucide-react"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ErrorDisplay } from "@/components/error-display"
import { NotFoundError, NetworkError, RateLimitError, TimeoutError, ServerError } from "@/lib/api-error"

export default function ChapterListWithProgress({
  mangaId,
}: {
  mangaId: string
}) {
  const { isSignedIn, isLoaded } = useUser()
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [isForcingRefresh, setIsForcingRefresh] = useState(false)
  const [readingHistory, setReadingHistory] = useState<ReadingProgress[]>([])
  const [isLoadingReadingHistory, setIsLoadingReadingHistory] = useState(false)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalChapters, setTotalChapters] = useState(0)
  const [chaptersPerPage, setChaptersPerPage] = useState(20)

  // Fix the useRef declarations with proper typing
  const pageRefs = useRef<(HTMLDivElement | null)[]>([])
  const observerRef = useRef<IntersectionObserver | null>(null)

  // Fetch chapters
  useEffect(() => {
    async function loadChapters() {
      try {
        setLoading(true)
        setError(null)
        setLoadingProgress(0)
        logger.info(`Loading chapters for manga ID: ${mangaId}, page: ${currentPage}, limit: ${chaptersPerPage}`)

        const offset = (currentPage - 1) * chaptersPerPage

        const chapterData = await getChapterList(mangaId, {
          limit: chaptersPerPage,
          offset: offset,
          progressCallback: (progress) => {
            setLoadingProgress(progress)
            // If we're loading, show the loading indicator
            if (progress > 0 && progress < 100) {
              setIsLoadingMore(true)
            }
          },
          forceFresh: isForcingRefresh,
        })

        setChapters(chapterData.chapters)
        setTotalChapters(chapterData.total)
        setTotalPages(chapterData.totalPages)
        setLoading(false)
        setIsLoadingMore(false)
        setIsForcingRefresh(false) // Reset the force refresh flag
      } catch (err) {
        logger.error(`Failed to load chapters for manga ID: ${mangaId}`, err)

        // Set appropriate error based on error type
        if (err instanceof NotFoundError) {
          setError(err)
        } else if (err instanceof NetworkError) {
          setError(err)
        } else if (err instanceof RateLimitError) {
          setError(err)
        } else if (err instanceof TimeoutError) {
          setError(err)
        } else if (err instanceof ServerError) {
          setError(err)
        } else {
          const errorMessage = err instanceof Error ? err.message : "Unknown error"
          setError(new Error(`Failed to load chapters. ${errorMessage}`))
        }

        setLoading(false)
        setIsLoadingMore(false)
        setIsForcingRefresh(false) // Reset the force refresh flag
      }
    }

    loadChapters()
  }, [mangaId, retryCount, isForcingRefresh, currentPage, chaptersPerPage])

  // Fetch reading history if user is signed in
  useEffect(() => {
    async function loadReadingHistory() {
      if (!isSignedIn || !isLoaded) return

      try {
        setIsLoadingReadingHistory(true)
        const history = await getMangaReadingProgress(mangaId)
        setReadingHistory(history)
      } catch (err) {
        logger.error(`Failed toload reading history for manga ID: ${mangaId}`, err)
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

  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages) return
    setCurrentPage(page)
    // Scroll to top of chapter list
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleChaptersPerPageChange = (value: string) => {
    const newChaptersPerPage = Number.parseInt(value)
    setChaptersPerPage(newChaptersPerPage)
    setCurrentPage(1) // Reset to first page when changing items per page
  }

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pageNumbers = []
    const maxPagesToShow = 5 // Show at most 5 page numbers

    let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2))
    const endPage = Math.min(totalPages, startPage + maxPagesToShow - 1)

    // Adjust if we're near the end
    if (endPage - startPage + 1 < maxPagesToShow) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1)
    }

    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i)
    }

    return pageNumbers
  }

  if (loading && !isLoadingMore) {
    return <ChapterListSkeleton />
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <ErrorDisplay
          error={error instanceof Error ? error : new Error(String(error))}
          onRetry={handleRetry}
          className="max-w-2xl mx-auto"
        />
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
        <h2 className="text-xl font-semibold">Chapters ({totalChapters})</h2>
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
            <span className="text-sm text-muted-foreground">Loading chapters...</span>
            <span className="text-sm text-muted-foreground">{loadingProgress}%</span>
          </div>
          <Progress value={loadingProgress} className="h-2" />
        </div>
      )}

      {/* Pagination controls - top */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-2 mb-4">
        <div className="text-sm text-muted-foreground">
          Showing {(currentPage - 1) * chaptersPerPage + 1}-{Math.min(currentPage * chaptersPerPage, totalChapters)} of{" "}
          {totalChapters} chapters
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground hidden sm:inline">Chapters per page:</span>
          <Select value={chaptersPerPage.toString()} onValueChange={handleChaptersPerPageChange}>
            <SelectTrigger className="w-[70px]">
              <SelectValue placeholder="20" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

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

      {/* Pagination controls - bottom */}
      {totalPages > 1 && (
        <div className="flex justify-center mt-6">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={() => handlePageChange(1)}
              disabled={currentPage === 1}
              className="h-8 w-8"
            >
              <ChevronDoubleLeft className="h-4 w-4" />
              <span className="sr-only">First page</span>
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="h-8 w-8"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="sr-only">Previous page</span>
            </Button>

            {getPageNumbers().map((pageNum) => (
              <Button
                key={pageNum}
                variant={currentPage === pageNum ? "default" : "outline"}
                size="sm"
                onClick={() => handlePageChange(pageNum)}
                className="h-8 w-8"
              >
                {pageNum}
              </Button>
            ))}

            <Button
              variant="outline"
              size="icon"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="h-8 w-8"
            >
              <ChevronRight className="h-4 w-4" />
              <span className="sr-only">Next page</span>
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={() => handlePageChange(totalPages)}
              disabled={currentPage === totalPages}
              className="h-8 w-8"
            >
              <ChevronDoubleRight className="h-4 w-4" />
              <span className="sr-only">Last page</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function ChapterListSkeleton() {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center mb-4">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-9 w-24" />
      </div>

      <Skeleton className="h-10 w-full mb-4" />

      {Array(5)
        .fill(0)
        .map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
    </div>
  )
}
