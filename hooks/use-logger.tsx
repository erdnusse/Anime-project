"use client"

/**
 * A hook that provides logging functionality with different log levels
 * @returns An object with logging methods
 */
export function useLogger(namespace = "app") {
  const isDev = process.env.NODE_ENV === "development"

  const logger = {
    /**
     * Log an informational message
     */
    info: (message: string, ...args: any[]) => {
      if (isDev) {
        console.info(`[${namespace}] ${message}`, ...args)
      }
    },

    /**
     * Log a debug message
     */
    debug: (message: string, ...args: any[]) => {
      if (isDev) {
        console.debug(`[${namespace}] ${message}`, ...args)
      }
    },

    /**
     * Log a warning message
     */
    warn: (message: string, ...args: any[]) => {
      if (isDev) {
        console.warn(`[${namespace}] ${message}`, ...args)
      }
    },

    /**
     * Log an error message
     */
    error: (message: string, ...args: any[]) => {
      if (isDev) {
        console.error(`[${namespace}] ${message}`, ...args)
      }
    },
  }

  return logger
}
