import { type NextRequest, NextResponse } from "next/server"
import logger from "@/lib/logger"
import authService from "@/lib/auth-service"
import { retryWithBackoff } from "@/lib/retry-with-backoff"

// Cache for storing image responses
const CACHE_MAX_AGE = 60 * 60 * 24 * 7 // 7 days in seconds

// Retry options specifically for image fetching
const IMAGE_RETRY_OPTIONS = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  factor: 2,
  jitter: true,
  retryCondition: (error: any) => {
    // Only retry on network errors, 5xx errors, or 429 (too many requests)
    if (error.status) {
      return error.status === 429 || error.status >= 500
    }
    return true // Retry on network errors
  },
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url")

  if (!url) {
    logger.error("Missing URL parameter in manga-image proxy")
    return new NextResponse("Missing URL parameter", { status: 400 })
  }

  logger.info(`Proxying manga image: ${url}`)

  try {
    // Get auth token if available
    const sessionToken = await authService.getSessionToken()

    // Add headers including auth if available
    const headers: HeadersInit = {
      "User-Agent": "MangaReader/1.0",
      Referer: "https://mangadex.org/",
      Accept: "image/webp,image/jpeg,image/png,image/*,*/*",
    }

    if (sessionToken) {
      headers["Authorization"] = `Bearer ${sessionToken}`
    }

    // Fetch the image with retry logic
    const response = await retryWithBackoff(async () => {
      const res = await fetch(url, {
        headers,
        cache: "force-cache", // Use built-in HTTP cache when possible
      })

      if (!res.ok) {
        const error: any = new Error(`Failed to fetch image: ${res.statusText}`)
        error.status = res.status
        error.statusText = res.statusText
        throw error
      }

      return res
    }, IMAGE_RETRY_OPTIONS)

    const imageBuffer = await response.arrayBuffer()
    const contentType = response.headers.get("content-type") || "image/jpeg"

    logger.debug(`Successfully proxied image: ${url}`, {
      contentType,
      size: imageBuffer.byteLength,
    })

    // Return the image with strong caching headers
    return new NextResponse(imageBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": `public, max-age=${CACHE_MAX_AGE}, s-maxage=${CACHE_MAX_AGE}, stale-while-revalidate=86400`,
        ETag: response.headers.get("etag") || "",
        "Last-Modified": response.headers.get("last-modified") || new Date().toUTCString(),
      },
    })
  } catch (error) {
    logger.error(`Error proxying image: ${url}`, error)
    return new NextResponse("Error fetching image", { status: 500 })
  }
}

// Configure the route to use caching
export const dynamic = "force-dynamic"
export const revalidate = false

