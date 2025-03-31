"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import { Skeleton } from "@/components/ui/skeleton"
import { getChapterPages, getChapterById, getChapterTitle } from "@/lib/api"
import logger from "@/lib/logger"
import { Button } from "@/components/ui/button"
import { RefreshCw, ChevronUp } from "lucide-react"

export default function ChapterReader({
  mangaId,
  chapterId,
}: {
  mangaId: string
  chapterId: string
}) {
  const [title, setTitle] = useState<string>("")
  const [pages, setPages] = useState<string[]>([])
  const [baseUrl, setBaseUrl] = useState<string>("")
  const [hash, setHash] = useState<string>("")
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState<number>(0)
  const [preloadedImages, setPreloadedImages] = useState<Record<string, boolean>>({})
  const [visiblePages, setVisiblePages] = useState<number[]>([])
  const pageRefs = useRef<(HTMLDivElement | null)[]>([])
  const observerRef = useRef<IntersectionObserver | null>(null)
  const scrollToTopRef = useRef<HTMLButtonElement | null>(null)
  const [isForcingRefresh, setIsForcingRefresh] = useState(false)

  // Fetch chapter data
  useEffect(() => {
    async function loadChapter() {
      try {
        setLoading(true)
        setError(null)
        logger.info(`Loading chapter: ${chapterId} for manga: ${mangaId}`)

        // Get chapter info and pages in parallel
        const [chapter, chapterData] = await Promise.all([getChapterById(chapterId), getChapterPages(chapterId)])

        setTitle(getChapterTitle(chapter))
        setBaseUrl(chapterData.baseUrl)
        setHash(chapterData.chapter.hash)
        setPages(chapterData.chapter.data)

        logger.debug(`Chapter data loaded`, {
          baseUrl: chapterData.baseUrl,
          hash: chapterData.chapter.hash,
          pageCount: chapterData.chapter.data.length,
        })

        setLoading(false)
        setIsForcingRefresh(false) // Reset the force refresh flag
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error"
        logger.error(`Failed to load chapter: ${chapterId}`, err)
        setError(`Failed to load chapter. ${errorMessage}`)
        setLoading(false)
        setIsForcingRefresh(false) // Reset the force refresh flag
      }
    }

    loadChapter()
  }, [chapterId, retryCount, isForcingRefresh])

  // Preload images
  useEffect(() => {
    if (loading || pages.length === 0 || !baseUrl || !hash) return

    // Preload first 5 images immediately
    const imagesToPreloadImmediately = pages.slice(0, 5)
    const imagesToPreloadLater = pages.slice(5)

    logger.info(`Preloading first ${imagesToPreloadImmediately.length} images immediately`)

    // Preload first batch immediately
    imagesToPreloadImmediately.forEach((page, index) => {
      preloadImage(page, index)
    })

    // Preload the rest with a slight delay to not block the UI
    if (imagesToPreloadLater.length > 0) {
      logger.info(`Scheduling preload for remaining ${imagesToPreloadLater.length} images`)

      const preloadRest = () => {
        // Preload in batches of 5 with delays between batches
        const batchSize = 5
        for (let i = 0; i < imagesToPreloadLater.length; i += batchSize) {
          const batch = imagesToPreloadLater.slice(i, i + batchSize)
          setTimeout(() => {
            logger.debug(`Preloading batch of ${batch.length} images`)
            batch.forEach((page, batchIndex) => {
              preloadImage(page, i + batchIndex + imagesToPreloadImmediately.length)
            })
          }, i * 100) // 100ms delay between batches
        }
      }

      // Start preloading the rest after a short delay
      setTimeout(preloadRest, 500)
    }
  }, [loading, pages, baseUrl, hash])

  // Set up intersection observer for lazy loading
  useEffect(() => {
    if (loading || pages.length === 0) return

    // Initialize page refs array
    pageRefs.current = pageRefs.current.slice(0, pages.length)

    // Set up intersection observer
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visiblePageIndices = entries
          .filter((entry) => entry.isIntersecting)
          .map((entry) => Number.parseInt(entry.target.getAttribute("data-index") || "0"))

        if (visiblePageIndices.length > 0) {
          setVisiblePages((prev) => {
            const newVisiblePages = [...new Set([...prev, ...visiblePageIndices])]
            return newVisiblePages
          })
        }
      },
      { threshold: 0.1 },
    )

    // Observe all page elements
    pageRefs.current.forEach((ref, index) => {
      if (ref) {
        observerRef.current?.observe(ref)
      }
    })

    // Clean up observer
    return () => {
      observerRef.current?.disconnect()
    }
  }, [loading, pages])

  // Set up scroll to top button visibility
  useEffect(() => {
    const handleScroll = () => {
      if (scrollToTopRef.current) {
        if (window.scrollY > 500) {
          scrollToTopRef.current.classList.remove("hidden")
        } else {
          scrollToTopRef.current.classList.add("hidden")
        }
      }
    }

    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const preloadImage = (page: string, index: number) => {
    const imageUrl = getProxiedImageUrl(page)

    // Skip if already preloaded
    if (preloadedImages[imageUrl]) return

    // Use window.Image to avoid conflict with next/image
    const img = new window.Image()
    img.src = imageUrl
    img.onload = () => {
      setPreloadedImages((prev) => ({ ...prev, [imageUrl]: true }))
      logger.debug(`Preloaded image ${index + 1}/${pages.length}`)
    }
    img.onerror = () => {
      logger.error(`Failed to preload image ${index + 1}/${pages.length}`)
    }
  }

  const handleRetry = () => {
    logger.info(`Retrying chapter load: ${chapterId}`)
    setRetryCount((prev) => prev + 1)
    setPreloadedImages({})
    setVisiblePages([])
  }

  const handleForceRefresh = () => {
    logger.info(`Force refreshing chapter: ${chapterId}`)
    setIsForcingRefresh(true)
    setPreloadedImages({})
    setVisiblePages([])
  }

  // Function to get proxied image URL
  const getProxiedImageUrl = (page: string) => {
    try {
      // Construct the URL according to MangaDex's format
      const originalUrl = `${baseUrl}/data/${hash}/${page}`
      return `/api/manga-image?url=${encodeURIComponent(originalUrl)}`
    } catch (error) {
      logger.error(`Error creating proxied URL for page: ${page}`, error)
      return "/placeholder.svg"
    }
  }

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" })
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

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3 mx-auto" />
        {Array(5)
          .fill(0)
          .map((_, i) => (
            <Skeleton key={i} className="h-[500px] w-full max-w-3xl mx-auto" />
          ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center">
      <div className="w-full flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-center">{title}</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={handleForceRefresh}
          disabled={loading}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="space-y-4 w-full max-w-3xl mx-auto">
        {pages.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No pages found for this chapter.</p>
            <Button onClick={handleRetry} className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </div>
        ) : (
          pages.map((page, index) => (
            <div
              key={index}
              className="relative w-full"
              ref={(el) => {
                pageRefs.current[index] = el
              }}
              data-index={index}
            >
              <Image
                src={getProxiedImageUrl(page) || "/placeholder.svg"}
                alt={`Page ${index + 1}`}
                width={800}
                height={1200}
                className="w-full h-auto"
                priority={index < 3}
                unoptimized={true}
                onError={(e) => {
                  logger.error(`Failed to load image for page ${index + 1}`, { page })
                  // @ts-ignore - currentTarget exists on the event
                  e.currentTarget.src = "/placeholder.svg"
                }}
                loading={index < 5 ? "eager" : "lazy"}
              />
              <div className="absolute top-2 right-2 bg-black/50 text-white px-2 py-1 text-xs rounded">
                {index + 1}/{pages.length}
              </div>
            </div>
          ))
        )}
      </div>

      <Button
        ref={(el) => {
          scrollToTopRef.current = el
        }}
        onClick={scrollToTop}
        className="fixed bottom-6 right-6 rounded-full p-3 shadow-lg hidden"
        size="icon"
      >
        <ChevronUp className="h-5 w-5" />
        <span className="sr-only">Scroll to top</span>
      </Button>
    </div>
  )
}

