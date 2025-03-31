import axios from "axios"
import logger from "./logger"

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
 * Make an API request using axios
 */
async function apiRequest<T>(
  path: string,
  params: Record<string, any> = {},
  method: "GET" | "POST" = "GET",
  data?: any,
): Promise<T> {
  const url = buildApiUrl(path)

  try {
    logger.debug(`Making ${method} request to ${url}`, { params })

    const response = await axios({
      method,
      url,
      params: method === "GET" ? { params: JSON.stringify(params) } : undefined,
      data: method === "POST" ? data : undefined,
    })

    return response.data
  } catch (error: any) {
    // Add more context to the error
    if (error.response) {
      logger.error(`API error: ${error.response.status} ${error.response.statusText}`, error.response.data)
      throw new Error(`API request failed: ${error.response.status} ${error.response.statusText}`)
    } else if (error.request) {
      logger.error(`No response received from API`, error)
      throw new Error(`No response received from API: ${error.message}`)
    } else {
      logger.error(`Error setting up request: ${error.message}`, error)
      throw new Error(`Error setting up request: ${error.message}`)
    }
  }
}

export async function getFeaturedManga(): Promise<Manga> {
  logger.info("Fetching featured manga")
  try {
    const data = await apiRequest<any>("/manga", {
      includes: ["cover_art", "author"],
      order: { followedCount: "desc" },
      limit: 1,
    })

    logger.debug("Featured manga fetched successfully", { id: data.data[0]?.id })

    // If we have a manga, fetch its cover art separately
    if (data.data && data.data.length > 0) {
      const manga = data.data[0]
      const coverRel = manga.relationships.find((rel: Relationship) => rel.type === "cover_art")

      if (coverRel) {
        try {
          // Fetch the cover art details separately
          const coverData = await apiRequest<any>(`/cover/${coverRel.id}`)

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

    // Add a small delay before making the request to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500))

    // Make the request
    const data = await apiRequest<any>("/manga", params)

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
            const coverData = await apiRequest<any>(`/cover/${coverRel.id}`)

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

// Update the searchManga function to use axios and direct API URL format
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

  try {
    // Create a direct API request using axios
    const response = await axios({
      method: "GET",
      url: `${API_BASE_URL}`,
      params: {
        path: "/manga",
        params: JSON.stringify({
          title: query,
          limit,
          offset,
          includes: ["cover_art", "author"],
          availableTranslatedLanguage: ["en"],
          contentRating: ["safe", "suggestive"],
          order: { relevance: "desc" },
        }),
      },
    })

    const data = response.data

    logger.debug(`Manga search for "${query}" completed successfully`, {
      count: data.data.length,
      total: data.total,
      limit: data.limit,
      offset: data.offset,
    })

    // For each manga, fetch its cover art details separately
    const mangaWithCovers = await Promise.all(
      data.data.map(async (manga: Manga) => {
        const coverRel = manga.relationships.find((rel: Relationship) => rel.type === "cover_art")

        if (coverRel) {
          try {
            // Fetch the cover art details
            const coverResponse = await axios({
              method: "GET",
              url: `${API_BASE_URL}`,
              params: {
                path: `/cover/${coverRel.id}`,
              },
            })

            const coverData = coverResponse.data

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

    return {
      results: mangaWithCovers,
      total: data.total || mangaWithCovers.length,
      limit: data.limit || limit,
      offset: data.offset || offset,
    }
  } catch (error) {
    logger.error(`Error in searchManga for "${query}"`, error)
    throw error
  }
}

export async function getMangaById(id: string): Promise<Manga> {
  logger.info(`Fetching manga by ID: ${id}`)
  try {
    // Make the request
    const data = await apiRequest<any>(`/manga/${id}`, {
      includes: ["cover_art", "author", "artist"],
    })

    logger.debug(`Manga with ID ${id} fetched successfully`)

    // Get the manga
    const manga = data.data

    // Fetch cover art details separately
    const coverRel = manga.relationships.find((rel: Relationship) => rel.type === "cover_art")

    if (coverRel) {
      try {
        // Fetch the cover art details
        const coverData = await apiRequest<any>(`/cover/${coverRel.id}`)

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

      const data = await apiRequest<any>(`/manga/${mangaId}/feed`, {
        translatedLanguage: ["en"],
        order: { chapter: "desc" },
        limit,
        offset,
      })

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
    const data = await apiRequest<any>(`/chapter/${chapterId}`)
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
    const data = await apiRequest<any>(`/at-home/server/${chapterId}`)
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

