"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { BookOpen, RefreshCw } from "lucide-react"
import { searchManga, getCoverImageUrl, getTitle, getDescription, type Manga } from "@/lib/api"
import logger from "@/lib/logger"
import { Skeleton } from "@/components/ui/skeleton"

export default function SearchResults({ query }: { query: string }) {
  const [results, setResults] = useState<Manga[]>([])
  const [error, setError] = useState<unknown | null>(null)
  const [loading, setLoading] = useState(true)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    async function fetchResults() {
      try {
        setLoading(true)
        setError(null)
        logger.info(`Searching for: "${query}"`)

        const data = await searchManga(query)
        setResults(data)
        logger.info(`Search results for "${query}": ${data.length} items found`)
      } catch (err) {
        setError(err)
        logger.error(`Error in search results for "${query}"`, err)
      } finally {
        setLoading(false)
      }
    }

    fetchResults()
  }, [query, retryCount])

  const handleRetry = () => {
    setRetryCount((prev) => prev + 1)
  }

  if (loading) {
    return <SearchResultsSkeleton />
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-2">Error searching for "{query}"</p>
        <p className="text-muted-foreground mb-4">Please try again</p>
        <Button onClick={handleRetry} className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No results found for "{query}"</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {results.map((manga) => {
        const title = getTitle(manga)
        const description = getDescription(manga)
        const coverUrl = getCoverImageUrl(manga)

        // Define the tag type based on the Manga interface
        type MangaTag = {
          id: string
          type: string
          attributes: {
            name: Record<string, string>
            group: string
          }
        }

        return (
          <Card key={manga.id} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex gap-4">
                <Link href={`/manga/${manga.id}`} className="shrink-0">
                  <div className="relative h-[150px] w-[100px] overflow-hidden rounded-md">
                    <Image
                      src={coverUrl || "/placeholder.svg"}
                      alt={title}
                      fill
                      className="object-cover"
                      sizes="100px"
                    />
                  </div>
                </Link>
                <div className="flex flex-col flex-1 gap-2">
                  <div>
                    <Link href={`/manga/${manga.id}`} className="hover:underline">
                      <h3 className="font-semibold text-lg">{title}</h3>
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {manga.attributes.status.charAt(0).toUpperCase() + manga.attributes.status.slice(1)} •{" "}
                      {manga.attributes.year || "N/A"}
                    </p>
                  </div>
                  <p className="text-sm line-clamp-2">{description}</p>
                  <div className="flex flex-wrap gap-1 mt-auto">
                    {manga.attributes.tags.slice(0, 3).map((tag: MangaTag) => (
                      <Badge key={tag.id} variant="outline" className="text-xs">
                        {tag.attributes.name.en}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-2">
                    <Button size="sm" asChild>
                      <Link href={`/manga/${manga.id}`}>
                        <BookOpen className="mr-2 h-4 w-4" />
                        Read
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

function SearchResultsSkeleton() {
  return (
    <div className="space-y-4">
      {Array(5)
        .fill(0)
        .map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <CardContent className="p-4 flex gap-4">
              <Skeleton className="h-[150px] w-[100px] flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-full" />
              </div>
            </CardContent>
          </Card>
        ))}
    </div>
  )
}

