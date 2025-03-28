import logger from "./logger"

class ImagePreloader {
  private cache: Map<string, boolean> = new Map()
  private queue: string[] = []
  private isProcessing = false
  private concurrentLoads = 5

  /**
   * Preload a single image
   */
  preloadImage(url: string): Promise<void> {
    // Skip if already cached
    if (this.cache.has(url)) {
      return Promise.resolve()
    }

    return new Promise((resolve) => {
      const img = new Image()
      img.src = url
      img.onload = () => {
        this.cache.set(url, true)
        logger.debug(`Preloaded image: ${url}`)
        resolve()
      }
      img.onerror = () => {
        logger.error(`Failed to preload image: ${url}`)
        resolve() // Resolve anyway to not block the chain
      }
    })
  }

  /**
   * Add URLs to the preload queue
   */
  queueImages(urls: string[]): void {
    // Filter out already cached URLs
    const newUrls = urls.filter((url) => !this.cache.has(url))
    this.queue.push(...newUrls)

    if (!this.isProcessing) {
      this.processQueue()
    }
  }

  /**
   * Process the queue with limited concurrency
   */
  private async processQueue(): Promise<void> {
    if (this.queue.length === 0) {
      this.isProcessing = false
      return
    }

    this.isProcessing = true

    // Take a batch of URLs to process
    const batch = this.queue.splice(0, this.concurrentLoads)
    logger.debug(`Processing batch of ${batch.length} images`)

    // Load them in parallel
    await Promise.all(batch.map((url) => this.preloadImage(url)))

    // Process next batch
    this.processQueue()
  }

  /**
   * Preload a batch of images with priority
   */
  preloadBatch(urls: string[], priority = false): void {
    if (priority) {
      // For high priority, load immediately
      urls.forEach((url) => this.preloadImage(url))
    } else {
      // For normal priority, add to queue
      this.queueImages(urls)
    }
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear()
    this.queue = []
    this.isProcessing = false
  }

  /**
   * Check if an image is cached
   */
  isCached(url: string): boolean {
    return this.cache.has(url)
  }
}

// Export a singleton instance
const imagePreloader = new ImagePreloader()
export default imagePreloader

