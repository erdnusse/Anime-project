import logger from "./logger"

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
export async function retryWithBackoff<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  const {
    maxRetries,
    initialDelay,
    maxDelay = 30000, // default max delay of 30 seconds
    factor = 2, // default exponential factor
    jitter = true, // default to using jitter
    retryCondition = () => true, // by default, retry on any error
  } = options

  let attempt = 0

  while (true) {
    try {
      return await fn()
    } catch (error) {
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

