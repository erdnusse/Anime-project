import logger from "./logger"

// Types for bookmarks
export interface Bookmark {
  id: string
  userId: string
  mangaId: string
  createdAt: string
}

// Function to add a bookmark
export async function addBookmark(mangaId: string): Promise<Bookmark | null> {
  try {
    const response = await fetch("/api/bookmarks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mangaId,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      logger.error("Failed to add bookmark", error)
      return null
    }

    const data = await response.json()
    return data.bookmark
  } catch (error) {
    logger.error("Error adding bookmark", error)
    return null
  }
}

// Function to remove a bookmark
export async function removeBookmark(mangaId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/bookmarks?mangaId=${mangaId}`, {
      method: "DELETE",
    })

    if (!response.ok) {
      const error = await response.json()
      logger.error("Failed to remove bookmark", error)
      return false
    }

    return true
  } catch (error) {
    logger.error("Error removing bookmark", error)
    return false
  }
}

// Function to get all bookmarks
export async function getBookmarks(): Promise<Bookmark[]> {
  try {
    const response = await fetch("/api/bookmarks", {
      method: "GET",
    })

    if (!response.ok) {
      const error = await response.json()
      logger.error("Failed to get bookmarks", error)
      return []
    }

    const data = await response.json()
    return data.bookmarks || []
  } catch (error) {
    logger.error("Error getting bookmarks", error)
    return []
  }
}

// Function to check if a manga is bookmarked
export function isMangaBookmarked(mangaId: string, bookmarks: Bookmark[]): boolean {
  return bookmarks.some((bookmark) => bookmark.mangaId === mangaId)
}

