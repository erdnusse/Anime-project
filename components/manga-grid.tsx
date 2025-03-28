"use client"

import Link from "next/link"
import Image from "next/image"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getMangaList, getCoverImageUrl, getTitle } from "@/lib/api"
import type { Manga } from "@/lib/api"
import imagePreloader from "@/lib/image-preloader"

export default async function MangaGrid({ type }: { type: string }) {
  const mangaList = await getMangaList(type)

  if (mangaList.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No manga found</p>
      </div>
    )
  }

  // Preload cover images
  const coverUrls = mangaList.map((manga) => getCoverImageUrl(manga))
  // We're in a server component, so we can't directly use the preloader
  // But we can pass the URLs to the client for preloading

  return (
    <>
      <CoverImagePreloader urls={coverUrls} />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {mangaList.map((manga) => (
          <MangaCard key={manga.id} manga={manga} />
        ))}
      </div>
    </>
  )
}

function CoverImagePreloader({ urls }: { urls: string[] }) {
  // Preload images on client side
  if (typeof window !== "undefined") {
    // Preload first 10 immediately, queue the rest
    const highPriority = urls.slice(0, 10)
    const normalPriority = urls.slice(10)

    // Use setTimeout to not block rendering
    setTimeout(() => {
      imagePreloader.preloadBatch(highPriority, true)
      imagePreloader.preloadBatch(normalPriority, false)
    }, 100)
  }

  return null // This component doesn't render anything
}

function MangaCard({ manga }: { manga: Manga }) {
  const title = getTitle(manga)
  const coverUrl = getCoverImageUrl(manga)
  const demographic = manga.attributes.publicationDemographic

  return (
    <Card className="overflow-hidden h-full flex flex-col">
      <Link href={`/manga/${manga.id}`} className="overflow-hidden">
        <div className="aspect-[2/3] relative overflow-hidden">
          <Image
            src={coverUrl || "/placeholder.svg"}
            alt={title}
            fill
            className="object-cover transition-transform hover:scale-105"
            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
            loading="lazy"
          />
        </div>
      </Link>
      <CardContent className="p-4 flex-grow">
        <Link href={`/manga/${manga.id}`} className="hover:underline">
          <h3 className="font-medium line-clamp-2">{title}</h3>
        </Link>
      </CardContent>
      <CardFooter className="p-4 pt-0">
        {demographic && (
          <Badge variant="outline" className="text-xs">
            {demographic.charAt(0).toUpperCase() + demographic.slice(1)}
          </Badge>
        )}
      </CardFooter>
    </Card>
  )
}

