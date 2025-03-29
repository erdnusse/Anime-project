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
  private clientId: string | null = null
  private clientSecret: string | null = null

  constructor() {
    // Only try to load tokens and credentials from localStorage in browser environment
    if (isBrowser) {
      try {
        const storedTokens = localStorage.getItem("mangadex_tokens")
        if (storedTokens) {
          this.tokens = JSON.parse(storedTokens)
          logger.info("Loaded auth tokens from storage")
        }

        // Load client credentials
        this.clientId = localStorage.getItem("MANGADEX_CLIENT_ID")
        this.clientSecret = localStorage.getItem("MANGADEX_CLIENT_SECRET")

        if (this.clientId && this.clientSecret) {
          logger.info("Loaded client credentials from storage")
        }
      } catch (error) {
        logger.error("Failed to load auth data from storage", error)
      }
    }
  }

  /**
   * Set client credentials
   */
  setClientCredentials(clientId: string, clientSecret: string): void {
    this.clientId = clientId
    this.clientSecret = clientSecret

    if (isBrowser) {
      localStorage.setItem("MANGADEX_CLIENT_ID", clientId)
      localStorage.setItem("MANGADEX_CLIENT_SECRET", clientSecret)
      logger.info("Saved client credentials to storage")
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

    // If we don't have tokens, return null
    if (!this.tokens) {
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
   * Following the documentation at:
   * https://gitlab.com/mangadex-pub/mangadex-api-docs/-/blob/main/02-authentication/personal-clients.md
   */
  async authenticate(username: string, password: string): Promise<AuthTokens | null> {
    // Only authenticate in browser environment
    if (!isBrowser) {
      logger.error("Cannot authenticate on server side")
      return null
    }

    try {
      logger.info("Authenticating with MangaDex API")

      if (!this.clientId || !this.clientSecret) {
        logger.error("Missing MangaDex API client credentials")
        throw new Error("Missing MangaDex API client credentials. Please set client ID and secret first.")
      }

      // Step 1: Get the auth token using client credentials through our proxy
      const tokenResponse = await fetch("/api/mangadex-proxy?path=/auth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          grant_type: "password",
          username,
          password,
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }),
      })

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.json()
        logger.error("Authentication failed", errorData)
        throw new Error(`Authentication failed: ${tokenResponse.status} ${tokenResponse.statusText}`)
      }

      const tokenData = await tokenResponse.json()

      // Calculate expiration time (token expires in 15 minutes)
      const expiresAt = Date.now() + tokenData.expires_in * 1000

      const tokens: AuthTokens = {
        session: tokenData.access_token,
        refresh: tokenData.refresh_token,
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
      if (!this.tokens?.refresh || !this.clientId || !this.clientSecret) {
        logger.error("Missing refresh token or client credentials")
        return null
      }

      logger.info("Refreshing MangaDex API token")

      const response = await fetch("/api/mangadex-proxy?path=/auth/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: this.tokens.refresh,
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }),
      })

      if (!response.ok) {
        logger.warn("Token refresh failed, clearing tokens")
        this.tokens = null
        this.saveTokens()
        return null
      }

      const data = await response.json()

      // Calculate expiration time (token expires in 15 minutes)
      const expiresAt = Date.now() + data.expires_in * 1000

      const tokens: AuthTokens = {
        session: data.access_token,
        refresh: data.refresh_token,
        expiresAt,
      }

      // Save tokens
      this.tokens = tokens
      this.saveTokens()

      logger.info("Successfully refreshed MangaDex API token")
      return tokens
    } catch (error) {
      logger.error("Token refresh error", error)
      this.tokens = null
      this.saveTokens()
      return null
    }
  }

  /**
   * Save tokens to localStorage (client-side only)
   */
  private saveTokens(): void {
    if (isBrowser) {
      try {
        if (this.tokens) {
          localStorage.setItem("mangadex_tokens", JSON.stringify(this.tokens))
        } else {
          localStorage.removeItem("mangadex_tokens")
        }
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
    }
    logger.info("Logged out from MangaDex API")
  }
}

// Export a singleton instance
const authService = new AuthService()
export default authService

