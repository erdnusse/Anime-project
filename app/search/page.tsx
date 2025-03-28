import { Suspense } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowLeft, Search } from "lucide-react"
import Link from "next/link"
import SearchResults from "@/components/search-results"

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string }>
}) {
  const { query = "" } = await searchParams

  return (
    <main className="container mx-auto px-4 py-6">
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Back</span>
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Search Results</h1>
        </div>

        <div className="relative">
          <form action="/search" className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input name="query" placeholder="Search for manga..." className="pl-10" defaultValue={query} />
          </form>
        </div>

        {query ? (
          <Suspense fallback={<SearchResultsSkeleton />}>
            <SearchResults query={query} />
          </Suspense>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Enter a search term to find manga</p>
          </div>
        )}
      </div>
    </main>
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
              <Skeleton className="h-[120px] w-[80px] flex-shrink-0" />
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

