import logger from "./logger"

// Types for reading progress
export interface ReadingProgress {
  id: string
  userId: string
  mangaId: string
  chapterId: string
  readAt: string
  progress: number
}

// Function to mark a chapter as read
export async function markChapterAsRead(
  mangaId: string,
  chapterId: string,
  progress = 100,
): Promise<ReadingProgress | null> {
  try {
    const response = await fetch("/api/reading-progress", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mangaId,
        chapterId,
        progress,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      logger.error("Failed to mark chapter as read", error)
      return null
    }

    const data = await response.json()
    return data.readingProgress
  } catch (error) {
    logger.error("Error marking chapter as read", error)
    return null
  }
}

// Function to get reading progress for a manga
export async function getMangaReadingProgress(mangaId: string): Promise<ReadingProgress[]> {
  try {
    const response = await fetch(`/api/reading-progress?mangaId=${mangaId}`, {
      method: "GET",
    })

    if (!response.ok) {
      const error = await response.json()
      logger.error("Failed to get reading progress", error)
      return []
    }

    const data = await response.json()
    return data.readingHistory || []
  } catch (error) {
    logger.error("Error getting reading progress", error)
    return []
  }
}

// Function to remove reading progress for a chapter
export async function removeReadingProgress(chapterId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/reading-progress?chapterId=${chapterId}`, {
      method: "DELETE",
    })

    if (!response.ok) {
      const error = await response.json()
      logger.error("Failed to remove reading progress", error)
      return false
    }

    return true
  } catch (error) {
    logger.error("Error removing reading progress", error)
    return false
  }
}

// Function to check if a chapter has been read
export function isChapterRead(chapterId: string, readingHistory: ReadingProgress[]): boolean {
  return readingHistory.some((item) => item.chapterId === chapterId)
}

// Function to get the last read chapter for a manga
export function getLastReadChapter(readingHistory: ReadingProgress[]): ReadingProgress | null {
  if (readingHistory.length === 0) return null

  // Sort by readAt in descending order and return the first item
  return readingHistory.sort((a, b) => new Date(b.readAt).getTime() - new Date(a.readAt).getTime())[0]
}

