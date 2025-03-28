import logger from "./logger"

interface AuthTokens {
  session: string
  refresh: string
  expiresAt: number // timestamp in milliseconds
}

// Check if we're in a browser environment
const isBrowser = typeof window !== "undefined"

class AuthService {
  private tokens: AuthTokens | null = null
  private isRefreshing = false
  private refreshPromise: Promise<AuthTokens | null> | null = null

  constructor() {
    // Only try to load tokens from localStorage in browser environment
    if (isBrowser) {
      try {
        const storedTokens = localStorage.getItem("mangadex_tokens")
        if (storedTokens) {
          this.tokens = JSON.parse(storedTokens)
          logger.info("Loaded auth tokens from storage")
        }
      } catch (error) {
        logger.error("Failed to load auth tokens from storage", error)
      }
    }
  }

  /**
   * Get a valid session token, refreshing if necessary
   */
  async getSessionToken(): Promise<string | null> {
    // If we're on the server, don't try to authenticate
    if (!isBrowser) {
      return null
    }

    // If we don't have tokens, authenticate
    if (!this.tokens) {
      // Don't try to authenticate automatically - return null
      // Authentication will be triggered by user action
      return null
    }

    // If token is expired or about to expire (within 5 minutes), refresh it
    const now = Date.now()
    const isExpired = this.tokens.expiresAt <= now
    const isAboutToExpire = this.tokens.expiresAt <= now + 5 * 60 * 1000

    if (isExpired || isAboutToExpire) {
      await this.refreshToken()
    }

    return this.tokens?.session || null
  }

  /**
   * Authenticate with MangaDex API using username and password
   */
  async authenticate(username?: string, password?: string): Promise<AuthTokens | null> {
    // Only authenticate in browser environment
    if (!isBrowser) {
      logger.error("Cannot authenticate on server side")
      return null
    }

    try {
      logger.info("Authenticating with MangaDex API")

      // Get credentials from localStorage or parameters
      const clientId = localStorage.getItem("NEXT_PUBLIC_MANGADEX_CLIENT_ID")
      const clientSecret = localStorage.getItem("NEXT_PUBLIC_MANGADEX_CLIENT_SECRET")
      const storedUsername = localStorage.getItem("MANGADEX_USERNAME")
      const storedPassword = localStorage.getItem("MANGADEX_PASSWORD")

      // Use provided credentials or stored ones
      const finalUsername = username || storedUsername
      const finalPassword = password || storedPassword

      if (!clientId || !clientSecret) {
        logger.error("Missing MangaDex API client credentials")
        throw new Error("Missing MangaDex API client credentials")
      }

      if (!finalUsername || !finalPassword) {
        logger.error("Missing MangaDex username/password")
        throw new Error("Missing MangaDex username/password")
      }

      // Store credentials if provided
      if (username && password) {
        localStorage.setItem("MANGADEX_USERNAME", username)
        localStorage.setItem("MANGADEX_PASSWORD", password)
      }

      const response = await fetch("https://api.mangadex.org/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: finalUsername,
          password: finalPassword,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        logger.error("Authentication failed", errorData)
        throw new Error(`Authentication failed: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      // Calculate expiration time (15 minutes from now)
      const expiresAt = Date.now() + 15 * 60 * 1000

      const tokens: AuthTokens = {
        session: data.token.session,
        refresh: data.token.refresh,
        expiresAt,
      }

      // Save tokens
      this.tokens = tokens
      this.saveTokens()

      logger.info("Successfully authenticated with MangaDex API")
      return tokens
    } catch (error) {
      logger.error("Authentication error", error)
      return null
    }
  }

  /**
   * Refresh the session token
   */
  private async refreshToken(): Promise<AuthTokens | null> {
    // Only refresh in browser environment
    if (!isBrowser) {
      return null
    }

    // If already refreshing, return the existing promise
    if (this.isRefreshing && this.refreshPromise) {
      return this.refreshPromise
    }

    this.isRefreshing = true
    this.refreshPromise = this._refreshToken()

    try {
      return await this.refreshPromise
    } finally {
      this.isRefreshing = false
      this.refreshPromise = null
    }
  }

  private async _refreshToken(): Promise<AuthTokens | null> {
    if (!isBrowser) {
      return null
    }

    try {
      if (!this.tokens?.refresh) {
        return this.authenticate()
      }

      logger.info("Refreshing MangaDex API token")

      const response = await fetch("https://api.mangadex.org/auth/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: this.tokens.refresh,
        }),
      })

      if (!response.ok) {
        // If refresh fails, try to authenticate again
        logger.warn("Token refresh failed, attempting full authentication")
        return this.authenticate()
      }

      const data = await response.json()

      // Calculate expiration time (15 minutes from now)
      const expiresAt = Date.now() + 15 * 60 * 1000

      const tokens: AuthTokens = {
        session: data.token.session,
        refresh: data.token.refresh,
        expiresAt,
      }

      // Save tokens
      this.tokens = tokens
      this.saveTokens()

      logger.info("Successfully refreshed MangaDex API token")
      return tokens
    } catch (error) {
      logger.error("Token refresh error", error)
      // If refresh fails, clear tokens and try to authenticate again
      this.tokens = null
      return this.authenticate()
    }
  }

  /**
   * Save tokens to localStorage (client-side only)
   */
  private saveTokens(): void {
    if (isBrowser && this.tokens) {
      try {
        localStorage.setItem("mangadex_tokens", JSON.stringify(this.tokens))
      } catch (error) {
        logger.error("Failed to save auth tokens to storage", error)
      }
    }
  }

  /**
   * Clear all tokens
   */
  logout(): void {
    this.tokens = null
    if (isBrowser) {
      localStorage.removeItem("mangadex_tokens")
      localStorage.removeItem("MANGADEX_USERNAME")
      localStorage.removeItem("MANGADEX_PASSWORD")
    }
    logger.info("Logged out from MangaDex API")
  }
}

// Export a singleton instance
const authService = new AuthService()
export default authService

