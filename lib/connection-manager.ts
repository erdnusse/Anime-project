import logger from "./logger"

/**
 * Connection manager to limit concurrent requests to the same host
 * and handle HTTP/2 connection issues
 */
class ConnectionManager {
  private activeConnections: Map<string, number> = new Map()
  private maxConnectionsPerHost = 6 // HTTP/2 typically allows 6 concurrent streams per connection
  private connectionQueue: Map<string, Array<() => void>> = new Map()
  private http2FailedHosts: Set<string> = new Set()

  /**
   * Acquires a connection slot for a host
   * @param url The URL to connect to
   * @returns A promise that resolves when a connection slot is available
   */
  async acquireConnection(url: string): Promise<() => void> {
    const host = this.getHostFromUrl(url)

    // Initialize counters if this is the first request to this host
    if (!this.activeConnections.has(host)) {
      this.activeConnections.set(host, 0)
      this.connectionQueue.set(host, [])
    }

    const currentConnections = this.activeConnections.get(host) || 0

    // If we're under the connection limit, increment and proceed
    if (currentConnections < this.maxConnectionsPerHost) {
      this.activeConnections.set(host, currentConnections + 1)
      logger.debug(`Acquired connection to ${host}, active: ${currentConnections + 1}/${this.maxConnectionsPerHost}`)

      // Return a release function
      return () => this.releaseConnection(host)
    }

    // Otherwise, wait for a connection to become available
    logger.debug(`Waiting for connection to ${host}, active: ${currentConnections}/${this.maxConnectionsPerHost}`)

    return new Promise<() => void>((resolve) => {
      const queue = this.connectionQueue.get(host) || []
      queue.push(() => {
        this.activeConnections.set(host, (this.activeConnections.get(host) || 0) + 1)
        logger.debug(
          `Acquired queued connection to ${host}, active: ${this.activeConnections.get(host)}/${this.maxConnectionsPerHost}`,
        )
        resolve(() => this.releaseConnection(host))
      })
      this.connectionQueue.set(host, queue)
    })
  }

  /**
   * Releases a connection slot for a host
   * @param host The host to release a connection for
   */
  private releaseConnection(host: string): void {
    const currentConnections = this.activeConnections.get(host) || 0

    if (currentConnections > 0) {
      this.activeConnections.set(host, currentConnections - 1)
      logger.debug(`Released connection to ${host}, active: ${currentConnections - 1}/${this.maxConnectionsPerHost}`)
    }

    // If there are waiting connections, process the next one
    const queue = this.connectionQueue.get(host) || []
    if (queue.length > 0) {
      const next = queue.shift()
      if (next) {
        next()
      }
      this.connectionQueue.set(host, queue)
    }
  }

  /**
   * Marks a host as having HTTP/2 issues
   * @param url The URL that experienced HTTP/2 issues
   */
  markHttp2Failed(url: string): void {
    const host = this.getHostFromUrl(url)
    this.http2FailedHosts.add(host)
    logger.warn(`Marked ${host} as having HTTP/2 issues, will use HTTP/1.1 for future requests`)
  }

  /**
   * Checks if a host has been marked as having HTTP/2 issues
   * @param url The URL to check
   * @returns True if the host has been marked as having HTTP/2 issues
   */
  hasHttp2Failed(url: string): boolean {
    const host = this.getHostFromUrl(url)
    return this.http2FailedHosts.has(host)
  }

  /**
   * Gets the host from a URL
   * @param url The URL to extract the host from
   * @returns The host
   */
  private getHostFromUrl(url: string): string {
    try {
      return new URL(url).host
    } catch (e) {
      logger.error(`Invalid URL: ${url}`, e)
      return url // Fallback to using the entire URL as the "host"
    }
  }
}

// Export a singleton instance
const connectionManager = new ConnectionManager()
export default connectionManager

