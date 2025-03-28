import JSZip from "jszip"
import { saveAs } from "file-saver"
import logger from "./logger"
import { type Chapter, getChapterPages, getChapterTitle, getChapterNumber } from "./api"

export interface DownloadProgress {
  mangaId: string
  mangaTitle: string
  totalChapters: number
  completedChapters: number
  currentChapter: {
    id: string
    title: string
    progress: number
    total: number
    completed: boolean
    error?: string
  } | null
  overallProgress: number
  isComplete: boolean
  error: string | null
}

export interface DownloadOptions {
  mangaId: string
  mangaTitle: string
  chapters: Chapter[]
  onProgress: (progress: DownloadProgress) => void
  onComplete: (zipBlob: Blob) => void
  onError: (error: string) => void
}

export async function downloadManga({
  mangaId,
  mangaTitle,
  chapters,
  onProgress,
  onComplete,
  onError,
}: DownloadOptions): Promise<void> {
  try {
    logger.info(`Starting download for manga: ${mangaTitle} (${mangaId})`)

    // Initialize progress
    const progress: DownloadProgress = {
      mangaId,
      mangaTitle,
      totalChapters: chapters.length,
      completedChapters: 0,
      currentChapter: null,
      overallProgress: 0,
      isComplete: false,
      error: null,
    }

    // Create a new zip file
    const zip = new JSZip()
    const mangaFolder = zip.folder(`${mangaTitle}`)

    if (!mangaFolder) {
      throw new Error("Failed to create manga folder in zip")
    }

    // Process chapters sequentially to avoid overwhelming the browser
    for (let i = 0; i < chapters.length; i++) {
      const chapter = chapters[i]
      const chapterNumber = getChapterNumber(chapter)
      const chapterTitle = getChapterTitle(chapter)
      const chapterFolderName = `Chapter ${chapterNumber} - ${chapterTitle}`

      // Update progress
      progress.currentChapter = {
        id: chapter.id,
        title: chapterTitle,
        progress: 0,
        total: 0,
        completed: false,
      }
      onProgress({ ...progress })

      try {
        logger.info(`Downloading chapter: ${chapterTitle} (${chapter.id})`)

        // Get chapter pages
        const chapterData = await getChapterPages(chapter.id)
        const pages = chapterData.chapter.data
        const baseUrl = chapterData.baseUrl
        const hash = chapterData.chapter.hash

        // Update progress with total pages
        progress.currentChapter.total = pages.length
        onProgress({ ...progress })

        // Create chapter folder
        const chapterFolder = mangaFolder.folder(chapterFolderName)
        if (!chapterFolder) {
          throw new Error(`Failed to create folder for chapter: ${chapterTitle}`)
        }

        // Download each page
        for (let j = 0; j < pages.length; j++) {
          const page = pages[j]
          const pageNumber = j + 1
          const pageUrl = `${baseUrl}/data/${hash}/${page}`
          const fileName = `${pageNumber.toString().padStart(3, "0")}.jpg`

          try {
            // Fetch the image through our proxy
            const proxyUrl = `/api/manga-image?url=${encodeURIComponent(pageUrl)}`
            const response = await fetch(proxyUrl)

            if (!response.ok) {
              throw new Error(`Failed to download page ${pageNumber}: ${response.statusText}`)
            }

            const blob = await response.blob()
            chapterFolder.file(fileName, blob)

            // Update page progress
            progress.currentChapter.progress = pageNumber
            progress.overallProgress = i / chapters.length + pageNumber / pages.length / chapters.length
            onProgress({ ...progress })

            // Add a small delay to prevent overwhelming the browser
            await new Promise((resolve) => setTimeout(resolve, 100))
          } catch (pageError) {
            logger.error(`Error downloading page ${pageNumber} of chapter ${chapterTitle}`, pageError)
            // Continue with next page despite error
          }
        }

        // Mark chapter as completed
        progress.currentChapter.completed = true
        progress.completedChapters++
        onProgress({ ...progress })
      } catch (chapterError) {
        logger.error(`Error downloading chapter: ${chapterTitle}`, chapterError)
        progress.currentChapter.error = chapterError instanceof Error ? chapterError.message : "Unknown error"
        onProgress({ ...progress })
      }
    }

    // Generate the zip file
    logger.info(`Generating zip file for manga: ${mangaTitle}`)
    progress.currentChapter = null
    progress.overallProgress = 0.95 // Almost done
    onProgress({ ...progress })

    const zipBlob = await zip.generateAsync(
      {
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      },
      (metadata) => {
        progress.overallProgress = 0.95 + (metadata.percent / 100) * 0.05
        onProgress({ ...progress })
      },
    )

    // Mark as complete
    progress.isComplete = true
    progress.overallProgress = 1
    onProgress({ ...progress })

    logger.info(`Download completed for manga: ${mangaTitle}`)
    onComplete(zipBlob)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred during download"
    logger.error(`Download failed for manga: ${mangaTitle}`, error)
    onError(errorMessage)
  }
}

export function downloadZip(blob: Blob, filename: string): void {
  saveAs(blob, `${filename}.zip`)
}

