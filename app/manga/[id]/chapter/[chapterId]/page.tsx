import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import ChapterReader from "@/components/chapter-reader"
import ChapterNavigation from "@/components/chapter-navigation"

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ id: string; chapterId: string }>
}) {
  const { id, chapterId } = await params

  return (
    <main className="container mx-auto px-4 py-6">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/manga/${id}`}>
                <ArrowLeft className="h-4 w-4" />
                <span className="sr-only">Back to manga</span>
              </Link>
            </Button>
            <h1 className="text-xl font-bold tracking-tight">Chapter Reader</h1>
          </div>
          <ChapterNavigation mangaId={id} chapterId={chapterId} />
        </div>

        <ChapterReader mangaId={id} chapterId={chapterId} />

        <div className="flex items-center justify-center gap-4 py-4">
          <ChapterNavigation mangaId={id} chapterId={chapterId} />
        </div>
      </div>
    </main>
  )
}

