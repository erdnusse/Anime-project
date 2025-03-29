"use client"
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { BookOpen } from "lucide-react"
import { getFeaturedManga, getCoverImageUrl, getTitle, getDescription, type Manga } from "@/lib/api"
import imagePreloader from "@/lib/image-preloader"
import { useState, useEffect } from "react"

export default function FeaturedManga() {
  const [manga, setManga] = useState<Manga | null>(null)
  const [error, setError] = useState<Error | unknown | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadFeaturedManga() {
      try {
        setIsLoading(true)
        const data = await getFeaturedManga()
        setManga(data)
      } catch (err) {
        console.error("Failed to load featured manga:", err)
        setError(err)
      } finally {
        setIsLoading(false)
      }
    }

    loadFeaturedManga()
  }, [])

  if (isLoading) {
    return <FeaturedMangaSkeleton />
  }

  if (error || !manga) {
    return <FeaturedMangaSkeleton />
  }

  const title = getTitle(manga)
  const description = getDescription(manga)
  const coverUrl = getCoverImageUrl(manga)

  return (
    <>
      <FeaturedImagePreloader url={coverUrl} />
      <div className="w-full rounded-lg overflow-hidden relative">
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 to-black/20 z-10" />
        <div className="relative aspect-[21/9] md:aspect-[3/1] w-full">
          <Image
            src={coverUrl || "/placeholder.svg"}
            alt={title}
            fill
            className="object-cover"
            priority
            sizes="100vw"
          />
        </div>
        <div className="absolute inset-0 z-20 flex flex-col justify-end p-6">
          <div className="max-w-2xl">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">{title}</h2>
            <p className="text-white/80 line-clamp-2 mb-4">{description}</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {manga.attributes.tags.slice(0, 4).map((tag) => (
                <Badge key={tag.id} variant="secondary" className="bg-white/20 hover:bg-white/30">
                  {tag.attributes.name.en}
                </Badge>
              ))}
            </div>
            <Button asChild>
              <Link href={`/manga/${manga.id}`}>
                <BookOpen className="mr-2 h-4 w-4" />
                Read Now
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}

function FeaturedImagePreloader({ url }: { url: string }) {
  // Preload image on client side
  if (typeof window !== "undefined" && url) {
    // Use setTimeout to not block rendering
    setTimeout(() => {
      imagePreloader.preloadImage(url)
    }, 0)
  }

  return null // This component doesn't render anything
}

function FeaturedMangaSkeleton() {
  return (
    <div className="w-full rounded-lg overflow-hidden relative">
      <div className="aspect-[21/9] md:aspect-[3/1] w-full bg-muted animate-pulse" />
    </div>
  )
}

