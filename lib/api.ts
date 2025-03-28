import logger from "./logger"
import authService from "./auth-service"

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

export async function getFeaturedManga(): Promise<Manga> {
  logger.info("Fetching featured manga")
  try {
    const headers = await getAuthHeaders()

    // For simplicity, we'll just get a random popular manga
    const response = await fetch(
      `${API_BASE_URL}/manga?includes[]=cover_art&includes[]=author&order[followedCount]=desc&limit=1`,
      { headers },
    )

    if (!response.ok) {
      const errorText = await response.text()
      logger.error(`Failed to fetch featured manga: ${response.status} ${response.statusText}`, errorText)
      throw new Error(`Failed to fetch featured manga: ${response.status} ${response.statusText}`)
    }

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

    const response = await fetch(url, { headers })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error(`Failed to fetch manga list (${type}): ${response.status} ${response.statusText}`, errorText)
      throw new Error(`Failed to fetch manga list: ${type}`)
    }

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
    const response = await fetch(
      `${API_BASE_URL}/manga?title=${encodeURIComponent(query)}&includes[]=cover_art&includes[]=author&limit=20`,
      { headers },
    )

    if (!response.ok) {
      const errorText = await response.text()
      logger.error(`Failed to search manga: ${response.status} ${response.statusText}`, errorText)
      throw new Error("Failed to search manga")
    }

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
    const response = await fetch(
      `${API_BASE_URL}/manga/${id}?includes[]=cover_art&includes[]=author&includes[]=artist`,
      { headers },
    )

    if (!response.ok) {
      const errorText = await response.text()
      logger.error(`Failed to fetch manga with ID ${id}: ${response.status} ${response.statusText}`, errorText)
      throw new Error(`Failed to fetch manga with ID: ${id}`)
    }

    const data = await response.json()
    logger.debug(`Manga with ID ${id} fetched successfully`)
    return data.data
  } catch (error) {
    logger.error(`Error in getMangaById for ID ${id}`, error)
    throw error
  }
}

export async function getChapterList(mangaId: string): Promise<Chapter[]> {
  logger.info(`Fetching chapter list for manga ID: ${mangaId}`)
  try {
    const headers = await getAuthHeaders()
    const response = await fetch(
      `${API_BASE_URL}/manga/${mangaId}/feed?translatedLanguage[]=en&order[chapter]=desc&limit=100`,
      { headers },
    )

    if (!response.ok) {
      const errorText = await response.text()
      logger.error(
        `Failed to fetch chapters for manga ID ${mangaId}: ${response.status} ${response.statusText}`,
        errorText,
      )
      throw new Error(`Failed to fetch chapters for manga ID: ${mangaId}`)
    }

    const data = await response.json()
    logger.debug(`Chapter list for manga ID ${mangaId} fetched successfully`, { count: data.data.length })
    return data.data
  } catch (error) {
    logger.error(`Error in getChapterList for manga ID ${mangaId}`, error)
    throw error
  }
}

export async function getChapterById(chapterId: string): Promise<Chapter> {
  logger.info(`Fetching chapter by ID: ${chapterId}`)
  try {
    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE_URL}/chapter/${chapterId}`, { headers })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error(`Failed to fetch chapter with ID ${chapterId}: ${response.status} ${response.statusText}`, errorText)
      throw new Error(`Failed to fetch chapter with ID: ${chapterId}`)
    }

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
    const response = await fetch(`${API_BASE_URL}/at-home/server/${chapterId}`, { headers })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error(
        `Failed to fetch pages for chapter ID ${chapterId}: ${response.status} ${response.statusText}`,
        errorText,
      )
      throw new Error(`Failed to fetch pages for chapter ID: ${chapterId}`)
    }

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

