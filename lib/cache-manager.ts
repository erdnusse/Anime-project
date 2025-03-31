import logger from "./logger"

// Define cache entry structure with expiration
interface CacheEntry<T> {
  data: T
  timestamp: number
  expiresAt: number
}

// Cache configuration by resource type
interface CacheConfig {
  ttl: number // Time to live in milliseconds
  maxSize?: number // Maximum number of items to store (for memory cache)
}

// Default cache configurations
const DEFAULT_CACHE_CONFIG: Record<string, CacheConfig> = {
  // Chapter lists - cache for 1 hour
  chapterList: { ttl: 60 * 60 * 1000, maxSize: 50 },
  // Manga details - cache for 6 hours
  mangaDetails: { ttl: 6 * 60 * 60 * 1000, maxSize: 100 },
  // Search results - cache for 30 minutes
  searchResults: { ttl: 30 * 60 * 1000, maxSize: 20 },
  // Cover images - cache for 1 day
  coverImage: { ttl: 24 * 60 * 60 * 1000, maxSize: 200 },
  // Chapter pages - cache for 6 hours
  chapterPages: { ttl: 6 * 60 * 60 * 1000, maxSize: 30 },
  // Default - cache for 15 minutes
  default: { ttl: 15 * 60 * 1000, maxSize: 100 },
}

class CacheManager {
  private memoryCache: Map<string, CacheEntry<any>> = new Map()
  private readonly isBrowser: boolean

  constructor() {
    this.isBrowser = typeof window !== "undefined"

    // Initialize cache from localStorage if in browser
    if (this.isBrowser) {
      this.loadCacheFromStorage()

      // Set up periodic cleanup
      setInterval(() => this.cleanupExpiredCache(), 5 * 60 * 1000) // Every 5 minutes
    }
  }

  // Fix the type definition for the get and set methods
  get<T>(key: string, type = "default"): T | null {
    // Try memory cache first
    const memoryItem = this.memoryCache.get(key)
    if (memoryItem && memoryItem.expiresAt > Date.now()) {
      logger.debug(`Cache hit (memory): ${key}`)
      return memoryItem.data as T
    }

    // If in browser, try localStorage
    if (this.isBrowser) {
      try {
        const storageKey = `manga_cache_${type}_${key}`
        const storedItem = localStorage.getItem(storageKey)

        if (storedItem) {
          const parsedItem = JSON.parse(storedItem) as CacheEntry<T>

          // Check if item is still valid
          if (parsedItem.expiresAt > Date.now()) {
            logger.debug(`Cache hit (storage): ${key}`)

            // Update memory cache
            this.memoryCache.set(key, parsedItem)

            return parsedItem.data
          } else {
            // Remove expired item
            localStorage.removeItem(storageKey)
          }
        }
      } catch (error) {
        logger.error(`Error reading from cache: ${key}`, error)
      }
    }

    logger.debug(`Cache miss: ${key}`)
    return null
  }

  /**
   * Set an item in cache
   */
  set<T>(key: string, data: T, type = "default"): void {
    try {
      const config = DEFAULT_CACHE_CONFIG[type as keyof typeof DEFAULT_CACHE_CONFIG] || DEFAULT_CACHE_CONFIG.default
      const now = Date.now()

      const cacheEntry: CacheEntry<T> = {
        data,
        timestamp: now,
        expiresAt: now + config.ttl,
      }

      // Update memory cache
      this.memoryCache.set(key, cacheEntry)

      // If in browser, update localStorage
      if (this.isBrowser) {
        const storageKey = `manga_cache_${type}_${key}`
        localStorage.setItem(storageKey, JSON.stringify(cacheEntry))
      }

      logger.debug(`Cached item: ${key} (type: ${type}, expires in ${config.ttl / 1000}s)`)

      // Enforce max size for memory cache
      this.enforceMaxSize(type as keyof typeof DEFAULT_CACHE_CONFIG)
    } catch (error) {
      logger.error(`Error setting cache: ${key}`, error)
    }
  }

  /**
   * Remove an item from cache
   */
  remove(key: string, type = "default"): void {
    // Remove from memory cache
    this.memoryCache.delete(key)

    // If in browser, remove from localStorage
    if (this.isBrowser) {
      try {
        const storageKey = `manga_cache_${type}_${key}`
        localStorage.removeItem(storageKey)
        logger.debug(`Removed from cache: ${key}`)
      } catch (error) {
        logger.error(`Error removing from cache: ${key}`, error)
      }
    }
  }

  /**
   * Clear all cache or cache of a specific type
   */
  clear(type?: string): void {
    if (type) {
      // Clear specific type
      if (this.isBrowser) {
        try {
          // Get all keys from localStorage
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key && key.startsWith(`manga_cache_${type}_`)) {
              localStorage.removeItem(key)
            }
          }
        } catch (error) {
          logger.error(`Error clearing cache type: ${type}`, error)
        }
      }

      // Clear from memory cache
      for (const [key] of this.memoryCache) {
        if (key.startsWith(`${type}_`)) {
          this.memoryCache.delete(key)
        }
      }

      logger.info(`Cleared cache for type: ${type}`)
    } else {
      // Clear all cache
      this.memoryCache.clear()

      if (this.isBrowser) {
        try {
          // Get all keys from localStorage
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (key && key.startsWith("manga_cache_")) {
              localStorage.removeItem(key)
            }
          }
        } catch (error) {
          logger.error("Error clearing all cache", error)
        }
      }

      logger.info("Cleared all cache")
    }
  }

  /**
   * Load cache from localStorage into memory
   */
  private loadCacheFromStorage(): void {
    if (!this.isBrowser) return

    try {
      // Get all keys from localStorage
      const cacheKeys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith("manga_cache_")) {
          cacheKeys.push(key)
        }
      }

      // Load valid cache entries into memory
      let loadedCount = 0
      const now = Date.now()

      for (const storageKey of cacheKeys) {
        try {
          const value = localStorage.getItem(storageKey)
          if (!value) continue

          const entry = JSON.parse(value) as CacheEntry<any>

          // Skip expired entries
          if (entry.expiresAt <= now) {
            localStorage.removeItem(storageKey)
            continue
          }

          // Extract the actual cache key (remove the prefix)
          const parts = storageKey.split("_")
          const type = parts[2]
          const actualKey = parts.slice(3).join("_")

          // Add to memory cache
          this.memoryCache.set(actualKey, entry)
          loadedCount++
        } catch (error) {
          logger.error(`Error parsing cache entry: ${storageKey}`, error)
          localStorage.removeItem(storageKey)
        }
      }

      logger.info(`Loaded ${loadedCount} items from cache storage`)
    } catch (error) {
      logger.error("Error loading cache from storage", error)
    }
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupExpiredCache(): void {
    const now = Date.now()
    let removedCount = 0

    // Clean memory cache
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.expiresAt <= now) {
        this.memoryCache.delete(key)
        removedCount++
      }
    }

    // Clean localStorage if in browser
    if (this.isBrowser) {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && key.startsWith("manga_cache_")) {
            try {
              const value = localStorage.getItem(key)
              if (!value) continue

              const entry = JSON.parse(value) as CacheEntry<any>
              if (entry.expiresAt <= now) {
                localStorage.removeItem(key)
                removedCount++
              }
            } catch (error) {
              // If we can't parse it, remove it
              localStorage.removeItem(key)
              removedCount++
            }
          }
        }
      } catch (error) {
        logger.error("Error cleaning up localStorage cache", error)
      }
    }

    if (removedCount > 0) {
      logger.debug(`Cleaned up ${removedCount} expired cache entries`)
    }
  }

  /**
   * Enforce maximum size for a cache type
   */
  private enforceMaxSize(type: keyof typeof DEFAULT_CACHE_CONFIG): void {
    const config = DEFAULT_CACHE_CONFIG[type]
    if (!config.maxSize) return

    // Count items of this type
    const typeItems: Array<[string, CacheEntry<any>]> = []
    for (const [key, entry] of this.memoryCache.entries()) {
      if (key.startsWith(`${type}_`)) {
        typeItems.push([key, entry])
      }
    }

    // If we're over the limit, remove oldest items
    if (typeItems.length > config.maxSize) {
      // Sort by timestamp (oldest first)
      typeItems.sort((a, b) => a[1].timestamp - b[1].timestamp)

      // Remove oldest items
      const itemsToRemove = typeItems.slice(0, typeItems.length - config.maxSize)
      for (const [key] of itemsToRemove) {
        this.remove(key, type)
      }

      logger.debug(`Removed ${itemsToRemove.length} items from ${type} cache due to size limit`)
    }
  }
}

// Export a singleton instance
const cacheManager = new CacheManager()
export default cacheManager

