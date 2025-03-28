import { Suspense } from "react"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Search } from "lucide-react"
import MangaGrid from "@/components/manga-grid"
import FeaturedManga from "@/components/featured-manga"

export default function HomePage() {
  return (
    <main className="container mx-auto px-4 py-6">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">MangaReader</h1>
          <p className="text-muted-foreground">Discover and read your favorite manga</p>
        </div>

        <div className="relative">
          <form action="/search" className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input name="query" placeholder="Search for manga..." className="pl-10" />
          </form>
        </div>

        <Suspense fallback={<FeaturedMangaSkeleton />}>
          <FeaturedManga />
        </Suspense>

        <Tabs defaultValue="popular" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="popular">Popular</TabsTrigger>
            <TabsTrigger value="latest">Latest Updates</TabsTrigger>
            <TabsTrigger value="new">New Titles</TabsTrigger>
          </TabsList>
          <TabsContent value="popular" className="space-y-4">
            <Suspense fallback={<MangaGridSkeleton />}>
              <MangaGrid type="popular" />
            </Suspense>
          </TabsContent>
          <TabsContent value="latest" className="space-y-4">
            <Suspense fallback={<MangaGridSkeleton />}>
              <MangaGrid type="latest" />
            </Suspense>
          </TabsContent>
          <TabsContent value="new" className="space-y-4">
            <Suspense fallback={<MangaGridSkeleton />}>
              <MangaGrid type="new" />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  )
}

function FeaturedMangaSkeleton() {
  return (
    <div className="w-full h-[300px] rounded-lg overflow-hidden relative">
      <Skeleton className="w-full h-full" />
    </div>
  )
}

function MangaGridSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {Array(10)
        .fill(0)
        .map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <Skeleton className="h-[240px] w-full" />
            <CardContent className="p-4">
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-2/3" />
            </CardContent>
          </Card>
        ))}
    </div>
  )
}

