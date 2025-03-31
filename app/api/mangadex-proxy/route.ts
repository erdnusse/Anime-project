import { type NextRequest, NextResponse } from "next/server"
import logger from "@/lib/logger"
import authService from "@/lib/auth-service"
import { retryWithBackoff } from "./retry-with-backoff"
import connectionManager from "@/lib/connection-manager"

const MANGADEX_API_URL = "https://api.mangadex.org"

// Retry options for API requests
const API_RETRY_OPTIONS = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 15000,
  factor: 2,
  jitter: true,
  retryCondition: (error: any) => {
    // Only retry on network errors or 5xx server errors
    if (error.status && error.status >= 400 && error.status < 500) {
      // Don't retry client errors (4xx) except for 429 (too many requests)
      return error.status === 429
    }
    return true // Retry on network errors and 5xx
  },
}

// Update the GET handler in the proxy route to better handle URL validation
export async function GET(request: NextRequest) {
  // Extract the path parameter from the request
  const { searchParams } = new URL(request.url)
  const path = searchParams.get("path")

  if (!path) {
    logger.error("Missing path parameter in MangaDex API proxy")
    return NextResponse.json({ error: "Missing path parameter" }, { status: 400 })
  }

  // Construct the full URL to the MangaDex API
  const apiUrl = `${MANGADEX_API_URL}${path}`

  logger.info(`Proxying MangaDex API request to: ${apiUrl}`)

  try {
    // Get auth token if available (for browser requests)
    const sessionToken = await authService.getSessionToken()

    // Add headers including auth if available
    const headers: HeadersInit = {
      Accept: "application/json",
      "User-Agent": "MangaReader/1.0",
      "Content-Type": "application/json",
    }

    if (sessionToken) {
      headers["Authorization"] = `Bearer ${sessionToken}`
    }

    // Check if we should use HTTP/1.1 for this host
    const useHttp1 = connectionManager.hasHttp2Failed(apiUrl)

    if (useHttp1) {
      headers["Connection"] = "keep-alive"
      headers["X-Force-HTTP1"] = "1"
    }

    // Fetch the API data with retry logic
    const response = await retryWithBackoff(
      async () => {
        try {
          const res = await fetch(apiUrl, {
            headers,
            cache: "no-store", // Don't cache API responses by default
          })

          // Check for rate limiting response
          if (res.status === 429) {
            const retryAfter = res.headers.get("Retry-After")
            const error: any = new Error(`Rate limited: ${res.status} ${res.statusText}`)
            error.status = res.status
            error.statusText = res.statusText
            error.retryAfter = retryAfter
            throw error
          }

          if (!res.ok) {
            const errorText = await res.text()
            const error: any = new Error(`API request failed: ${res.status} ${res.statusText}`)
            error.status = res.status
            error.statusText = res.statusText
            error.body = errorText
            throw error
          }

          return res
        } catch (error: any) {
          // Check if this is an HTTP/2 protocol error
          if (
            error?.message?.includes("ERR_HTTP2_PROTOCOL_ERROR") ||
            error?.message?.includes("HTTP/2") ||
            error?.code === "ERR_HTTP2_PROTOCOL_ERROR"
          ) {
            // Mark this host as having HTTP/2 issues
            connectionManager.markHttp2Failed(apiUrl)

            // Add more context to the error
            error.message = `HTTP/2 protocol error for ${apiUrl}: ${error.message}`
          }

          throw error
        }
      },
      API_RETRY_OPTIONS,
      apiUrl,
    )

    // Get the response data
    const data = await response.json()

    // Return the API response
    return NextResponse.json(data)
  } catch (error) {
    logger.error(`Error proxying MangaDex API request: ${apiUrl}`, error)

    // Return an appropriate error response with more details
    if ((error as any).status) {
      let errorDetail = "Unknown error"
      try {
        if ((error as any).body) {
          const errorBody = JSON.parse((error as any).body)
          errorDetail = errorBody?.errors?.[0]?.detail || errorDetail
        }
      } catch (e) {
        // If parsing fails, use the raw body
        errorDetail = (error as any).body || errorDetail
      }

      return NextResponse.json(
        {
          error: `MangaDex API error: ${(error as any).statusText || "Unknown error"}`,
          detail: errorDetail,
          url: apiUrl,
        },
        { status: (error as any).status },
      )
    }

    return NextResponse.json(
      { error: "Failed to fetch data from MangaDex API", detail: (error as Error).message },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  // Extract the path from the request
  const { searchParams } = new URL(request.url)
  const path = searchParams.get("path")

  if (!path) {
    logger.error("Missing path parameter in MangaDex API proxy")
    return NextResponse.json({ error: "Missing path parameter" }, { status: 400 })
  }

  // Construct the full URL to the MangaDex API
  const apiUrl = `${MANGADEX_API_URL}${path}`

  logger.info(`Proxying MangaDex API POST request to: ${apiUrl}`)

  try {
    // Get the request body
    const body = await request.json()

    // Get auth token if available
    const sessionToken = await authService.getSessionToken()

    // Add headers including auth if available
    const headers: HeadersInit = {
      Accept: "application/json",
      "User-Agent": "MangaReader/1.0",
      "Content-Type": "application/json",
    }

    if (sessionToken) {
      headers["Authorization"] = `Bearer ${sessionToken}`
    }

    // Check if we should use HTTP/1.1 for this host
    const useHttp1 = connectionManager.hasHttp2Failed(apiUrl)

    if (useHttp1) {
      headers["Connection"] = "keep-alive"
      headers["X-Force-HTTP1"] = "1"
    }

    // Fetch the API data with retry logic
    const response = await retryWithBackoff(
      async () => {
        try {
          const res = await fetch(apiUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
          })

          // Check for rate limiting response
          if (res.status === 429) {
            const retryAfter = res.headers.get("Retry-After")
            const error: any = new Error(`Rate limited: ${res.status} ${res.statusText}`)
            error.status = res.status
            error.statusText = res.statusText
            error.retryAfter = retryAfter
            throw error
          }

          if (!res.ok) {
            const errorText = await res.text()
            const error: any = new Error(`API request failed: ${res.status} ${res.statusText}`)
            error.status = res.status
            error.statusText = res.statusText
            error.body = errorText
            throw error
          }

          return res
        } catch (error: any) {
          // Check if this is an HTTP/2 protocol error
          if (
            error?.message?.includes("ERR_HTTP2_PROTOCOL_ERROR") ||
            error?.message?.includes("HTTP/2") ||
            error?.code === "ERR_HTTP2_PROTOCOL_ERROR"
          ) {
            // Mark this host as having HTTP/2 issues
            connectionManager.markHttp2Failed(apiUrl)

            // Add more context to the error
            error.message = `HTTP/2 protocol error for ${apiUrl}: ${error.message}`
          }

          throw error
        }
      },
      API_RETRY_OPTIONS,
      apiUrl,
    )

    // Get the response data
    const data = await response.json()

    // Return the API response
    return NextResponse.json(data)
  } catch (error) {
    logger.error(`Error proxying MangaDex API POST request: ${apiUrl}`, error)

    // Return an appropriate error response
    if ((error as any).status) {
      let errorDetail = "Unknown error"
      try {
        if ((error as any).body) {
          const errorBody = JSON.parse((error as any).body)
          errorDetail = errorBody?.errors?.[0]?.detail || errorDetail
        }
      } catch (e) {
        // If parsing fails, use the raw body
        errorDetail = (error as any).body || errorDetail
      }

      return NextResponse.json(
        {
          error: `MangaDex API error: ${(error as any).statusText || "Unknown error"}`,
          detail: errorDetail,
          url: apiUrl,
        },
        { status: (error as any).status },
      )
    }

    return NextResponse.json({ error: "Failed to post data to MangaDex API" }, { status: 500 })
  }
}

// Configure the route to be dynamic
export const dynamic = "force-dynamic"

