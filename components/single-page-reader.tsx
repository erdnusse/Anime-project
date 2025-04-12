"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import Image from "next/image"
import { Skeleton } from "@/components/ui/skeleton"
import { getChapterPages, getChapterById, getChapterTitle, getAdjacentChapters } from "@/lib/api"
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
import { useLogger } from "@/hooks/use-logger"
import { useFullscreen } from "@/hooks/use-fullscreen"
import { ErrorDisplay } from "@/components/error-display"
import { RateLimitError } from "@/lib/api-error"

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
  const [error, setError] = useState<Error | null>(null)
  const [retryCount, setRetryCount] = useState<number>(0)
  const [retryDisabled, setRetryDisabled] = useState<boolean>(false)
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null)

  // Page navigation state
  const [currentPageIndex, setCurrentPageIndex] = useState<number>(0)
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
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isMountedRef = useRef<boolean>(true)
  const pagesRef = useRef<string[]>([])
  const preloadedImagesRef = useRef<Record<number, boolean>>({})
  const currentPageIndexRef = useRef<number>(0)
  const dataLoadedRef = useRef<boolean>(false)
  const initialPreloadQueueSetRef = useRef<boolean>(false)

  // Reader settings
  const [readerMode, setReaderMode] = useState<"fit-width" | "fit-height" | "original">("fit-width")

  // Hooks
  const logger = useLogger("reader")
  const { isFullscreen, toggleFullscreen } = useFullscreen(readerContainerRef)

  // Update refs when state changes
  useEffect(() => {
    pagesRef.current = pages
    currentPageIndexRef.current = currentPageIndex
    preloadedImagesRef.current = preloadedImages
  }, [pages, currentPageIndex, preloadedImages])

  // Set mounted flag on component mount
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  // Function to get proxied image URL - memoized to avoid recreating on every render
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
    [baseUrl, hash, logger],
  )

  // Handle retry countdown for rate limiting
  useEffect(() => {
    if (retryCountdown === null || retryCountdown <= 0) {
      if (retryTimeoutRef.current) {
        clearInterval(retryTimeoutRef.current)
        retryTimeoutRef.current = null
      }
      return
    }

    // Clear any existing interval first
    if (retryTimeoutRef.current) {
      clearInterval(retryTimeoutRef.current)
    }

    retryTimeoutRef.current = setInterval(() => {
      setRetryCountdown((prev) => {
        if (prev === null || prev <= 1) {
          setRetryDisabled(false)
          return null
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (retryTimeoutRef.current) {
        clearInterval(retryTimeoutRef.current)
        retryTimeoutRef.current = null
      }
    }
  }, [retryCountdown])

  // Fetch chapter data - this is the main effect causing the loop
  useEffect(() => {
    // Skip if retry is disabled (rate limited)
    if (retryDisabled) return

    // Skip if we've already loaded data for this chapter
    if (dataLoadedRef.current && chapterId === chapterId) return

    async function loadChapter() {
      try {
        setLoading(true)
        setError(null)

        // Only reset these states on initial load or explicit retry, not on dependency changes
        if (retryCount > 0 || (!pagesRef.current.length && !baseUrl && !hash)) {
          setCurrentPageIndex(0)
          setPreloadedImages({})
          setPreloadQueue([])
          setHasMarkedAsRead(false)
        }

        // Validate chapter ID
        if (!chapterId) {
          logger.error("Chapter ID is missing or invalid")
          if (isMountedRef.current) {
            setError(new Error("Chapter ID is missing or invalid"))
            setLoading(false)
          }
          return
        }

        logger.info(`Loading chapter: ${chapterId} for manga: ${mangaId}`)

        // Get chapter info and pages in parallel
        const [chapter, chapterData, adjacentChapters] = await Promise.all([
          getChapterById(chapterId),
          getChapterPages(chapterId),
          getAdjacentChapters(mangaId, chapterId),
        ])

        // Check if component is still mounted before updating state
        if (!isMountedRef.current) return

        setTitle(getChapterTitle(chapter))
        setBaseUrl(chapterData.baseUrl)
        setHash(chapterData.chapter.hash)

        logger.info(`Chapter data loaded with ${chapterData.chapter.data.length} pages`)
        logger.info(`Base URL: ${chapterData.baseUrl}, Hash: ${chapterData.chapter.hash}`)

        if (chapterData.chapter.data.length === 0) {
          logger.error("No pages found in chapter data")
          setError(new Error("No pages found for this chapter"))
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

        // Mark that we've loaded data for this chapter
        dataLoadedRef.current = true
        setLoading(false)

        // Initialize preload queue with first few pages - only if we have pages and haven't done it yet
        if (chapterData.chapter.data.length > 0 && !initialPreloadQueueSetRef.current) {
          const initialPreloadQueue = Array.from({ length: Math.min(5, chapterData.chapter.data.length) }, (_, i) => i)
          setPreloadQueue(initialPreloadQueue)
          initialPreloadQueueSetRef.current = true
        }
      } catch (err) {
        if (!isMountedRef.current) return

        logger.error(`Failed to load chapter: ${chapterId}`, err)

        // Handle rate limiting specifically
        if (err instanceof RateLimitError && err.retryAfter) {
          setRetryDisabled(true)
          setRetryCountdown(err.retryAfter)
        }

        setError(err instanceof Error ? err : new Error("Unknown error occurred"))
        setLoading(false)
      }
    }

    loadChapter()
  }, [chapterId, mangaId, retryCount, logger, retryDisabled, baseUrl, hash])

  // Reset data loaded flag when chapter ID changes
  useEffect(() => {
    dataLoadedRef.current = false
    initialPreloadQueueSetRef.current = false
  }, [chapterId])

  // Preload images in queue - using a stable reference to avoid dependency issues
  const preloadNextImageRef = useRef<() => void>(() => {})

  // Define the preload function separately from its execution
  useEffect(() => {
    // Define the preload function
    preloadNextImageRef.current = () => {
      // Use refs to avoid dependency issues
      const currentPages = pagesRef.current
      const currentPreloadedImages = preloadedImagesRef.current

      if (loading || currentPages.length === 0 || !baseUrl || !hash || preloadQueue.length === 0) return

      const nextPageIndex = preloadQueue[0]

      // Skip if already preloaded or out of bounds
      if (currentPreloadedImages[nextPageIndex] || nextPageIndex >= currentPages.length || nextPageIndex < 0) {
        setPreloadQueue((prev) => prev.slice(1))
        return
      }

      const page = currentPages[nextPageIndex]
      const imageUrl = getProxiedImageUrl(page)

      logger.debug(`Preloading image ${nextPageIndex + 1}/${currentPages.length}`)

      // Use window.Image to avoid conflict with next/image
      const img = new window.Image()
      img.src = imageUrl
      img.onload = () => {
        if (isMountedRef.current) {
          setPreloadedImages((prev) => ({ ...prev, [nextPageIndex]: true }))
          setPreloadQueue((prev) => prev.slice(1))
        }
      }
      img.onerror = () => {
        if (isMountedRef.current) {
          logger.error(`Failed to preload image ${nextPageIndex + 1}/${currentPages.length}`)
          setPreloadQueue((prev) => prev.slice(1))
        }
      }
    }
  }, [baseUrl, hash, loading, getProxiedImageUrl, logger, preloadQueue])

  // Execute preload using the stable reference - separate effect to avoid dependency issues
  useEffect(() => {
    if (preloadQueue.length > 0 && preloadNextImageRef.current) {
      preloadNextImageRef.current()
    }
  }, [preloadQueue])

  // Update preload queue when current page changes - with stable dependencies
  useEffect(() => {
    if (loading || pages.length === 0) return

    // Create a local copy of the current state to avoid closure issues
    const currentPageIdx = currentPageIndex
    const currentPages = [...pages]
    const currentPreloadedImgs = { ...preloadedImages }

    // Preload next 3 pages after current page
    const newPagesToPreload: number[] = []
    for (let i = 1; i <= 3; i++) {
      const pageIndex = currentPageIdx + i
      if (pageIndex < currentPages.length && !currentPreloadedImgs[pageIndex]) {
        newPagesToPreload.push(pageIndex)
      }
    }

    if (newPagesToPreload.length > 0) {
      setPreloadQueue((prev) => {
        // Create a Set to remove duplicates, then convert back to array
        const combinedQueue = [...prev, ...newPagesToPreload]
        return [...new Set(combinedQueue)]
      })
    }

    // Check if we're at the end of the chapter
    if (currentPageIdx === currentPages.length - 1 && !hasMarkedAsRead && isSignedIn) {
      markChapterAsRead(mangaId, chapterId)
        .then(() => {
          if (isMountedRef.current) {
            setHasMarkedAsRead(true)
            logger.info(`Marked chapter ${chapterId} as read automatically`)
          }
        })
        .catch((err) => {
          logger.error(`Failed to mark chapter as read: ${chapterId}`, err)
          // Don't set error state here as it's not critical to the reading experience
        })
    }
  }, [currentPageIndex, pages, preloadedImages, loading, mangaId, chapterId, hasMarkedAsRead, isSignedIn, logger])

  // Handle mouse movement to show/hide controls
  useEffect(() => {
    const showSidebarValue = showSidebar // Capture current value to avoid closure issues

    const handleMouseMove = () => {
      setShowControls(true)

      if (mouseIdleTimerRef.current) {
        clearTimeout(mouseIdleTimerRef.current)
      }

      mouseIdleTimerRef.current = setTimeout(() => {
        if (!showSidebarValue && isMountedRef.current) {
          setShowControls(false)
        }
      }, 3000)
    }

    window.addEventListener("mousemove", handleMouseMove)

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      if (mouseIdleTimerRef.current) {
        clearTimeout(mouseIdleTimerRef.current)
        mouseIdleTimerRef.current = null
      }
    }
  }, [showSidebar])

  // Navigation functions - defined before they're used in hotkeys
  const navigatePage = useCallback(
    (direction: number) => {
      // Use refs to get the latest values
      const currentIdx = currentPageIndexRef.current
      const currentPages = pagesRef.current

      logger.info(
        `Navigating page: direction=${direction}, currentIndex=${currentIdx}, totalPages=${currentPages.length}`,
      )

      if (direction < 0 && currentIdx === 0) {
        // If at first page and trying to go back, go to previous chapter if available
        if (prevChapter) {
          logger.info(`Navigating to previous chapter: ${prevChapter}`)
          router.push(`/manga/${mangaId}/chapter/${prevChapter}`)
        }
        return
      }

      if (direction > 0 && currentIdx >= currentPages.length - 1) {
        // If at last page and trying to go forward, go to next chapter if available
        if (nextChapter) {
          logger.info(`Navigating to next chapter: ${nextChapter}`)
          router.push(`/manga/${mangaId}/chapter/${nextChapter}`)
        }
        return
      }

      // Otherwise, just update the current page index
      const newIndex = currentIdx + direction
      if (newIndex >= 0 && newIndex < currentPages.length) {
        logger.info(`Setting new page index: ${newIndex}`)
        setCurrentPageIndex(newIndex)
      }
    },
    [prevChapter, nextChapter, mangaId, router, logger],
  )

  // Keyboard navigation - memoized to avoid recreating on every render
  const handleLeftKey = useCallback(() => navigatePage(-1), [navigatePage])
  const handleRightKey = useCallback(() => navigatePage(1), [navigatePage])
  const handleFKey = useCallback(() => toggleFullscreen(), [toggleFullscreen])

  // Set up hotkeys with stable references
  useHotkeys("left", handleLeftKey)
  useHotkeys("right", handleRightKey)
  useHotkeys("f", handleFKey)

  const handleRetry = useCallback(() => {
    logger.info(`Retrying chapter load: ${chapterId}`)
    dataLoadedRef.current = false // Reset the data loaded flag
    initialPreloadQueueSetRef.current = false // Reset the initial preload queue flag
    setRetryCount((prev) => prev + 1)
  }, [chapterId, logger])

  const handleMarkAsRead = useCallback(async () => {
    if (!isSignedIn) return

    try {
      await markChapterAsRead(mangaId, chapterId)
      if (isMountedRef.current) {
        setHasMarkedAsRead(true)
        logger.info(`Manually marked chapter ${chapterId} as read`)
      }
    } catch (error) {
      logger.error(`Failed to mark chapter as read: ${chapterId}`, error)
    }
  }, [isSignedIn, mangaId, chapterId, logger])

  if (error) {
    return (
      <div className="container mx-auto py-8 px-4">
        <ErrorDisplay error={error} onRetry={handleRetry} className="max-w-2xl mx-auto" />
        <div className="mt-4 text-center">
          <Button variant="outline" asChild className="mx-auto">
            <Link href={`/manga/${mangaId}`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Manga
            </Link>
          </Button>
        </div>
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
        "relative flex flex-col items-center justify-center w-full h-[calc(100vh-64px)] bg-black overflow-hidden",
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
      <div
        className="absolute left-0 top-0 w-1/2 h-full z-5 cursor-w-resize"
        onClick={() => navigatePage(-1)}
        aria-label="Previous page"
      >
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
      <div
        className="absolute right-0 top-0 w-1/2 h-full z-5 cursor-e-resize"
        onClick={() => navigatePage(1)}
        aria-label="Next page"
      >
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
      <div className="relative flex items-center justify-center w-full h-full overflow-hidden">
        {pages.length > 0 && currentPageIndex < pages.length ? (
          <div
            className={cn(
              "relative max-w-full max-h-full transition-transform duration-200 px-2",
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
                    "object-contain max-w-full max-h-full",
                    readerMode === "fit-width" && "w-full h-auto",
                    readerMode === "fit-height" && "h-full w-auto",
                    readerMode === "original" && "max-h-[95vh] max-w-[95vw]",
                  )}
                  style={{
                    objectFit: "contain",
                    maxWidth: "100%",
                    maxHeight: isFullscreen ? "100vh" : "calc(100vh - 64px)",
                  }}
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
