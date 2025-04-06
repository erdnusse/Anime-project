import SinglePageReader from "@/components/single-page-reader"

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ id: string; chapterId: string }>
}) {
  const { id, chapterId } = await params

  return (
    <main className="p-0 m-0 h-screen">
      <SinglePageReader mangaId={id} chapterId={chapterId} />
    </main>
  )
}

