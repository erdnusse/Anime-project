import Link from "next/link"
import Image from "next/image"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { BookOpen } from "lucide-react"
import { searchManga, getCoverImageUrl, getTitle, getDescription } from "@/lib/api"

export default async function SearchResults({ query }: { query: string }) {
  const results = await searchManga(query)

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
                    {manga.attributes.tags.slice(0, 3).map((tag) => (
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

