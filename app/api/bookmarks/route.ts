import { type NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import prisma from "@/lib/prisma"
import logger from "@/lib/logger"

// Get bookmarks for a user
export async function GET(request: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = user.id

    const bookmarks = await prisma.bookmark.findMany({
      where: {
        userId,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    return NextResponse.json({ bookmarks })
  } catch (error) {
    logger.error("Error fetching bookmarks", error)
    return NextResponse.json({ error: "Failed to fetch bookmarks" }, { status: 500 })
  }
}

// Add a bookmark
export async function POST(request: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = user.id

    const { mangaId } = await request.json()

    if (!mangaId) {
      return NextResponse.json({ error: "Missing mangaId field" }, { status: 400 })
    }

    // Upsert bookmark (create if not exists, ignore if exists)
    const bookmark = await prisma.bookmark.upsert({
      where: {
        userId_mangaId: {
          userId,
          mangaId,
        },
      },
      update: {},
      create: {
        userId,
        mangaId,
      },
    })

    return NextResponse.json({ bookmark })
  } catch (error) {
    logger.error("Error adding bookmark", error)
    return NextResponse.json({ error: "Failed to add bookmark" }, { status: 500 })
  }
}

// Delete a bookmark
export async function DELETE(request: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = user.id

    const searchParams = request.nextUrl.searchParams
    const mangaId = searchParams.get("mangaId")

    if (!mangaId) {
      return NextResponse.json({ error: "Missing mangaId parameter" }, { status: 400 })
    }

    // Delete bookmark
    await prisma.bookmark.delete({
      where: {
        userId_mangaId: {
          userId,
          mangaId,
        },
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error("Error deleting bookmark", error)
    return NextResponse.json({ error: "Failed to delete bookmark" }, { status: 500 })
  }
}

