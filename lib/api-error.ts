// Define custom error types for better error handling
export class ApiError extends Error {
    status: number
  
    constructor(message: string, status: number) {
      super(message)
      this.name = "ApiError"
      this.status = status
    }
  }
  
  export class RateLimitError extends ApiError {
    retryAfter?: number
  
    constructor(message: string, retryAfter?: number) {
      super(message, 429)
      this.name = "RateLimitError"
      this.retryAfter = retryAfter
    }
  }
  
  export class NetworkError extends Error {
    constructor(message: string) {
      super(message)
      this.name = "NetworkError"
    }
  }
  
  export class NotFoundError extends ApiError {
    constructor(message: string) {
      super(message, 404)
      this.name = "NotFoundError"
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
  
      // Generic error for other status codes
      throw new ApiError(`API request failed with status ${response.status}`, response.status)
    }
  
    return (await response.json()) as T
  }
  