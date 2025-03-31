import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft, BookOpen } from "lucide-react"
import MangaDetails from "@/components/manga-details"
import ChapterListWithProgress from "@/components/chapter-list-with-progress"

export default async function MangaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

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
          <h1 className="text-2xl font-bold tracking-tight">Manga Details</h1>
        </div>

        <MangaDetails id={id} />

        <div className="flex items-center gap-2 mt-4">
          <BookOpen className="h-5 w-5" />
          <h2 className="text-xl font-semibold">Chapters</h2>
        </div>

        <ChapterListWithProgress mangaId={id} />
      </div>
    </main>
  )
}

