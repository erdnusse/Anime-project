import { type NextRequest, NextResponse } from "next/server"
import logger from "@/lib/logger"
import authService from "@/lib/auth-service"

// Cache for storing image responses
const CACHE_MAX_AGE = 60 * 60 * 24 * 7 // 7 days in seconds

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

    // Fetch the image
    const response = await fetch(url, {
      headers,
      cache: "force-cache", // Use built-in HTTP cache when possible
    })

    if (!response.ok) {
      logger.error(`Failed to fetch image: ${url}`, {
        status: response.status,
        statusText: response.statusText,
      })

      return new NextResponse(`Failed to fetch image: ${response.statusText}`, {
        status: response.status,
      })
    }

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

