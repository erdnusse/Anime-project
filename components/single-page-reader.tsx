"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Image from "next/image"
import { Skeleton } from "@/components/ui/skeleton"
import { getChapterPages, getChapterById, getChapterTitle, getAdjacentChapters } from "@/lib/api"
import logger from "@/lib/logger"
import { Button } from "@/components/ui/button"
import {
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Settings,
  Check,
  List,
  ArrowLeft,
  Maximize,
  Minimize,
} from "lucide-react"
import { useUser } from "@clerk/nextjs"
import { markChapterAsRead } from "@/lib/reading-progress"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useHotkeys } from "react-hotkeys-hook"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface SinglePageReaderProps {
  mangaId: string
  chapterId: string
}

export default function SinglePageReader({ mangaId, chapterId }: SinglePageReaderProps) {
  const router = useRouter()
  const { isSignedIn } = useUser()
  const [title, setTitle] = useState<string>("")
  const [pages, setPages] = useState<string[]>([])
  const [baseUrl, setBaseUrl] = useState<string>("")
  const [hash, setHash] = useState<string>("")
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState<number>(0)

  // Page navigation state
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0)
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false)
  const [showControls, setShowControls] = useState<boolean>(true)
  const [showSidebar, setShowSidebar] = useState<boolean>(false)
  const [hasMarkedAsRead, setHasMarkedAsRead] = useState<boolean>(false)

  // Preloading state
  const [preloadedImages, setPreloadedImages] = useState<Record<number, boolean>>({})
  const [preloadQueue, setPreloadQueue] = useState<number[]>([])

  // Adjacent chapters
  const [prevChapter, setPrevChapter] = useState<string | null>(null)
  const [nextChapter, setNextChapter] = useState<string | null>(null)

  // Refs
  const readerContainerRef = useRef<HTMLDivElement>(null)
  const currentImageRef = useRef<HTMLImageElement>(null)
  const mouseIdleTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Reader settings
  const [readerMode, setReaderMode] = useState<"fit-width" | "fit-height" | "original">("fit-width")

  // Function to get proxied image URL
  const getProxiedImageUrl = useCallback(
    (page: string) => {
      try {
        // Construct the URL according to MangaDex's format
        const originalUrl = `${baseUrl}/data/${hash}/${page}`
        return `/api/manga-image?url=${encodeURIComponent(originalUrl)}`
      } catch (error) {
        logger.error(`Error creating proxied URL for page: ${page}`, error)
        return "/placeholder.svg"
      }
    },
    [baseUrl, hash],
  )

  // Fetch chapter data
  useEffect(() => {
    async function loadChapter() {
      try {
        setLoading(true)
        setError(null)
        setCurrentPageIndex(0)
        setPreloadedImages({})
        setPreloadQueue([])
        setHasMarkedAsRead(false)

        // Validate chapter ID
        if (!chapterId) {
          logger.error("Chapter ID is missing or invalid")
          setError("Chapter ID is missing or invalid")
          setLoading(false)
          return
        }

        logger.info(`Loading chapter: ${chapterId} for manga: ${mangaId}`)

        // Get chapter info and pages in parallel
        const [chapter, chapterData, adjacentChapters] = await Promise.all([
          getChapterById(chapterId),
          getChapterPages(chapterId),
          getAdjacentChapters(mangaId, chapterId),
        ])

        setTitle(getChapterTitle(chapter))
        setBaseUrl(chapterData.baseUrl)
        setHash(chapterData.chapter.hash)

        logger.info(`Chapter data loaded with ${chapterData.chapter.data.length} pages`)
        logger.info(`Base URL: ${chapterData.baseUrl}, Hash: ${chapterData.chapter.hash}`)

        if (chapterData.chapter.data.length === 0) {
          logger.error("No pages found in chapter data")
          setError("No pages found for this chapter")
          setLoading(false)
          return
        }

        setPages(chapterData.chapter.data)

        // Set adjacent chapters
        setPrevChapter(adjacentChapters.prev?.id || null)
        setNextChapter(adjacentChapters.next?.id || null)

        logger.info(
          `Adjacent chapters: prev=${adjacentChapters.prev?.id || "none"}, next=${adjacentChapters.next?.id || "none"}`,
        )

        setLoading(false)

        // Initialize preload queue with first few pages
        const initialPreloadQueue = Array.from({ length: Math.min(5, chapterData.chapter.data.length) }, (_, i) => i)
        setPreloadQueue(initialPreloadQueue)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error"
        logger.error(`Failed to load chapter: ${chapterId}`, err)
        setError(`Failed to load chapter. ${errorMessage}`)
        setLoading(false)
      }
    }

    loadChapter()
  }, [chapterId, retryCount, mangaId])

  // Preload images in queue
  useEffect(() => {
    if (loading || pages.length === 0 || !baseUrl || !hash || preloadQueue.length === 0) return

    const preloadNextImage = () => {
      const nextPageIndex = preloadQueue[0]

      // Skip if already preloaded or out of bounds
      if (preloadedImages[nextPageIndex] || nextPageIndex >= pages.length || nextPageIndex < 0) {
        setPreloadQueue((prev) => prev.slice(1))
        return
      }

      const page = pages[nextPageIndex]
      const imageUrl = getProxiedImageUrl(page)

      logger.debug(`Preloading image ${nextPageIndex + 1}/${pages.length}`)

      // Use window.Image to avoid conflict with next/image
      const img = new window.Image()
      img.src = imageUrl
      img.onload = () => {
        setPreloadedImages((prev) => ({ ...prev, [nextPageIndex]: true }))
        setPreloadQueue((prev) => prev.slice(1))
      }
      img.onerror = () => {
        logger.error(`Failed to preload image ${nextPageIndex + 1}/${pages.length}`)
        setPreloadQueue((prev) => prev.slice(1))
      }
    }

    preloadNextImage()
  }, [preloadQueue, preloadedImages, pages, baseUrl, hash, loading, getProxiedImageUrl])

  // Update preload queue when current page changes
  useEffect(() => {
    if (loading || pages.length === 0) return

    // Preload next 3 pages after current page
    const newPagesToPreload: number[] = []
    for (let i = 1; i <= 3; i++) {
      const pageIndex = currentPageIndex + i
      if (pageIndex < pages.length && !preloadedImages[pageIndex]) {
        newPagesToPreload.push(pageIndex)
      }
    }

    if (newPagesToPreload.length > 0) {
      setPreloadQueue((prev) => [...new Set([...prev, ...newPagesToPreload])])
    }

    // Check if we're at the end of the chapter
    if (currentPageIndex === pages.length - 1 && !hasMarkedAsRead && isSignedIn) {
      markChapterAsRead(mangaId, chapterId).then(() => {
        setHasMarkedAsRead(true)
        logger.info(`Marked chapter ${chapterId} as read automatically`)
      })
    }
  }, [currentPageIndex, pages.length, preloadedImages, loading, mangaId, chapterId, hasMarkedAsRead, isSignedIn])

  // Handle mouse movement to show/hide controls
  useEffect(() => {
    const handleMouseMove = () => {
      setShowControls(true)

      if (mouseIdleTimerRef.current) {
        clearTimeout(mouseIdleTimerRef.current)
      }

      mouseIdleTimerRef.current = setTimeout(() => {
        if (!showSidebar) {
          setShowControls(false)
        }
      }, 3000)
    }

    window.addEventListener("mousemove", handleMouseMove)

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      if (mouseIdleTimerRef.current) {
        clearTimeout(mouseIdleTimerRef.current)
      }
    }
  }, [showSidebar])

  // Keyboard navigation
  useHotkeys("left", () => navigatePage(-1), [currentPageIndex])
  useHotkeys("right", () => navigatePage(1), [currentPageIndex, pages.length])
  useHotkeys("f", toggleFullscreen, [isFullscreen])

  // Navigation functions
  const navigatePage = useCallback(
    (direction: number) => {
      logger.info(
        `Navigating page: direction=${direction}, currentIndex=${currentPageIndex}, totalPages=${pages.length}`,
      )

      if (direction < 0 && currentPageIndex === 0) {
        // If at first page and trying to go back, go to previous chapter if available
        if (prevChapter) {
          logger.info(`Navigating to previous chapter: ${prevChapter}`)
          router.push(`/manga/${mangaId}/chapter/${prevChapter}`)
        }
        return
      }

      if (direction > 0 && currentPageIndex >= pages.length - 1) {
        // If at last page and trying to go forward, go to next chapter if available
        if (nextChapter) {
          logger.info(`Navigating to next chapter: ${nextChapter}`)
          router.push(`/manga/${mangaId}/chapter/${nextChapter}`)
        }
        return
      }

      // Otherwise, just update the current page index
      const newIndex = currentPageIndex + direction
      logger.info(`Setting new page index: ${newIndex}`)
      setCurrentPageIndex(newIndex)
    },
    [currentPageIndex, pages.length, prevChapter, nextChapter, mangaId, router],
  )

  // Toggle fullscreen
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      readerContainerRef.current?.requestFullscreen().catch((err) => {
        logger.error("Error attempting to enable fullscreen", err)
      })
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  // Handle fullscreen change event
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange)

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange)
    }
  }, [])

  const handleRetry = () => {
    logger.info(`Retrying chapter load: ${chapterId}`)
    setRetryCount((prev) => prev + 1)
  }

  const handleMarkAsRead = async () => {
    if (!isSignedIn) return

    try {
      await markChapterAsRead(mangaId, chapterId)
      setHasMarkedAsRead(true)
      logger.info(`Manually marked chapter ${chapterId} as read`)
    } catch (error) {
      logger.error(`Failed to mark chapter as read: ${chapterId}`, error)
    }
  }

  const preloadImage = useCallback(
    (page: string, index: number) => {
      const imageUrl = getProxiedImageUrl(page)

      // Skip if already preloaded
      if (preloadedImages[index]) return

      // Use window.Image to avoid conflict with next/image
      const img = new window.Image()
      img.src = imageUrl
      img.onload = () => {
        setPreloadedImages((prev) => ({ ...prev, [index]: true }))
        logger.debug(`Preloaded image ${index + 1}/${pages.length}`)
      }
      img.onerror = () => {
        logger.error(`Failed to preload image ${index + 1}/${pages.length}`)
      }
    },
    [getProxiedImageUrl, preloadedImages, pages.length],
  )

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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh]">
        <Skeleton className="h-8 w-1/3 mb-8" />
        <Skeleton className="h-[60vh] w-full max-w-3xl" />
      </div>
    )
  }

  return (
    <div
      ref={readerContainerRef}
      className={cn(
        "relative flex flex-col items-center justify-center w-full h-[calc(100vh-64px)] bg-black",
        isFullscreen && "h-screen",
      )}
      onMouseMove={() => setShowControls(true)}
    >
      {/* Top navigation bar */}
      <div
        className={cn(
          "absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-2 bg-black/70 transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      >
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild className="text-white">
            <Link href={`/manga/${mangaId}`}>
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h2 className="text-white font-medium truncate max-w-[200px] sm:max-w-md">{title}</h2>
        </div>

        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={toggleFullscreen} className="text-white">
                  {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Sheet open={showSidebar} onOpenChange={setShowSidebar}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="text-white">
                <Settings className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent className="w-[300px]">
              <SheetHeader>
                <SheetTitle>Reader Settings</SheetTitle>
              </SheetHeader>
              <div className="py-4 space-y-6">
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Display Mode</h3>
                  <Select
                    value={readerMode}
                    onValueChange={(value: "fit-width" | "fit-height" | "original") => setReaderMode(value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select display mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fit-width">Fit Width</SelectItem>
                      <SelectItem value="fit-height">Fit Height</SelectItem>
                      <SelectItem value="original">Original Size</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Navigation</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {prevChapter && (
                      <Button variant="outline" asChild className="w-full">
                        <Link href={`/manga/${mangaId}/chapter/${prevChapter}`}>
                          <ChevronLeft className="h-4 w-4 mr-2" />
                          Previous Chapter
                        </Link>
                      </Button>
                    )}
                    {nextChapter && (
                      <Button variant="outline" asChild className="w-full">
                        <Link href={`/manga/${mangaId}/chapter/${nextChapter}`}>
                          Next Chapter
                          <ChevronRight className="h-4 w-4 ml-2" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Chapter Progress</h3>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">
                      Page {currentPageIndex + 1} of {pages.length}
                    </span>
                    {isSignedIn && (
                      <Button
                        variant={hasMarkedAsRead ? "default" : "outline"}
                        size="sm"
                        onClick={handleMarkAsRead}
                        className={hasMarkedAsRead ? "bg-green-500 hover:bg-green-600" : ""}
                      >
                        <Check className={`h-4 w-4 mr-2 ${hasMarkedAsRead ? "text-white" : ""}`} />
                        {hasMarkedAsRead ? "Read" : "Mark as Read"}
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Chapter List</h3>
                  <Button variant="outline" asChild className="w-full">
                    <Link href={`/manga/${mangaId}`}>
                      <List className="h-4 w-4 mr-2" />
                      All Chapters
                    </Link>
                  </Button>
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Keyboard Shortcuts</h3>
                  <div className="text-sm space-y-1 text-muted-foreground">
                    <p>
                      <span className="font-medium">Left Arrow:</span> Previous Page
                    </p>
                    <p>
                      <span className="font-medium">Right Arrow:</span> Next Page
                    </p>
                    <p>
                      <span className="font-medium">F:</span> Toggle Fullscreen
                    </p>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Page counter */}
      <div
        className={cn(
          "absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10 px-3 py-1 rounded-full bg-black/70 text-white text-sm transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0",
        )}
      >
        {currentPageIndex + 1} / {pages.length}
      </div>

      {/* Left navigation area */}
      <div className="absolute left-0 top-0 w-1/3 h-full z-5 cursor-w-resize" onClick={() => navigatePage(-1)}>
        <div
          className={cn(
            "absolute left-4 top-1/2 transform -translate-y-1/2 bg-black/50 rounded-full p-3 transition-opacity duration-300",
            showControls ? "opacity-70" : "opacity-0",
          )}
        >
          <ChevronLeft className="h-6 w-6 text-white" />
        </div>
      </div>

      {/* Right navigation area */}
      <div className="absolute right-0 top-0 w-1/3 h-full z-5 cursor-e-resize" onClick={() => navigatePage(1)}>
        <div
          className={cn(
            "absolute right-4 top-1/2 transform -translate-y-1/2 bg-black/50 rounded-full p-3 transition-opacity duration-300",
            showControls ? "opacity-70" : "opacity-0",
          )}
        >
          <ChevronRight className="h-6 w-6 text-white" />
        </div>
      </div>

      {/* Current page display */}
      <div className="relative flex items-center justify-center w-full h-full">
        {pages.length > 0 && currentPageIndex < pages.length ? (
          <div
            className={cn(
              "relative max-w-full max-h-full transition-transform duration-200",
              readerMode === "fit-width" && "w-full h-auto",
              readerMode === "fit-height" && "h-full w-auto",
              readerMode === "original" && "w-auto h-auto",
            )}
          >
            {(() => {
              const currentPage = pages[currentPageIndex]
              const imageUrl = getProxiedImageUrl(currentPage)
              logger.info(`Rendering image: page=${currentPageIndex + 1}/${pages.length}, url=${imageUrl}`)
              return (
                <Image
                  ref={currentImageRef}
                  src={imageUrl || "/placeholder.svg"}
                  alt={`Page ${currentPageIndex + 1}`}
                  width={800}
                  height={1200}
                  className={cn(
                    "object-contain",
                    readerMode === "fit-width" && "w-full h-auto",
                    readerMode === "fit-height" && "h-full w-auto",
                  )}
                  priority={true}
                  unoptimized={true}
                  onError={(e) => {
                    logger.error(`Failed to load image for page ${currentPageIndex + 1}`)
                    // @ts-ignore - currentTarget exists on the event
                    e.currentTarget.src = "/placeholder.svg"
                  }}
                  onLoad={() => {
                    logger.info(`Successfully loaded image for page ${currentPageIndex + 1}`)
                  }}
                />
              )
            })()}
          </div>
        ) : (
          <div className="text-white text-center">
            <p>No pages available for this chapter.</p>
            <Button onClick={handleRetry} className="mt-4">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

