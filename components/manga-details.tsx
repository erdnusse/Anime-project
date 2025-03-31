"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { BookOpen, Calendar, Clock, User, RefreshCw, Download, Bookmark, BookmarkCheck } from "lucide-react"
import { getMangaById, getCoverImageUrl, getTitle, getDescription, getAuthorName, getChapterList } from "@/lib/api"
import logger from "@/lib/logger"
import type { Manga, Chapter } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"
import DownloadProgressModal from "./download-progress-modal"
import { downloadManga, downloadZip, type DownloadProgress } from "@/lib/download-manager"
import LoginForm from "./login-form"
import authService from "@/lib/auth-service"
import { useUser } from "@clerk/nextjs"
import {
  addBookmark,
  removeBookmark,
  getBookmarks,
  isMangaBookmarked,
  type Bookmark as BookmarkType,
} from "@/lib/bookmarks"
import { getMangaReadingProgress, getLastReadChapter, type ReadingProgress } from "@/lib/reading-progress"
import Link from "next/link"

export default function MangaDetails({ id }: { id: string }) {
  const { isSignedIn } = useUser()
  const [manga, setManga] = useState<Manga | null>(null)
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  const [downloadedZip, setDownloadedZip] = useState<Blob | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [showLoginForm, setShowLoginForm] = useState(false)
  const [bookmarks, setBookmarks] = useState<BookmarkType[]>([])
  const [isBookmarked, setIsBookmarked] = useState(false)
  const [readingProgress, setReadingProgress] = useState<ReadingProgress[]>([])
  const [lastReadChapter, setLastReadChapter] = useState<ReadingProgress | null>(null)

  // Check authentication status on component mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = await authService.getSessionToken()
      setIsAuthenticated(!!token)
    }

    checkAuth()
  }, [])

  // Load manga details and user data
  useEffect(() => {
    async function loadMangaDetails() {
      try {
        setLoading(true)
        setError(null)
        logger.info(`Loading manga details for ID: ${id}`)

        // Load manga details and chapters in parallel
        const [mangaData, chapterList] = await Promise.all([getMangaById(id), getChapterList(id)])

        setManga(mangaData)
        setChapters(chapterList)
        setLoading(false)

        // If user is signed in, load bookmarks and reading progress
        if (isSignedIn) {
          try {
            const [bookmarksData, readingHistoryData] = await Promise.all([getBookmarks(), getMangaReadingProgress(id)])

            setBookmarks(bookmarksData)
            setReadingProgress(readingHistoryData)

            // Check if manga is bookmarked
            setIsBookmarked(isMangaBookmarked(id, bookmarksData))

            // Get last read chapter
            const lastRead = getLastReadChapter(readingHistoryData)
            setLastReadChapter(lastRead)
          } catch (err) {
            logger.error("Failed to load user data", err)
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error"
        logger.error(`Failed to load manga details for ID: ${id}`, err)
        setError(`Failed to load manga details. ${errorMessage}`)
        setLoading(false)
      }
    }

    loadMangaDetails()
  }, [id, retryCount, isSignedIn])

  const handleRetry = () => {
    logger.info(`Retrying manga details load for ID: ${id}`)
    setRetryCount((prev) => prev + 1)
  }

  const handleDownload = async () => {
    if (!manga || chapters.length === 0) return

    // Check if authenticated
    //if (!isAuthenticated) {
    // setShowLoginForm(true)
    // return
    // }

    const title = getTitle(manga)
    setIsDownloading(true)
    setDownloadProgress({
      mangaId: id,
      mangaTitle: title,
      totalChapters: chapters.length,
      completedChapters: 0,
      currentChapter: null,
      overallProgress: 0,
      isComplete: false,
      error: null,
    })

    try {
      await downloadManga({
        mangaId: id,
        mangaTitle: title,
        chapters,
        onProgress: (progress) => {
          setDownloadProgress(progress)
        },
        onComplete: (zipBlob) => {
          setDownloadedZip(zipBlob)
        },
        onError: (errorMessage) => {
          setDownloadProgress((prev) => (prev ? { ...prev, error: errorMessage } : null))
        },
      })
    } catch (error) {
      logger.error("Download failed", error)
      setDownloadProgress((prev) => (prev ? { ...prev, error: "Download failed. Please try again." } : null))
    }
  }

  const handleDownloadZip = () => {
    if (downloadedZip && manga) {
      const title = getTitle(manga)
      downloadZip(downloadedZip, title)
    }
  }

  const handleCancelDownload = () => {
    // In a real implementation, we would need to abort the fetch requests
    // For now, we'll just close the modal asd
    setIsDownloading(false)
    setDownloadProgress(null)
    setDownloadedZip(null)
  }

  const handleCloseDownloadModal = () => {
    setIsDownloading(false)
    setDownloadProgress(null)
  }

  // Update the handleLogin function to accept username and password
  const handleLogin = async (username: string, password: string, clientId: string, clientSecret: string) => {
    try {
      // First set the client credentials
      authService.setClientCredentials(clientId, clientSecret)

      // Then try to authenticate
      const token = await authService.authenticate(username, password)
      const success = !!token

      if (success) {
        setIsAuthenticated(true)
        setShowLoginForm(false)
        // Start download if authentication was triggered by download attempt
        if (!isDownloading) {
          handleDownload()
        }
      }

      return success
    } catch (error) {
      logger.error("Login failed", error)
      return false
    }
  }

  const handleToggleBookmark = async () => {
    if (!isSignedIn || !manga) return

    try {
      if (isBookmarked) {
        // Remove bookmark
        const success = await removeBookmark(id)
        if (success) {
          setIsBookmarked(false)
          setBookmarks((prev) => prev.filter((b) => b.mangaId !== id))
        }
      } else {
        // Add bookmark
        const result = await addBookmark(id)
        if (result) {
          setIsBookmarked(true)
          setBookmarks((prev) => [...prev, result])
        }
      }
    } catch (error) {
      logger.error("Failed to toggle bookmark", error)
    }
  }

  if (showLoginForm) {
    return <LoginForm onLogin={handleLogin} />
  }

  if (loading) {
    return <MangaDetailsSkeleton />
  }

  if (error || !manga) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">{error || "Failed to load manga details"}</p>
        <Button onClick={handleRetry} className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    )
  }

  const title = getTitle(manga)
  const description = getDescription(manga)
  const coverUrl = getCoverImageUrl(manga)
  const author = getAuthorName(manga)

  return (
    <>
      <div className="flex flex-col md:flex-row gap-6">
        <div className="shrink-0">
          <div className="relative h-[300px] w-[200px] overflow-hidden rounded-lg">
            <Image
              src={coverUrl || "/placeholder.svg?height=300&width=200"}
              alt={title}
              fill
              className="object-cover"
              sizes="200px"
              priority
              onError={(e) => {
                logger.error(`Failed to load cover image for manga ID: ${id}`)
                // @ts-ignore - currentTarget exists on the event
                e.currentTarget.src = "/placeholder.svg?height=300&width=200"
              }}
            />
          </div>
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold mb-2">{title}</h2>
          <div className="flex flex-wrap gap-2 mb-4">
            <div className="flex items-center text-sm text-muted-foreground">
              <User className="mr-1 h-4 w-4" />
              {author}
            </div>
            {manga.attributes.year && (
              <div className="flex items-center text-sm text-muted-foreground">
                <Calendar className="mr-1 h-4 w-4" />
                {manga.attributes.year}
              </div>
            )}
            <div className="flex items-center text-sm text-muted-foreground">
              <Clock className="mr-1 h-4 w-4" />
              {manga.attributes.status.charAt(0).toUpperCase() + manga.attributes.status.slice(1)}
            </div>
          </div>
          <div className="flex flex-wrap gap-1 mb-4">
            {manga.attributes.tags.map((tag) => (
              <Badge key={tag.id} variant="secondary">
                {tag.attributes.name.en}
              </Badge>
            ))}
          </div>
          <div className="prose dark:prose-invert mb-4">
            <p>{description}</p>
          </div>
          <div className="flex flex-wrap gap-3 mt-2">
            {lastReadChapter ? (
              <Button asChild>
                <Link href={`/manga/${id}/chapter/${lastReadChapter.chapterId}`}>
                  <BookOpen className="mr-2 h-4 w-4" />
                  Continue Reading
                </Link>
              </Button>
            ) : (
              <Button asChild>
                <Link href={`/manga/${id}/chapter/${chapters[0]?.id}`}>
                  <BookOpen className="mr-2 h-4 w-4" />
                  Start Reading
                </Link>
              </Button>
            )}
            {isSignedIn && (
              <Button
                variant={isBookmarked ? "default" : "outline"}
                onClick={handleToggleBookmark}
                className={isBookmarked ? "bg-blue-500 hover:bg-blue-600" : ""}
              >
                {isBookmarked ? (
                  <>
                    <BookmarkCheck className="mr-2 h-4 w-4" />
                    Bookmarked
                  </>
                ) : (
                  <>
                    <Bookmark className="mr-2 h-4 w-4" />
                    Bookmark
                  </>
                )}
              </Button>
            )}
            <Button variant="outline" onClick={handleDownload} disabled={isDownloading || chapters.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Download Manga
            </Button>
          </div>
          {chapters.length === 0 && !loading && (
            <p className="text-sm text-muted-foreground mt-2">No chapters available to download</p>
          )}
        </div>
      </div>

      <DownloadProgressModal
        isOpen={isDownloading}
        onClose={handleCloseDownloadModal}
        progress={downloadProgress}
        onCancel={handleCancelDownload}
        onDownloadZip={handleDownloadZip}
      />
    </>
  )
}

function MangaDetailsSkeleton() {
  return (
    <div className="flex flex-col md:flex-row gap-6">
      <Skeleton className="h-[300px] w-[200px] flex-shrink-0" />
      <div className="flex-1 space-y-4">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  )
}

