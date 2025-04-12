import { NetworkError, ApiError, RateLimitError, NotFoundError } from "./api-error"
import { useLogger } from "@/hooks/use-logger"
import axios, { type AxiosError } from "axios"
import logger from "./logger"
import cacheManager from "./cache-manager"

// Initialize logger outside the function to avoid conditional hook call
const loggerInstance = useLogger("api")

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

/**
 * Helper function to build a URL with query parameters
 */
function buildApiUrl(path: string): string {
  // Start with the base path
  const apiPath = path.startsWith("/") ? path : `/${path}`
  return `${API_BASE_URL}?path=${apiPath}`
}

/**
 * Make an API request using axios with caching and improved error handling
 */
async function apiRequest<T>(
  path: string,
  params: Record<string, any> = {},
  method: "GET" | "POST" = "GET",
  data?: any,
  cacheType?: string, // Simplified type to fix the TypeScript error
  forceFresh = false,
): Promise<T> {
  // Generate a cache key based on the request
  const cacheKey = `${path}_${JSON.stringify(params)}_${method}`

  // Check cache first if it's a GET request and we're not forcing fresh data
  if (method === "GET" && !forceFresh && cacheType) {
    const cachedData = cacheManager.get<T>(cacheKey, cacheType as any)
    if (cachedData) {
      return cachedData
    }
  }

  const url = buildApiUrl(path)

  try {
    logger.debug(`Making ${method} request to ${url}`, { params })

    const response = await axios({
      method,
      url,
      params: method === "GET" ? { params: JSON.stringify(params) } : undefined,
      data: method === "POST" ? data : undefined,
    })

    // Cache the response if it's a GET request
    if (method === "GET" && cacheType) {
      cacheManager.set(cacheKey, response.data, cacheType as any)
    }

    return response.data
  } catch (error: any) {
    // Enhanced error handling with specific error types
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError

      // Handle rate limiting (429 Too Many Requests)
      if (axiosError.response?.status === 429) {
        const retryAfter = Number.parseInt(
          axiosError.response.headers["retry-after"] || axiosError.response.headers["Retry-After"] || "60",
          10,
        )
        logger.warn(`Rate limit exceeded. Retry after ${retryAfter} seconds.`, {
          path,
          retryAfter,
        })
        throw new RateLimitError(
          `API rate limit exceeded. Please wait ${retryAfter} seconds before trying again.`,
          retryAfter,
        )
      }

      // Handle not found errors (404)
      if (axiosError.response?.status === 404) {
        logger.error(`Resource not found: ${path}`, axiosError.response.data)
        throw new NotFoundError(`The requested resource was not found: ${path}`)
      }

      // Handle other API errors with status codes
      if (axiosError.response) {
        logger.error(
          `API error: ${axiosError.response.status} ${axiosError.response.statusText}`,
          axiosError.response.data,
        )
        throw new ApiError(
          `API request failed: ${axiosError.response.status} ${axiosError.response.statusText}`,
          axiosError.response.status,
        )
      }

      // Handle network errors (no response)
      if (axiosError.request) {
        logger.error(`Network error: No response received from API`, axiosError)
        throw new NetworkError("No response received from API. Please check your internet connection.")
      }
    }

    // Handle other unexpected errors
    logger.error(`Unexpected error in API request: ${error.message}`, error)
    throw new Error(`Error in API request: ${error.message}`)
  }
}

// Wrap API functions with better error handling and prevent infinite loops

export async function getFeaturedManga(): Promise<Manga> {
  logger.info("Fetching featured manga")
  try {
    const data = await apiRequest<any>(
      "/manga",
      {
        includes: ["cover_art", "author"],
        order: { followedCount: "desc" },
        limit: 1,
      },
      "GET",
      undefined,
      "mangaDetails",
    )

    logger.debug("Featured manga fetched successfully", { id: data.data[0]?.id })

    // If we have a manga, fetch its cover art separately
    if (data.data && data.data.length > 0) {
      const manga = data.data[0]
      const coverRel = manga.relationships.find((rel: Relationship) => rel.type === "cover_art")

      if (coverRel) {
        try {
          // Fetch the cover art details separately
          const coverData = await apiRequest<any>(`/cover/${coverRel.id}`, {}, "GET", undefined, "coverImage")

          // Replace the cover_art relationship with the full data
          const coverIndex = manga.relationships.findIndex((rel: Relationship) => rel.type === "cover_art")
          if (coverIndex >= 0 && coverData.data) {
            manga.relationships[coverIndex] = coverData.data
          }
        } catch (coverError) {
          logger.error(`Error fetching cover details for featured manga`, coverError)
          // Continue without cover art rather than failing the whole request
        }
      }

      return manga
    }

    return data.data[0]
  } catch (error) {
    logger.error("Error in getFeaturedManga", error)
    throw error // Re-throw to be handled by the component
  }
}

export async function getMangaList(type: string, limit = 20): Promise<Manga[]> {
  logger.info(`Fetching manga list: ${type}, limit: ${limit}`)
  try {
    // Build params object
    const params: Record<string, any> = {
      limit,
      includes: ["cover_art", "author"],
    }

    // Add order parameter based on type
    switch (type) {
      case "popular":
        params.order = { followedCount: "desc" }
        break
      case "latest":
        params.order = { updatedAt: "desc" }
        break
      case "new":
        params.order = { createdAt: "desc" }
        break
      default:
        params.order = { relevance: "desc" }
    }

    // Make the request with caching
    const data = await apiRequest<any>("/manga", params, "GET", undefined, "mangaDetails")

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

    // Create a stable reference to the manga array to avoid dependency issues
    const mangaList = [...data.data]

    // For each manga, fetch its cover art details separately
    // Use Promise.allSettled to prevent one failure from affecting others
    const coverPromises = mangaList.map(async (manga: Manga, index: number) => {
      const coverRel = manga.relationships.find((rel: Relationship) => rel.type === "cover_art")

      if (coverRel) {
        try {
          // Fetch the cover art details with caching
          const coverData = await apiRequest<any>(`/cover/${coverRel.id}`, {}, "GET", undefined, "coverImage")

          // Return the updated manga with cover art
          if (coverData.data && coverData.data.attributes) {
            const coverIndex = manga.relationships.findIndex((rel: Relationship) => rel.type === "cover_art")
            if (coverIndex >= 0) {
              // Create a new relationships array to avoid mutating the original
              const updatedRelationships = [...manga.relationships]
              updatedRelationships[coverIndex] = {
                ...updatedRelationships[coverIndex],
                attributes: coverData.data.attributes,
              }

              // Return a new manga object with updated relationships
              return {
                ...manga,
                relationships: updatedRelationships,
              }
            }
          }
        } catch (coverError) {
          logger.error(`Error fetching cover details for manga ${manga.id}`, coverError)
          // Continue without cover art
        }
      }

      // Return the original manga if no updates were made
      return manga
    })

    const results = await Promise.allSettled(coverPromises)
    const mangaWithCovers = results.map((result, index) =>
      result.status === "fulfilled" ? result.value : mangaList[index],
    )

    return mangaWithCovers
  } catch (error) {
    logger.error(`Error in getMangaList (${type})`, error)
    throw error // Re-throw to be handled by the component
  }
}

// Update the searchManga function with improved error handling
export async function searchManga(
  query: string,
  options: {
    limit?: number
    offset?: number
  } = {},
): Promise<{
  results: Manga[]
  total: number
  limit: number
  offset: number
}> {
  const limit = options.limit || 20
  const offset = options.offset || 0

  logger.info(`Searching manga with query: "${query}", limit: ${limit}, offset: ${offset}`)

  // Generate a cache key for this search
  const cacheKey = `search_${query}_${limit}_${offset}`

  // Check cache first
  const cachedResults = cacheManager.get<{
    results: Manga[]
    total: number
    limit: number
    offset: number
  }>(cacheKey, "searchResults")

  if (cachedResults) {
    logger.debug(`Using cached search results for "${query}"`)
    return cachedResults
  }

  try {
    // Use our enhanced apiRequest function instead of direct axios call
    const data = await apiRequest<any>(
      "/manga",
      {
        title: query,
        limit,
        offset,
        includes: ["cover_art", "author"],
        availableTranslatedLanguage: ["en"],
        contentRating: ["safe", "suggestive"],
        order: { relevance: "desc" },
      },
      "GET",
    )

    logger.debug(`Manga search for "${query}" completed successfully`, {
      count: data.data.length,
      total: data.total,
      limit: data.limit,
      offset: data.offset,
    })

    // Create a stable reference to the manga array
    const mangaList = [...data.data]

    // For each manga, fetch its cover art details separately using Promise.allSettled
    const coverPromises = mangaList.map(async (manga: Manga) => {
      const coverRel = manga.relationships.find((rel: Relationship) => rel.type === "cover_art")

      if (coverRel) {
        // Generate a cache key for this cover
        const coverCacheKey = `cover_${coverRel.id}`

        // Check cache first
        const cachedCover = cacheManager.get<any>(coverCacheKey, "coverImage")

        let coverData
        if (cachedCover) {
          coverData = cachedCover
        } else {
          try {
            // Fetch the cover art details using our enhanced apiRequest
            coverData = await apiRequest<any>(`/cover/${coverRel.id}`, {}, "GET")

            // Cache the cover data
            cacheManager.set(coverCacheKey, coverData, "coverImage")
          } catch (coverError) {
            logger.error(`Error fetching cover details for manga ${manga.id}`, coverError)
            // Continue without cover art
            return manga
          }
        }

        // Add the fileName directly to the cover_art relationship attributes
        if (coverData && coverData.data && coverData.data.attributes) {
          const coverIndex = manga.relationships.findIndex((rel: Relationship) => rel.type === "cover_art")
          if (coverIndex >= 0) {
            // Create a new relationships array to avoid mutating the original
            const updatedRelationships = [...manga.relationships]
            updatedRelationships[coverIndex] = {
              ...updatedRelationships[coverIndex],
              attributes: coverData.data.attributes,
            }

            // Return a new manga object with updated relationships
            return {
              ...manga,
              relationships: updatedRelationships,
            }
          }
        }
      }

      // Return the original manga if no updates were made
      return manga
    })

    const results = await Promise.allSettled(coverPromises)
    const mangaWithCovers = results.map((result, index) =>
      result.status === "fulfilled" ? result.value : mangaList[index],
    )

    const result = {
      results: mangaWithCovers,
      total: data.total || mangaWithCovers.length,
      limit: data.limit || limit,
      offset: data.offset || offset,
    }

    // Cache the search results
    cacheManager.set(cacheKey, result, "searchResults")

    return result
  } catch (error) {
    logger.error(`Error in searchManga for "${query}"`, error)
    throw error // Re-throw to be handled by the component
  }
}

export async function getMangaById(id: string): Promise<Manga> {
  logger.info(`Fetching manga by ID: ${id}`)
  try {
    // Check cache first
    const cacheKey = `manga_${id}`
    const cachedManga = cacheManager.get<Manga>(cacheKey, "mangaDetails")

    if (cachedManga) {
      logger.debug(`Using cached manga details for ID: ${id}`)
      return cachedManga
    }

    // Make the request
    const data = await apiRequest<any>(
      `/manga/${id}`,
      {
        includes: ["cover_art", "author", "artist"],
      },
      "GET",
      undefined,
      "mangaDetails",
    )

    logger.debug(`Manga with ID ${id} fetched successfully`)

    // Get the manga
    const manga = data.data

    // Fetch cover art details separately
    const coverRel = manga.relationships.find((rel: Relationship) => rel.type === "cover_art")

    if (coverRel) {
      try {
        // Fetch the cover art details
        const coverData = await apiRequest<any>(`/cover/${coverRel.id}`, {}, "GET", undefined, "coverImage")

        // Add the fileName directly to the cover_art relationship attributes
        if (coverData.data && coverData.data.attributes) {
          // Create a new manga object with updated relationships to avoid mutation
          const coverIndex = manga.relationships.findIndex((rel: Relationship) => rel.type === "cover_art")
          if (coverIndex >= 0) {
            const updatedRelationships = [...manga.relationships]
            updatedRelationships[coverIndex] = {
              ...updatedRelationships[coverIndex],
              attributes: coverData.data.attributes,
            }

            manga.relationships = updatedRelationships
          }
        }
      } catch (coverError) {
        logger.error(`Error fetching cover details for manga ${manga.id}`, coverError)
        // Continue without cover art
      }
    }

    // Cache the manga details
    cacheManager.set(cacheKey, manga, "mangaDetails")

    return manga
  } catch (error) {
    logger.error(`Error in getMangaById for ID ${id}`, error)
    throw error // Re-throw to be handled by the component
  }
}

// Update the getChapterList function with improved error handling
export async function getChapterList(
  mangaId: string,
  options: {
    limit?: number
    offset?: number
    progressCallback?: (progress: number) => void
    forceFresh?: boolean
  } = {},
): Promise<{
  chapters: Chapter[]
  total: number
  currentPage: number
  totalPages: number
}> {
  const { limit = 20, offset = 0, progressCallback, forceFresh = false } = options

  logger.info(`Fetching chapter list for manga ID: ${mangaId} (limit: ${limit}, offset: ${offset})`)

  // Check cache first if not forcing fresh data
  if (!forceFresh) {
    const cacheKey = `chapters_${mangaId}_${limit}_${offset}`
    const cachedChapters = cacheManager.get<{
      chapters: Chapter[]
      total: number
      currentPage: number
      totalPages: number
    }>(cacheKey, "chapterList")

    if (cachedChapters) {
      logger.debug(`Using cached chapter list for manga ID: ${mangaId} (page: ${offset / limit + 1})`)

      // Still call the progress callback with 100% if provided
      if (progressCallback) {
        progressCallback(100)
      }

      return cachedChapters
    }
  }

  try {
    // First, get the total count with a minimal request
    const countData = await apiRequest<any>(
      `/manga/${mangaId}/feed`,
      {
        translatedLanguage: ["en"],
        limit: 1,
        offset: 0,
      },
      "GET",
      undefined,
      undefined,
      forceFresh,
    )

    const totalChapters = countData.total || 0
    const totalPages = Math.ceil(totalChapters / limit)
    const currentPage = Math.floor(offset / limit) + 1

    logger.info(`Total chapters available: ${totalChapters}, pages: ${totalPages}, current: ${currentPage}`)

    // Now fetch the requested page
    const data = await apiRequest<any>(
      `/manga/${mangaId}/feed`,
      {
        translatedLanguage: ["en"],
        order: { chapter: "desc" },
        limit,
        offset,
      },
      "GET",
      undefined,
      undefined,
      forceFresh,
    )

    const chapters = data.data

    // Report progress if callback is provided
    if (progressCallback) {
      progressCallback(100)
    }

    logger.debug(`Fetched ${chapters.length} chapters for page ${currentPage}/${totalPages}`)

    // Sort chapters by chapter number in descending order
    chapters.sort((a: Chapter, b: Chapter) => {
      // Convert chapter numbers to numeric values for proper sorting
      const aNum = a.attributes.chapter ? Number.parseFloat(a.attributes.chapter) : 0
      const bNum = b.attributes.chapter ? Number.parseFloat(b.attributes.chapter) : 0

      // Sort in descending order (newest first)
      return bNum - aNum
    })

    const result = {
      chapters,
      total: totalChapters,
      currentPage,
      totalPages,
    }

    // Cache the paginated chapter list
    const cacheKey = `chapters_${mangaId}_${limit}_${offset}`
    cacheManager.set(cacheKey, result, "chapterList")

    return result
  } catch (error) {
    logger.error(`Error in getChapterList for manga ID ${mangaId}`, error)
    throw error // Re-throw to be handled by the component
  }
}

// Update the getAdjacentChapters function with improved error handling
export async function getAdjacentChapters(
  mangaId: string,
  currentChapterId: string,
): Promise<{
  prev: Chapter | null
  next: Chapter | null
}> {
  try {
    logger.info(`Finding adjacent chapters for chapter ID: ${currentChapterId}`)

    if (!mangaId || !currentChapterId) {
      logger.warn("Missing mangaId or currentChapterId in getAdjacentChapters")
      return { prev: null, next: null }
    }

    // First, get the current chapter to find its number
    const currentChapter = await getChapterById(currentChapterId)

    if (!currentChapter || !currentChapter.attributes) {
      logger.warn(`Could not find chapter with ID: ${currentChapterId}`)
      return { prev: null, next: null }
    }

    const currentChapterNumber = currentChapter.attributes.chapter
      ? Number.parseFloat(currentChapter.attributes.chapter)
      : 0

    // Find the previous chapter (higher number)
    const prevChapterData = await apiRequest<any>(
      `/manga/${mangaId}/feed`,
      {
        translatedLanguage: ["en"],
        order: { chapter: "asc" },
        limit: 1,
        offset: 0,
        // Find chapters with higher number
        chapter: [currentChapterNumber.toString(), "gt"],
      },
      "GET",
    )

    // Find the next chapter (lower number)
    const nextChapterData = await apiRequest<any>(
      `/manga/${mangaId}/feed`,
      {
        translatedLanguage: ["en"],
        order: { chapter: "desc" },
        limit: 1,
        offset: 0,
        // Find chapters with lower number
        chapter: [currentChapterNumber.toString(), "lt"],
      },
      "GET",
    )

    const prev = prevChapterData?.data?.length > 0 ? prevChapterData.data[0] : null
    const next = nextChapterData?.data?.length > 0 ? nextChapterData.data[0] : null

    logger.debug(`Adjacent chapters for chapter ID ${currentChapterId}`, {
      prevId: prev?.id,
      nextId: next?.id,
    })

    return { prev, next }
  } catch (error) {
    logger.error(`Error in getAdjacentChapters for chapter ID ${currentChapterId}`, error)
    // Return empty result instead of throwing to prevent cascading failures
    return { prev: null, next: null }
  }
}

// Update getChapterById function with improved error handling
export async function getChapterById(chapterId: string): Promise<Chapter> {
  logger.info(`Fetching chapter by ID: ${chapterId}`)

  if (!chapterId) {
    logger.error("Chapter ID is undefined or empty")
    throw new Error("Chapter ID is required to fetch chapter details")
  }

  // Check cache first
  const cacheKey = `chapter_${chapterId}`
  const cachedChapter = cacheManager.get<Chapter>(cacheKey, "chapterList")

  if (cachedChapter) {
    logger.debug(`Using cached chapter details for ID: ${chapterId}`)
    return cachedChapter
  }

  try {
    const data = await apiRequest<any>(`/chapter/${chapterId}`, {}, "GET", undefined, "chapterList")

    logger.debug(`Chapter with ID ${chapterId} fetched successfully`)

    // Cache the chapter details
    cacheManager.set(cacheKey, data.data, "chapterList")

    return data.data
  } catch (error) {
    logger.error(`Error in getChapterById for ID ${chapterId}`, error)
    throw error // Re-throw to be handled by the component
  }
}

export async function getChapterPages(chapterId: string): Promise<ChapterData> {
  logger.info(`Fetching pages for chapter ID: ${chapterId}`)

  // Check if chapterId is undefined or empty
  if (!chapterId) {
    logger.error("Chapter ID is undefined or empty")
    throw new Error("Chapter ID is required to fetch pages")
  }

  // Check cache first
  const cacheKey = `pages_${chapterId}`
  const cachedPages = cacheManager.get<ChapterData>(cacheKey, "chapterPages")

  if (cachedPages) {
    logger.debug(`Using cached pages for chapter ID: ${chapterId}`)
    return cachedPages
  }

  try {
    const data = await apiRequest<any>(`/at-home/server/${chapterId}`, {}, "GET", undefined, "chapterPages")

    // Validate the response data
    if (!data || !data.chapter || !data.chapter.hash) {
      logger.error(`Invalid response data for chapter ID: ${chapterId}`, data)
      throw new Error("Invalid response data from MangaDex API")
    }

    logger.debug(`Pages for chapter ID ${chapterId} fetched successfully`, {
      baseUrl: data.baseUrl,
      hash: data.chapter.hash,
      pageCount: data.chapter.data.length,
    })

    // Cache the chapter pages
    cacheManager.set(cacheKey, data, "chapterPages")

    return data
  } catch (error) {
    logger.error(`Error in getChapterPages for chapter ID ${chapterId}`, error)
    throw error // Re-throw to be handled by the component
  }
}

// Update the getCoverImageUrl function with better error handling
export function getCoverImageUrl(manga: Manga): string {
  try {
    logger.debug(`Getting cover image for manga ID ${manga.id}`, {
      relationshipsCount: manga.relationships?.length || 0,
    })

    if (!manga || !manga.relationships) {
      logger.warn(`Invalid manga object or missing relationships`)
      return "/placeholder.svg?height=320&width=240"
    }

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
    logger.error(`Error in getCoverImageUrl for manga ID ${manga?.id || "unknown"}`, error)
    return "/placeholder.svg?height=320&width=240"
  }
}

// The remaining utility functions with defensive programming to prevent errors

export function getAuthorName(manga: Manga): string {
  try {
    if (!manga || !manga.relationships) {
      return "Unknown Author"
    }

    const authorRelationship = manga.relationships.find((rel: Relationship) => rel.type === "author")

    if (!authorRelationship || !authorRelationship.attributes) {
      logger.warn(`No author found for manga ID ${manga.id}`)
      return "Unknown Author"
    }

    return authorRelationship.attributes.name
  } catch (error) {
    logger.error(`Error in getAuthorName for manga ID ${manga?.id || "unknown"}`, error)
    return "Unknown Author"
  }
}

export function getTitle(manga: Manga): string {
  try {
    if (!manga || !manga.attributes || !manga.attributes.title) {
      return "Unknown Title"
    }

    const titles = manga.attributes.title
    return titles.en || titles[Object.keys(titles)[0]] || "Unknown Title"
  } catch (error) {
    logger.error(`Error in getTitle for manga ID ${manga?.id || "unknown"}`, error)
    return "Unknown Title"
  }
}

export function getDescription(manga: Manga): string {
  try {
    if (!manga || !manga.attributes || !manga.attributes.description) {
      return "No description available."
    }

    const descriptions = manga.attributes.description
    return descriptions.en || descriptions[Object.keys(descriptions)[0]] || "No description available."
  } catch (error) {
    logger.error(`Error in getDescription for manga ID ${manga?.id || "unknown"}`, error)
    return "No description available."
  }
}

export function getChapterNumber(chapter: Chapter): string {
  try {
    if (!chapter || !chapter.attributes) {
      return "N/A"
    }

    return chapter.attributes.chapter || "N/A"
  } catch (error) {
    logger.error(`Error in getChapterNumber for chapter ID ${chapter?.id || "unknown"}`, error)
    return "N/A"
  }
}

export function getChapterTitle(chapter: Chapter): string {
  try {
    if (!chapter || !chapter.attributes) {
      return "Unknown Chapter"
    }

    return chapter.attributes.title || `Chapter ${getChapterNumber(chapter)}`
  } catch (error) {
    logger.error(`Error in getChapterTitle for chapter ID ${chapter?.id || "unknown"}`, error)
    return "Unknown Chapter"
  }
}
