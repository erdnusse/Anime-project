// Enhance the API error types with more detailed information

// Define custom error types for better error handling
export class ApiError extends Error {
  status: number
  retryable: boolean

  constructor(message: string, status: number, retryable = false) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.retryable = retryable
  }
}

export class RateLimitError extends ApiError {
  retryAfter?: number

  constructor(message: string, retryAfter?: number) {
    super(message, 429, true) // Rate limit errors are always retryable
    this.name = "RateLimitError"
    this.retryAfter = retryAfter
  }
}

export class NetworkError extends Error {
  retryable: boolean

  constructor(message: string, retryable = true) {
    super(message)
    this.name = "NetworkError"
    this.retryable = retryable
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string) {
    super(message, 404, false) // Not Found errors are not retryable
    this.name = "NotFoundError"
  }
}

export class TimeoutError extends NetworkError {
  constructor(message = "Request timed out") {
    super(message, true) // Timeout errors are retryable
    this.name = "TimeoutError"
  }
}

export class ServerError extends ApiError {
  constructor(message: string, status: number) {
    super(message, status, true) // Server errors are retryable
    this.name = "ServerError"
  }
}

export class ClientError extends ApiError {
  constructor(message: string, status: number) {
    super(message, status, false) // Client errors are not retryable
    this.name = "ClientError"
  }
}

// Helper function to create the appropriate error type based on status code
export function createApiError(message: string, status: number): ApiError {
  if (status === 429) {
    return new RateLimitError(message)
  } else if (status === 404) {
    return new NotFoundError(message)
  } else if (status >= 500) {
    return new ServerError(message, status)
  } else if (status >= 400) {
    return new ClientError(message, status)
  } else {
    return new ApiError(message, status)
  }
}

// Helper function to handle API responses
export async function handleApiResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    // Check for rate limiting
    if (response.status === 429) {
      const retryAfter = Number.parseInt(response.headers.get("retry-after") || "60", 10)
      throw new RateLimitError("Too many requests. Please wait before trying again.", retryAfter)
    }

    // Handle other common status codes
    if (response.status === 404) {
      throw new NotFoundError("The requested resource was not found.")
    }

    // Try to parse error response
    let errorMessage: string
    try {
      const errorData = await response.json()
      errorMessage = errorData.error || errorData.message || `API request failed with status ${response.status}`
    } catch {
      errorMessage = `API request failed with status ${response.status}`
    }

    // Create appropriate error type
    throw createApiError(errorMessage, response.status)
  }

  return (await response.json()) as T
}
