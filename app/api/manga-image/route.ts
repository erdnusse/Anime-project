import { type NextRequest, NextResponse } from "next/server"
import axios from "axios"
import logger from "@/lib/logger"
import authService from "@/lib/auth-service"
import connectionManager from "@/lib/connection-manager"

// Cache for storing image responses
const CACHE_MAX_AGE = 60 * 60 * 24 * 7 // 7 days in seconds

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url")

  if (!url) {
    logger.error("Missing URL parameter in manga-image proxy")
    return new NextResponse("Missing URL parameter", { status: 400 })
  }

  // Check if we have this image in the browser cache
  const cacheKey = `image_${url}`

  logger.info(`Proxying manga image: ${url}`)

  try {
    // Get auth token if available
    const sessionToken = await authService.getSessionToken()

    // Add headers including auth if available
    const headers: Record<string, string> = {
      "User-Agent": "MangaReader/1.0",
      Referer: "https://mangadex.org/",
      Accept: "image/webp,image/jpeg,image/png,image/*,*/*",
    }

    if (sessionToken) {
      headers["Authorization"] = `Bearer ${sessionToken}`
    }

    // Check if we should use HTTP/1.1 for this host
    const useHttp1 = connectionManager.hasHttp2Failed(url)

    if (useHttp1) {
      headers["Connection"] = "keep-alive"
      headers["X-Force-HTTP1"] = "1"
    }

    // Fetch the image with axios
    const response = await axios({
      method: "GET",
      url: url,
      headers: headers,
      responseType: "arraybuffer",
    })

    const imageBuffer = response.data
    const contentType = response.headers["content-type"] || "image/jpeg"

    logger.debug(`Successfully proxied image: ${url}`, {
      contentType,
      size: imageBuffer.byteLength,
    })

    // Return the image with strong caching headers
    return new NextResponse(imageBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": `public, max-age=${CACHE_MAX_AGE}, s-maxage=${CACHE_MAX_AGE}, stale-while-revalidate=86400`,
        ETag: response.headers.etag || "",
        "Last-Modified": response.headers["last-modified"] || new Date().toUTCString(),
      },
    })
  } catch (error: any) {
    logger.error(`Error proxying image: ${url}`, error)

    if (error.response) {
      return new NextResponse(`Error fetching image: ${error.response.status} ${error.response.statusText}`, {
        status: error.response.status,
      })
    }

    return new NextResponse("Error fetching image", { status: 500 })
  }
}

// Configure the route to use caching
export const dynamic = "force-dynamic"
export const revalidate = false

