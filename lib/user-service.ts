// Create a new file to handle user-related operations

import prisma from "./prisma"
import logger from "./logger"

/**
 * Ensures a user exists in the database
 * If the user doesn't exist, it creates a new user record
 */
export async function ensureUserExists(userId: string, email: string): Promise<void> {
  try {
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    })

    // If user doesn't exist, create a new user
    if (!existingUser) {
      logger.info(`Creating new user with ID: ${userId}`)
      await prisma.user.create({
        data: {
          id: userId,
          email: email,
        },
      })
    }
  } catch (error) {
    logger.error(`Error ensuring user exists: ${userId}`, error)
    throw error
  }
}

