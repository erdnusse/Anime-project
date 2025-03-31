"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { BookOpen, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react"
import { searchManga, getCoverImageUrl, getTitle, getDescription, type Manga } from "@/lib/api"
import logger from "@/lib/logger"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from "@/components/ui/pagination"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function SearchResults({ query }: { query: string }) {
  const [results, setResults] = useState<Manga[]>([])
  const [error, setError] = useState<unknown | null>(null)
  const [loading, setLoading] = useState(true)
  const [retryCount, setRetryCount] = useState(0)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [totalResults, setTotalResults] = useState(0)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    async function fetchResults() {
      try {
        setLoading(true)
        setError(null)

        const offset = (currentPage - 1) * itemsPerPage
        logger.info(`Searching for: "${query}" (page ${currentPage}, limit ${itemsPerPage}, offset ${offset})`)

        const data = await searchManga(query, {
          limit: itemsPerPage,
          offset: offset,
        })

        setResults(data.results)
        setTotalResults(data.total)
        setTotalPages(Math.ceil(data.total / itemsPerPage))

        logger.info(`Search results for "${query}": ${data.results.length} items found (total: ${data.total})`)
      } catch (err) {
        setError(err)
        logger.error(`Error in search results for "${query}"`, err)
      } finally {
        setLoading(false)
      }
    }

    fetchResults()
  }, [query, currentPage, itemsPerPage, retryCount])

  const handleRetry = () => {
    setRetryCount((prev) => prev + 1)
  }

  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages) return
    setCurrentPage(page)
    // Scroll to top when changing pages
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleItemsPerPageChange = (value: string) => {
    const newItemsPerPage = Number.parseInt(value)
    setItemsPerPage(newItemsPerPage)
    // Reset to first page when changing items per page
    setCurrentPage(1)
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, totalResults)} of{" "}
          {totalResults} results
        </p>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Items per page:</span>
          <Select value={itemsPerPage.toString()} onValueChange={handleItemsPerPageChange}>
            <SelectTrigger className="w-[70px]">
              <SelectValue placeholder="10" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5</SelectItem>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

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

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <Button
                variant="outline"
                size="icon"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="sr-only">Previous page</span>
              </Button>
            </PaginationItem>

            {/* First page */}
            {currentPage > 3 && (
              <PaginationItem>
                <PaginationLink onClick={() => handlePageChange(1)}>1</PaginationLink>
              </PaginationItem>
            )}

            {/* Ellipsis if needed */}
            {currentPage > 4 && (
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
            )}

            {/* Page before current if not first page */}
            {currentPage > 1 && (
              <PaginationItem>
                <PaginationLink onClick={() => handlePageChange(currentPage - 1)}>{currentPage - 1}</PaginationLink>
              </PaginationItem>
            )}

            {/* Current page */}
            <PaginationItem>
              <PaginationLink isActive>{currentPage}</PaginationLink>
            </PaginationItem>

            {/* Page after current if not last page */}
            {currentPage < totalPages && (
              <PaginationItem>
                <PaginationLink onClick={() => handlePageChange(currentPage + 1)}>{currentPage + 1}</PaginationLink>
              </PaginationItem>
            )}

            {/* Ellipsis if needed */}
            {currentPage < totalPages - 3 && (
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
            )}

            {/* Last page */}
            {currentPage < totalPages - 2 && (
              <PaginationItem>
                <PaginationLink onClick={() => handlePageChange(totalPages)}>{totalPages}</PaginationLink>
              </PaginationItem>
            )}

            <PaginationItem>
              <Button
                variant="outline"
                size="icon"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
                <span className="sr-only">Next page</span>
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
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

