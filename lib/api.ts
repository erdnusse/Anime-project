import logger from "./logger"
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

// Define a type for relationship objects
export interface Relationship {
  id: string
  type: string
  attributes?: any
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
  relationships: Array<Relationship>
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
const API_BASE_URL = "/api/mangadex-proxy"

// Check if we're in a browser environment
const isBrowser = typeof window !== "undefined"

// Default retry options for API requests
const DEFAULT_RETRY_OPTIONS = {
  maxRetries: 3,
  initialDelay: 2000, // Increase initial delay to 2 seconds
  maxDelay: 30000, // Increase max delay to 30 seconds
  factor: 2, // Double the delay each time
  jitter: true, // Add randomness to prevent thundering herd
  retryCondition: (error: any) => {
    // Always retry on rate limit errors
    if (error.status === 429) {
      return true
    }

    // Only retry on network errors or 5xx server errors
    if (error.status && error.status >= 400 && error.status < 500) {
      return false // Don't retry other client errors
    }
    return true // Retry on network errors and 5xx
  },
}

/**
 * Helper function to build a URL with query parameters
 * This version uses a simpler approach to avoid encoding issues
 */
function buildApiUrl(path: string, params: Record<string, any> = {}): string {
  // Start with the base path
  let apiPath = path.startsWith("/") ? path : `/${path}`

  // Add query parameters if any
  if (Object.keys(params).length > 0) {
    const queryParams: string[] = []

    // Build query parameters manually
    for (const [key, value] of Object.entries(params)) {
      if (key === "includes" && Array.isArray(value)) {
        // Handle the special 'includes' parameter
        for (const item of value) {
          queryParams.push(`includes[]=${item}`)
        }
      } else if (Array.isArray(value)) {
        // Handle other array values
        for (const item of value) {
          queryParams.push(`${key}=${item}`)
        }
      } else {
        // Handle regular values
        queryParams.push(`${key}=${value}`)
      }
    }

    // Add the query string to the path
    apiPath += apiPath.includes("?") ? "&" : "?"
    apiPath += queryParams.join("&")
  }

  // Return the full URL without encoding the path
  // The proxy route will handle the path as-is
  return `${API_BASE_URL}?path=${apiPath}`
}

/**
 * Fetch with retry and proper error handling
 */
async function fetchWithRetry(
  path: string,
  params: Record<string, any> = {},
  options?: RequestInit,
): Promise<Response> {
  const url = buildApiUrl(path, params)

  return retryWithBackoff(async () => {
    try {
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
    } catch (error: any) {
      // Add more context to the error
      error.message = `Error fetching ${url}: ${error.message}`
      throw error
    }
  }, DEFAULT_RETRY_OPTIONS)
}

export async function getFeaturedManga(): Promise<Manga> {
  logger.info("Fetching featured manga")
  try {
    const response = await fetchWithRetry("/manga", {
      includes: ["cover_art", "author"],
      "order[followedCount]": "desc",
      limit: 1,
    })

    const data = await response.json()
    logger.debug("Featured manga fetched successfully", { id: data.data[0]?.id })

    // If we have a manga, fetch its cover art separately
    if (data.data && data.data.length > 0) {
      const manga = data.data[0]
      const coverRel = manga.relationships.find((rel: Relationship) => rel.type === "cover_art")

      if (coverRel) {
        try {
          // Fetch the cover art details separately
          const coverResponse = await fetchWithRetry(`/cover/${coverRel.id}`)
          const coverData = await coverResponse.json()

          // Replace the cover_art relationship with the full data
          const coverIndex = manga.relationships.findIndex((rel: Relationship) => rel.type === "cover_art")
          if (coverIndex >= 0 && coverData.data) {
            manga.relationships[coverIndex] = coverData.data
          }
        } catch (coverError) {
          logger.error(`Error fetching cover details for featured manga`, coverError)
        }
      }

      return manga
    }

    return data.data[0]
  } catch (error) {
    logger.error("Error in getFeaturedManga", error)
    throw error
  }
}

export async function getMangaList(type: string, limit = 20): Promise<Manga[]> {
  logger.info(`Fetching manga list: ${type}, limit: ${limit}`)
  try {
    // Build params object
    const params: Record<string, any> = {
      limit,
      includes: ["cover_art", "author"], // Use the new format with array
    }

    // Add order parameter based on type
    switch (type) {
      case "popular":
        params["order[followedCount]"] = "desc"
        break
      case "latest":
        params["order[updatedAt]"] = "desc"
        break
      case "new":
        params["order[createdAt]"] = "desc"
        break
      default:
        params["order[relevance]"] = "desc"
    }

    // Add a small delay before making the request to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Make the request
    const response = await fetchWithRetry("/manga", params)

    const data = await response.json()

    // Add detailed logging
    logger.debug(`Manga list (${type}) fetched successfully`, {
      count: data.data.length,
      firstMangaId: data.data[0]?.id,
      hasRelationships: !!data.data[0]?.relationships,
      relationshipsCount: data.data[0]?.relationships?.length,
    })

    // Check if cover art is included
    const firstManga = data.data[0]
    if (firstManga) {
      const coverArtRel = firstManga.relationships?.find((rel: Relationship) => rel.type === "cover_art")
      logger.debug("First manga cover art relationship:", coverArtRel)
    }

    // For each manga, fetch its cover art details separately
    const mangaWithCovers = await Promise.all(
      data.data.map(async (manga: Manga) => {
        const coverRel = manga.relationships.find((rel: Relationship) => rel.type === "cover_art")

        if (coverRel) {
          try {
            // Fetch the cover art details
            const coverResponse = await fetchWithRetry(`/cover/${coverRel.id}`)
            const coverData = await coverResponse.json()

            // Add the fileName directly to the cover_art relationship attributes
            if (coverData.data && coverData.data.attributes) {
              const coverIndex = manga.relationships.findIndex((rel: Relationship) => rel.type === "cover_art")
              if (coverIndex >= 0) {
                manga.relationships[coverIndex].attributes = coverData.data.attributes
              }
            }
          } catch (coverError) {
            logger.error(`Error fetching cover details for manga ${manga.id}`, coverError)
          }
        }

        return manga
      }),
    )

    return mangaWithCovers
  } catch (error) {
    logger.error(`Error in getMangaList (${type})`, error)
    throw error
  }
}

export async function searchManga(query: string): Promise<Manga[]> {
  logger.info(`Searching manga with query: ${query}`)
  try {
    const response = await fetchWithRetry("/manga", {
      title: query,
      includes: ["cover_art", "author"],
      limit: 20,
    })

    const data = await response.json()
    logger.debug(`Manga search for "${query}" completed successfully`, { count: data.data.length })

    // For each manga, fetch its cover art details separately
    const mangaWithCovers = await Promise.all(
      data.data.map(async (manga: Manga) => {
        const coverRel = manga.relationships.find((rel: Relationship) => rel.type === "cover_art")

        if (coverRel) {
          try {
            // Fetch the cover art details
            const coverResponse = await fetchWithRetry(`/cover/${coverRel.id}`)
            const coverData = await coverResponse.json()

            // Add the fileName directly to the cover_art relationship attributes
            if (coverData.data && coverData.data.attributes) {
              const coverIndex = manga.relationships.findIndex((rel: Relationship) => rel.type === "cover_art")
              if (coverIndex >= 0) {
                manga.relationships[coverIndex].attributes = coverData.data.attributes
              }
            }
          } catch (coverError) {
            logger.error(`Error fetching cover details for manga ${manga.id}`, coverError)
          }
        }

        return manga
      }),
    )

    return mangaWithCovers
  } catch (error) {
    logger.error(`Error in searchManga for "${query}"`, error)
    throw error
  }
}

export async function getMangaById(id: string): Promise<Manga> {
  logger.info(`Fetching manga by ID: ${id}`)
  try {
    // Make separate requests to avoid parameter overriding
    const response = await fetchWithRetry(`/manga/${id}`, {
      includes: ["cover_art", "author", "artist"],
    })

    const data = await response.json()
    logger.debug(`Manga with ID ${id} fetched successfully`)

    // Get the manga
    const manga = data.data

    // Fetch cover art details separately
    const coverRel = manga.relationships.find((rel: Relationship) => rel.type === "cover_art")

    if (coverRel) {
      try {
        // Fetch the cover art details
        const coverResponse = await fetchWithRetry(`/cover/${coverRel.id}`)
        const coverData = await coverResponse.json()

        // Add the fileName directly to the cover_art relationship attributes
        if (coverData.data && coverData.data.attributes) {
          const coverIndex = manga.relationships.findIndex((rel: Relationship) => rel.type === "cover_art")
          if (coverIndex >= 0) {
            manga.relationships[coverIndex].attributes = coverData.data.attributes
          }
        }
      } catch (coverError) {
        logger.error(`Error fetching cover details for manga ${manga.id}`, coverError)
      }
    }

    return manga
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
    let allChapters: Chapter[] = []
    let offset = 0
    let hasMoreChapters = true
    let totalChapters = 0
    let totalFetched = 0
    const limit = 100 // Number of chapters per request

    // Loop until we've fetched all chapters
    while (hasMoreChapters) {
      logger.info(`Fetching chapters batch: offset=${offset}, limit=${limit}`)

      const response = await fetchWithRetry(`/manga/${mangaId}/feed`, {
        "translatedLanguage[]": "en", // Use string instead of array
        "order[chapter]": "desc",
        limit,
        offset,
      })

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

    // Sort chapters by chapter number in descending order
    allChapters.sort((a, b) => {
      // Convert chapter numbers to numeric values for proper sorting
      const aNum = a.attributes.chapter ? Number.parseFloat(a.attributes.chapter) : 0
      const bNum = b.attributes.chapter ? Number.parseFloat(b.attributes.chapter) : 0

      // Sort in descending order (newest first)
      return bNum - aNum
    })

    // Remove duplicate chapters by ID
    const uniqueChapters = Array.from(new Map(allChapters.map((chapter) => [chapter.id, chapter])).values())

    logger.debug(`Chapter list for manga ID ${mangaId} fetched successfully`, {
      count: uniqueChapters.length,
      originalCount: allChapters.length,
      duplicatesRemoved: allChapters.length - uniqueChapters.length,
    })

    return uniqueChapters
  } catch (error) {
    logger.error(`Error in getChapterList for manga ID ${mangaId}`, error)
    throw error
  }
}

export async function getChapterById(chapterId: string): Promise<Chapter> {
  logger.info(`Fetching chapter by ID: ${chapterId}`)
  try {
    const response = await fetchWithRetry(`/chapter/${chapterId}`)

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
    const response = await fetchWithRetry(`/at-home/server/${chapterId}`)

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
    logger.debug(`Getting cover image for manga ID ${manga.id}`, {
      relationshipsCount: manga.relationships?.length || 0,
    })

    const coverRelationship = manga.relationships.find((rel: Relationship) => rel.type === "cover_art")

    if (coverRelationship) {
      logger.debug(`Found cover relationship for manga ID ${manga.id}`, {
        hasAttributes: !!coverRelationship.attributes,
        attributesKeys: coverRelationship.attributes ? Object.keys(coverRelationship.attributes) : [],
      })
    }

    if (!coverRelationship || !coverRelationship.attributes) {
      logger.warn(`No cover art found for manga ID ${manga.id}`, {
        relationshipTypes: manga.relationships.map((r: Relationship) => r.type).join(", "),
      })
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
    const authorRelationship = manga.relationships.find((rel: Relationship) => rel.type === "author")

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

