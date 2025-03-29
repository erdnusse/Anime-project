import logger from "./logger"
import authService from "./auth-service"
import { retryWithBackoff } from "./retry-with-backoff"

// MangaDex API types
export interface Manga {
  id: string
  type: string
  attributes: {
    title: Record<string, string>
    altTitles: Array<Record<string, string>>
    description: Record<string, string>
    status: string
    year: number | null
    contentRating: string
    tags: Array<{
      id: string
      type: string
      attributes: {
        name: Record<string, string>
        group: string
      }
    }>
    originalLanguage: string
    lastVolume: string | null
    lastChapter: string | null
    publicationDemographic: string | null
    createdAt: string
    updatedAt: string
  }
  relationships: Array<{
    id: string
    type: string
    attributes?: any
  }>
}

export interface Chapter {
  id: string
  type: string
  attributes: {
    title: string | null
    volume: string | null
    chapter: string | null
    pages: number
    translatedLanguage: string
    uploader: string
    externalUrl: string | null
    publishAt: string
    readableAt: string
    createdAt: string
    updatedAt: string
    version: number
  }
  relationships: Array<{
    id: string
    type: string
    attributes?: any
  }>
}

export interface ChapterData {
  baseUrl: string
  chapter: {
    hash: string
    data: string[]
    dataSaver: string[]
  }
}

// API functions
const API_BASE_URL = "https://api.mangadex.org"

// Check if we're in a browser environment
const isBrowser = typeof window !== "undefined"

// Default retry options for API requests
const DEFAULT_RETRY_OPTIONS = {
  maxRetries: 3,
  initialDelay: 1000, // Start with 1 second
  maxDelay: 15000, // Max delay of 15 seconds
  factor: 2, // Double the delay each time
  jitter: true, // Add randomness to prevent thundering herd
  retryCondition: (error: any) => {
    // Only retry on network errors or 5xx server errors
    if (error.status && error.status >= 400 && error.status < 500) {
      // Don't retry client errors (4xx) except for 429 (too many requests)
      return error.status === 429
    }
    return true // Retry on network errors and 5xx
  },
}

/**
 * Get authentication headers for API requests
 */
async function getAuthHeaders(): Promise<HeadersInit> {
  const headers: HeadersInit = {
    Accept: "application/json",
    "User-Agent": "MangaReader/1.0",
  }

  // Only try to get auth token in browser environment
  if (isBrowser) {
    const sessionToken = await authService.getSessionToken()
    if (sessionToken) {
      headers["Authorization"] = `Bearer ${sessionToken}`
    }
  }

  return headers
}

/**
 * Fetch with retry and proper error handling
 */
async function fetchWithRetry(url: string, options?: RequestInit): Promise<Response> {
  return retryWithBackoff(async () => {
    console.log("URL:" + url);
    console.log("Options: " + options?.headers);
    const response = await fetch(url, options)

    // If the response is not ok, throw an error with status
    if (!response.ok) {
      const errorText = await response.text()
      const error: any = new Error(`API request failed: ${response.status} ${response.statusText}`)
      error.status = response.status
      error.statusText = response.statusText
      error.body = errorText
      throw error
    }

    return response
  }, DEFAULT_RETRY_OPTIONS)
}

export async function getFeaturedManga(): Promise<Manga> {
  logger.info("Fetching featured manga")
  try {
    const headers = await getAuthHeaders()
    console.log("Headers:" + headers)
    // For simplicity, we'll just get a random popular manga
    const response = await fetchWithRetry(
      `${API_BASE_URL}/manga?includes[]=cover_art&includes[]=author&order[followedCount]=desc&limit=1`,
      { headers },
    )

    const data = await response.json()
    logger.debug("Featured manga fetched successfully", { id: data.data[0]?.id })
    return data.data[0]
  } catch (error) {
    logger.error("Error in getFeaturedManga", error)
    throw error
  }
}

export async function getMangaList(type: string, limit = 20): Promise<Manga[]> {
  logger.info(`Fetching manga list: ${type}, limit: ${limit}`)
  try {
    const headers = await getAuthHeaders()
    let url = `${API_BASE_URL}/manga?includes[]=cover_art&includes[]=author&limit=${limit}`

    switch (type) {
      case "popular":
        url += "&order[followedCount]=desc"
        break
      case "latest":
        url += "&order[updatedAt]=desc"
        break
      case "new":
        url += "&order[createdAt]=desc"
        break
      default:
        url += "&order[relevance]=desc"
    }
    console.log("Headers:" + headers)
    const response = await fetchWithRetry(url, { headers })
    const data = await response.json()
    logger.debug(`Manga list (${type}) fetched successfully`, { count: data.data.length })
    return data.data
  } catch (error) {
    logger.error(`Error in getMangaList (${type})`, error)
    throw error
  }
}

export async function searchManga(query: string): Promise<Manga[]> {
  logger.info(`Searching manga with query: ${query}`)
  try {
    const headers = await getAuthHeaders()
    const response = await fetchWithRetry(
      `${API_BASE_URL}/manga?title=${encodeURIComponent(query)}&includes[]=cover_art&includes[]=author&limit=20`,
      { headers },
    )

    const data = await response.json()
    logger.debug(`Manga search for "${query}" completed successfully`, { count: data.data.length })
    return data.data
  } catch (error) {
    logger.error(`Error in searchManga for "${query}"`, error)
    throw error
  }
}

export async function getMangaById(id: string): Promise<Manga> {
  logger.info(`Fetching manga by ID: ${id}`)
  try {
    const headers = await getAuthHeaders()
    const response = await fetchWithRetry(
      `${API_BASE_URL}/manga/${id}?includes[]=cover_art&includes[]=author&includes[]=artist`,
      { headers },
    )

    const data = await response.json()
    logger.debug(`Manga with ID ${id} fetched successfully`)
    return data.data
  } catch (error) {
    logger.error(`Error in getMangaById for ID ${id}`, error)
    throw error
  }
}

export async function getChapterList(
  mangaId: string,
  progressCallback?: (progress: number) => void,
): Promise<Chapter[]> {
  logger.info(`Fetching chapter list for manga ID: ${mangaId}`)
  try {
    const headers = await getAuthHeaders()
    let allChapters: Chapter[] = []
    let offset = 0
    let hasMoreChapters = true
    let totalChapters = 0
    let totalFetched = 0
    const limit = 100 // Number of chapters per request

    // Loop until we've fetched all chapters
    while (hasMoreChapters) {
      logger.info(`Fetching chapters batch: offset=${offset}, limit=${limit}`)

      const response = await fetchWithRetry(
        `${API_BASE_URL}/manga/${mangaId}/feed?translatedLanguage[]=en&order[chapter]=desc&limit=${limit}&offset=${offset}`,
        { headers },
      )

      const data = await response.json()
      const chapters = data.data

      // Get the total number of chapters from the first response
      if (offset === 0) {
        totalChapters = data.total || 0
        logger.info(`Total chapters available: ${totalChapters}`)
      }

      // Add this batch to our collection
      allChapters = [...allChapters, ...chapters]
      totalFetched += chapters.length

      // Report progress if callback is provided
      if (progressCallback && totalChapters > 0) {
        const progress = Math.min(Math.round((totalFetched / totalChapters) * 100), 100)
        progressCallback(progress)
      }

      logger.debug(`Fetched ${chapters.length} chapters, total so far: ${totalFetched}/${totalChapters}`)

      // Check if we need to fetch more chapters
      if (chapters.length < limit || totalFetched >= totalChapters) {
        hasMoreChapters = false
      } else {
        // Prepare for next batch
        offset += limit

        // Add a small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 300))
      }
    }

    logger.debug(`Chapter list for manga ID ${mangaId} fetched successfully`, { count: allChapters.length })
    return allChapters
  } catch (error) {
    logger.error(`Error in getChapterList for manga ID ${mangaId}`, error)
    throw error
  }
}

export async function getChapterById(chapterId: string): Promise<Chapter> {
  logger.info(`Fetching chapter by ID: ${chapterId}`)
  try {
    const headers = await getAuthHeaders()
    const response = await fetchWithRetry(`${API_BASE_URL}/chapter/${chapterId}`, { headers })

    const data = await response.json()
    logger.debug(`Chapter with ID ${chapterId} fetched successfully`)
    return data.data
  } catch (error) {
    logger.error(`Error in getChapterById for ID ${chapterId}`, error)
    throw error
  }
}

export async function getChapterPages(chapterId: string): Promise<ChapterData> {
  logger.info(`Fetching pages for chapter ID: ${chapterId}`)
  try {
    const headers = await getAuthHeaders()
    const response = await fetchWithRetry(`${API_BASE_URL}/at-home/server/${chapterId}`, { headers })

    const data = await response.json()
    logger.debug(`Pages for chapter ID ${chapterId} fetched successfully`, {
      baseUrl: data.baseUrl,
      hash: data.chapter.hash,
      pageCount: data.chapter.data.length,
    })
    return data
  } catch (error) {
    logger.error(`Error in getChapterPages for chapter ID ${chapterId}`, error)
    throw error
  }
}

// Update the getCoverImageUrl function to use our proxy
export function getCoverImageUrl(manga: Manga): string {
  try {
    const coverRelationship = manga.relationships.find((rel) => rel.type === "cover_art")

    if (!coverRelationship || !coverRelationship.attributes) {
      logger.warn(`No cover art found for manga ID ${manga.id}`)
      return "/placeholder.svg?height=320&width=240"
    }

    const filename = coverRelationship.attributes.fileName
    // Use a more direct URL format for covers
    const originalUrl = `https://uploads.mangadex.org/covers/${manga.id}/${filename}`
    logger.debug(`Cover image URL for manga ID ${manga.id}`, { url: originalUrl })
    return `/api/manga-image?url=${encodeURIComponent(originalUrl)}`
  } catch (error) {
    logger.error(`Error in getCoverImageUrl for manga ID ${manga.id}`, error)
    return "/placeholder.svg?height=320&width=240"
  }
}

export function getAuthorName(manga: Manga): string {
  try {
    const authorRelationship = manga.relationships.find((rel) => rel.type === "author")

    if (!authorRelationship || !authorRelationship.attributes) {
      logger.warn(`No author found for manga ID ${manga.id}`)
      return "Unknown Author"
    }

    return authorRelationship.attributes.name
  } catch (error) {
    logger.error(`Error in getAuthorName for manga ID ${manga.id}`, error)
    return "Unknown Author"
  }
}

export function getTitle(manga: Manga): string {
  try {
    const titles = manga.attributes.title
    return titles.en || titles[Object.keys(titles)[0]] || "Unknown Title"
  } catch (error) {
    logger.error(`Error in getTitle for manga ID ${manga.id}`, error)
    return "Unknown Title"
  }
}

export function getDescription(manga: Manga): string {
  try {
    const descriptions = manga.attributes.description
    return descriptions.en || descriptions[Object.keys(descriptions)[0]] || "No description available."
  } catch (error) {
    logger.error(`Error in getDescription for manga ID ${manga.id}`, error)
    return "No description available."
  }
}

export function getChapterNumber(chapter: Chapter): string {
  try {
    return chapter.attributes.chapter || "N/A"
  } catch (error) {
    logger.error(`Error in getChapterNumber for chapter ID ${chapter.id}`, error)
    return "N/A"
  }
}

export function getChapterTitle(chapter: Chapter): string {
  try {
    return chapter.attributes.title || `Chapter ${getChapterNumber(chapter)}`
  } catch (error) {
    logger.error(`Error in getChapterTitle for chapter ID ${chapter.id}`, error)
    return "Unknown Chapter"
  }
}

export function getAdjacentChapters(
  chapters: Chapter[],
  currentChapterId: string,
): {
  prev: Chapter | null
  next: Chapter | null
} {
  try {
    const currentIndex = chapters.findIndex((ch) => ch.id === currentChapterId)

    if (currentIndex === -1) {
      logger.warn(`Chapter ID ${currentChapterId} not found in chapter list`)
      return { prev: null, next: null }
    }

    const prev = currentIndex < chapters.length - 1 ? chapters[currentIndex + 1] : null
    const next = currentIndex > 0 ? chapters[currentIndex - 1] : null

    logger.debug(`Adjacent chapters for chapter ID ${currentChapterId}`, {
      prevId: prev?.id,
      nextId: next?.id,
    })

    return { prev, next }
  } catch (error) {
    logger.error(`Error in getAdjacentChapters for chapter ID ${currentChapterId}`, error)
    return { prev: null, next: null }
  }
}

