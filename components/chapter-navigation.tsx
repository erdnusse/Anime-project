"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, List } from "lucide-react"
import Link from "next/link"
import { getAdjacentChapters } from "@/lib/api"
import logger from "@/lib/logger"
import type { Chapter } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"

export default function ChapterNavigation({
  mangaId,
  chapterId,
}: {
  mangaId: string
  chapterId: string
}) {
  const [prevChapter, setPrevChapter] = useState<Chapter | null>(null)
  const [nextChapter, setNextChapter] = useState<Chapter | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadNavigation() {
      try {
        setLoading(true)
        setError(null)
        logger.info(`Loading navigation for manga ID: ${mangaId}, chapter ID: ${chapterId}`)

        // Use the updated getAdjacentChapters function
        const { prev, next } = await getAdjacentChapters(mangaId, chapterId)

        setPrevChapter(prev)
        setNextChapter(next)
        setLoading(false)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error"
        logger.error(`Failed to load navigation for manga ID: ${mangaId}, chapter ID: ${chapterId}`, err)
        setError(errorMessage)
        setLoading(false)
      }
    }

    loadNavigation()
  }, [mangaId, chapterId])

  if (loading) {
    return <Skeleton className="h-9 w-[200px]" />
  }

  // Even if there's an error, we can still show the navigation with disabled buttons
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" disabled={!prevChapter} asChild={!!prevChapter}>
        {prevChapter ? (
          <Link href={`/manga/${mangaId}/chapter/${prevChapter.id}`}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Prev
          </Link>
        ) : (
          <>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Prev
          </>
        )}
      </Button>

      <Button variant="outline" size="sm" asChild>
        <Link href={`/manga/${mangaId}`}>
          <List className="h-4 w-4 mr-1" />
          Chapters
        </Link>
      </Button>

      <Button variant="outline" size="sm" disabled={!nextChapter} asChild={!!nextChapter}>
        {nextChapter ? (
          <Link href={`/manga/${mangaId}/chapter/${nextChapter.id}`}>
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Link>
        ) : (
          <>
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </>
        )}
      </Button>
    </div>
  )
}

