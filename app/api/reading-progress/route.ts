import { type NextRequest, NextResponse } from "next/server"
import { currentUser } from "@clerk/nextjs/server"
import prisma from "@/lib/prisma"
import logger from "@/lib/logger"

// Get reading progress for a user
export async function GET(request: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const userId = user.id

    const searchParams = request.nextUrl.searchParams
    const mangaId = searchParams.get("mangaId")

    if (mangaId) {
      // Get reading progress for a specific manga
      const readingHistory = await prisma.readingHistory.findMany({
        where: {
          userId,
          mangaId,
        },
        orderBy: {
          readAt: "desc",
        },
      })

      return NextResponse.json({ readingHistory })
    } else {
      // Get all reading history for the user
      const readingHistory = await prisma.readingHistory.findMany({
        where: {
          userId,
        },
        orderBy: {
          readAt: "desc",
        },
      })

      return NextResponse.json({ readingHistory })
    }
  } catch (error) {
    logger.error("Error fetching reading progress", error)
    return NextResponse.json({ error: "Failed to fetch reading progress" }, { status: 500 })
  }
}

// Update reading progress
export async function POST(request: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const userId = user.id

    const { mangaId, chapterId, progress = 100 } = await request.json()

    if (!mangaId || !chapterId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Upsert reading progress (create or update)
    const readingProgress = await prisma.readingHistory.upsert({
      where: {
        userId_chapterId: {
          userId,
          chapterId,
        },
      },
      update: {
        progress: progress,
        readAt: new Date(),
      },
      create: {
        userId,
        mangaId,
        chapterId,
        progress,
      },
    })

    return NextResponse.json({ readingProgress })
  } catch (error) {
    logger.error("Error updating reading progress", error)
    return NextResponse.json({ error: "Failed to update reading progress" }, { status: 500 })
  }
}

// Delete reading progress
export async function DELETE(request: NextRequest) {
  try {
    const user = await currentUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const userId = user.id

    const searchParams = request.nextUrl.searchParams
    const chapterId = searchParams.get("chapterId")

    if (!chapterId) {
      return NextResponse.json({ error: "Missing chapterId parameter" }, { status: 400 })
    }

    // Delete reading progress
    await prisma.readingHistory.delete({
      where: {
        userId_chapterId: {
          userId,
          chapterId,
        },
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error("Error deleting reading progress", error)
    return NextResponse.json({ error: "Failed to delete reading progress" }, { status: 500 })
  }
}

