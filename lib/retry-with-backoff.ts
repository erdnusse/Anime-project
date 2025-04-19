import logger from "./logger"
import connectionManager from "./connection-manager"
import { ApiError, NetworkError, RateLimitError } from "./api-error"

export interface RetryOptions {
  maxRetries: number
  initialDelay: number // in milliseconds
  maxDelay?: number // in milliseconds
  factor?: number // multiplier for each retry
  jitter?: boolean // add randomness to delays
  retryCondition?: (error: any) => boolean // function to determine if error is retryable
  onRetry?: (attempt: number, error: any) => void // callback on each retry
}

/**
 * Default retry options
 */
export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  factor: 2,
  jitter: true,
  retryCondition: (error) => {
    // By default, retry on network errors and certain API errors
    if (error instanceof NetworkError) return true
    if (error instanceof ApiError && [408, 429, 500, 502, 503, 504].includes(error.status)) return true
    return false
  },
}

/**
 * Executes a function with exponential backoff retry logic
 * @param fn The async function to execute
 * @param options Retry configuration options
 * @returns The result of the function
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
  url?: string, // Optional URL for connection management
): Promise<T> {
  // Merge provided options with defaults
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options }
  const { maxRetries, initialDelay, maxDelay, factor, jitter, retryCondition, onRetry } = config

  let attempt = 0
  let useHttp1Fallback = false

  while (true) {
    // If we have a URL and HTTP/2 has failed for this host before, use HTTP/1.1
    if (url && connectionManager.hasHttp2Failed(url)) {
      useHttp1Fallback = true
    }

    // If we have a URL, acquire a connection slot
    let releaseConnection: (() => void) | undefined
    if (url) {
      releaseConnection = await connectionManager.acquireConnection(url)
    }

    try {
      // Execute the function
      const result = await fn()

      // Release the connection slot if we acquired one
      if (releaseConnection) {
        releaseConnection()
      }

      return result
    } catch (error: any) {
      // Release the connection slot if we acquired one
      if (releaseConnection) {
        releaseConnection()
      }

      // Check if this is an HTTP/2 protocol error
      const isHttp2Error =
        error?.message?.includes("ERR_HTTP2_PROTOCOL_ERROR") ||
        error?.message?.includes("HTTP/2") ||
        error?.code === "ERR_HTTP2_PROTOCOL_ERROR"

      // If this is an HTTP/2 error and we have a URL, mark this host
      if (isHttp2Error && url) {
        connectionManager.markHttp2Failed(url)
        useHttp1Fallback = true

        // For HTTP/2 errors, retry immediately with HTTP/1.1
        if (attempt < maxRetries) {
          logger.warn(`HTTP/2 protocol error detected, retrying with HTTP/1.1: ${error.message}`)
          attempt++

          // Call onRetry callback if provided
          if (onRetry) {
            onRetry(attempt, error)
          }

          continue
        }
      }

      // Special handling for rate limiting (429 Too Many Requests)
      if (error instanceof RateLimitError || error?.status === 429) {
        // Get retry-after header if available, or use a longer default delay
        const retryAfter = error.retryAfter ? Number.parseInt(error.retryAfter.toString(), 10) * 1000 : 5000
        logger.warn(`Rate limited (429). Waiting ${retryAfter / 1000} seconds before retry.`)

        // Wait for the specified time
        await new Promise((resolve) => setTimeout(resolve, retryAfter))

        // Retry immediately after waiting
        if (attempt < maxRetries) {
          attempt++

          // Call onRetry callback if provided
          if (onRetry) {
            onRetry(attempt, error)
          }

          continue
        }
      }

      // Increment attempt counter
      attempt++

      // If we've reached max retries or the error isn't retryable, throw
      if (attempt >= maxRetries || (retryCondition && !retryCondition(error))) {
        // Enhance error with retry information
        if (error instanceof Error) {
          error.message = `Failed after ${attempt} attempts: ${error.message}`
        }

        logger.error(`Request failed after ${attempt} attempts`, error)
        throw error
      }

      // Calculate delay with exponential backoff using non-null assertion
      // We know these values exist because we merged with DEFAULT_RETRY_OPTIONS
      const factorValue = factor ?? 2 // Fallback to 2 if undefined
      const maxDelayValue = maxDelay ?? 10000 // Fallback to 10000 if undefined
      let delay = Math.min(initialDelay * Math.pow(factorValue, attempt - 1), maxDelayValue)

      // Add jitter if enabled (randomize between 75% and 100% of delay)
      if (jitter) {
        delay = Math.floor(delay * (0.75 + Math.random() * 0.25))
      }

      logger.warn(`Attempt ${attempt} failed, retrying in ${delay}ms`, error)

      // Call onRetry callback if provided
      if (onRetry) {
        onRetry(attempt, error)
      }

      // Wait for the calculated delay
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

/**
 * Creates a function that will retry the provided function with exponential backoff
 * @param fn The function to wrap with retry logic
 * @param options Retry configuration options
 * @returns A function that will execute the original function with retry logic
 */
export function withRetry<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: Partial<RetryOptions> = {},
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return retryWithBackoff(() => fn(...args), options)
  }
}
