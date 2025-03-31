import { type NextRequest, NextResponse } from "next/server"
import axios from "axios"
import logger from "@/lib/logger"
import authService from "@/lib/auth-service"
import connectionManager from "@/lib/connection-manager"

// Define the MangaDex API base URL
const MANGADEX_API_URL = "https://api.mangadex.org"

// Update the GET handler to use axios and simplify the implementation
export async function GET(request: NextRequest) {
  try {
    // Extract the path and params from the request
    const { searchParams } = new URL(request.url)
    const path = searchParams.get("path")
    const paramsStr = searchParams.get("params")

    if (!path) {
      logger.error("Missing path parameter in MangaDex API proxy")
      return NextResponse.json({ error: "Missing path parameter" }, { status: 400 })
    }

    // Construct the full URL to the MangaDex API
    const apiUrl = `${MANGADEX_API_URL}${path}`

    // Parse the params if they exist
    let params: Record<string, any> = {}
    if (paramsStr) {
      try {
        params = JSON.parse(paramsStr)
      } catch (e) {
        logger.error("Failed to parse params JSON", e)
        return NextResponse.json({ error: "Invalid params format" }, { status: 400 })
      }
    }

    logger.info(`Proxying MangaDex API request to: ${apiUrl}`)

    // Get auth token if available
    const sessionToken = await authService.getSessionToken()

    // Add headers including auth if available
    const headers: Record<string, string> = {
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

    // Use axios to make the request
    const response = await axios({
      method: "GET",
      url: apiUrl,
      params: params,
      headers: headers,
      validateStatus: null, // Don't throw on error status codes
    })

    // Return the API response
    return NextResponse.json(response.data)
  } catch (error: any) {
    logger.error(`Error proxying MangaDex API request`, error)

    // Return an appropriate error response with more details
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      return NextResponse.json(
        {
          error: `MangaDex API error: ${error.response.status} ${error.response.statusText}`,
          detail: error.response.data?.errors?.[0]?.detail || "Unknown error",
        },
        { status: error.response.status },
      )
    } else if (error.request) {
      // The request was made but no response was received
      return NextResponse.json(
        { error: "No response received from MangaDex API", detail: error.message },
        { status: 503 },
      )
    } else {
      // Something happened in setting up the request that triggered an Error
      return NextResponse.json(
        { error: "Failed to fetch data from MangaDex API", detail: error.message },
        { status: 500 },
      )
    }
  }
}

// Add a POST handler for authentication and other POST requests
export async function POST(request: NextRequest) {
  try {
    // Extract the path from the request
    const { searchParams } = new URL(request.url)
    const path = searchParams.get("path")

    if (!path) {
      logger.error("Missing path parameter in MangaDex API proxy")
      return NextResponse.json({ error: "Missing path parameter" }, { status: 400 })
    }

    // Construct the full URL to the MangaDex API
    const apiUrl = `${MANGADEX_API_URL}${path}`

    // Get the request body
    const body = await request.json()

    logger.info(`Proxying MangaDex API POST request to: ${apiUrl}`)

    // Get auth token if available
    const sessionToken = await authService.getSessionToken()

    // Add headers including auth if available
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": "MangaReader/1.0",
      "Content-Type": "application/json",
    }

    if (sessionToken) {
      headers["Authorization"] = `Bearer ${sessionToken}`
    }

    // Use axios to make the request
    const response = await axios({
      method: "POST",
      url: apiUrl,
      data: body,
      headers: headers,
      validateStatus: null, // Don't throw on error status codes
    })

    // Return the API response
    return NextResponse.json(response.data)
  } catch (error: any) {
    logger.error(`Error proxying MangaDex API POST request`, error)

    // Return an appropriate error response with more details
    if (error.response) {
      return NextResponse.json(
        {
          error: `MangaDex API error: ${error.response.status} ${error.response.statusText}`,
          detail: error.response.data?.errors?.[0]?.detail || "Unknown error",
        },
        { status: error.response.status },
      )
    } else if (error.request) {
      return NextResponse.json(
        { error: "No response received from MangaDex API", detail: error.message },
        { status: 503 },
      )
    } else {
      return NextResponse.json({ error: "Failed to send data to MangaDex API", detail: error.message }, { status: 500 })
    }
  }
}

