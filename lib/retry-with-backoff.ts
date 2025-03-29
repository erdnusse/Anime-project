import logger from "./logger"
import connectionManager from "./connection-manager"

interface RetryOptions {
  maxRetries: number
  initialDelay: number // in milliseconds
  maxDelay?: number // in milliseconds
  factor?: number // multiplier for each retry
  jitter?: boolean // add randomness to delays
  retryCondition?: (error: any) => boolean // function to determine if error is retryable
}

/**
 * Executes a function with exponential backoff retry logic
 * @param fn The async function to execute
 * @param options Retry configuration options
 * @returns The result of the function
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
  url?: string, // Optional URL for connection management
): Promise<T> {
  const {
    maxRetries,
    initialDelay,
    maxDelay = 30000, // default max delay of 30 seconds
    factor = 2, // default exponential factor
    jitter = true, // default to using jitter
    retryCondition = () => true, // by default, retry on any error
  } = options

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
      // Modify the fetch options to use HTTP/1.1 if needed
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
          continue
        }
      }

      attempt++

      // If we've reached max retries or the error isn't retryable, throw
      if (attempt >= maxRetries || !retryCondition(error)) {
        logger.error(`Failed after ${attempt} attempts`, error)
        throw error
      }

      // Calculate delay with exponential backoff
      let delay = Math.min(initialDelay * Math.pow(factor, attempt - 1), maxDelay)

      // Add jitter if enabled (randomize between 75% and 100% of delay)
      if (jitter) {
        delay = Math.floor(delay * (0.75 + Math.random() * 0.25))
      }

      logger.warn(`Attempt ${attempt} failed, retrying in ${delay}ms`, error)

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
  options: RetryOptions,
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return retryWithBackoff(() => fn(...args), options)
  }
}

