import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import BookmarksClient from "@/components/bookmarks-client"

export default function BookmarksPage() {
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-bold">Your Bookmarks</h1>

        <Suspense fallback={<BookmarksSkeleton />}>
          <BookmarksClient />
        </Suspense>
      </div>
    </div>
  )
}

function BookmarksSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array(6)
        .fill(0)
        .map((_, i) => (
          <Skeleton key={i} className="h-[150px] w-full" />
        ))}
    </div>
  )
}

