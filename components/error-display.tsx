"use client"
import { AlertCircle, Clock, RefreshCw, WifiOff, Server, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import {
  RateLimitError,
  NetworkError,
  NotFoundError,
  ApiError,
  TimeoutError,
  ServerError,
  ClientError,
} from "@/lib/api-error"

interface ErrorDisplayProps {
  error: Error
  onRetry?: () => void
  className?: string
}

export function ErrorDisplay({ error, onRetry, className }: ErrorDisplayProps) {
  // Format retry time in minutes and seconds
  const formatRetryTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`
  }

  // Determine error type and display appropriate message
  if (error instanceof RateLimitError) {
    return (
      <Card className={className}>
        <CardHeader className="bg-amber-50 dark:bg-amber-950/30">
          <CardTitle className="flex items-center text-amber-700 dark:text-amber-400">
            <Clock className="mr-2 h-5 w-5" />
            Rate Limit Exceeded
          </CardTitle>
          <CardDescription>Too many requests have been made to the server.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <p>
            The server has temporarily limited access due to too many requests.
            {error.retryAfter && (
              <span>
                {" "}
                Please wait approximately <strong>{formatRetryTime(error.retryAfter)}</strong> before trying again.
              </span>
            )}
          </p>
        </CardContent>
        <CardFooter>
          {onRetry && (
            <Button variant="outline" onClick={onRetry} className="ml-auto" disabled={!!error.retryAfter}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          )}
        </CardFooter>
      </Card>
    )
  }

  if (error instanceof TimeoutError) {
    return (
      <Card className={className}>
        <CardHeader className="bg-amber-50 dark:bg-amber-950/30">
          <CardTitle className="flex items-center text-amber-700 dark:text-amber-400">
            <Clock className="mr-2 h-5 w-5" />
            Request Timeout
          </CardTitle>
          <CardDescription>The request took too long to complete.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <p>
            The server took too long to respond. This could be due to network congestion or server load. Please try
            again in a moment.
          </p>
        </CardContent>
        <CardFooter>
          {onRetry && (
            <Button variant="outline" onClick={onRetry} className="ml-auto">
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          )}
        </CardFooter>
      </Card>
    )
  }

  if (error instanceof NetworkError) {
    return (
      <Card className={className}>
        <CardHeader className="bg-red-50 dark:bg-red-950/30">
          <CardTitle className="flex items-center text-red-700 dark:text-red-400">
            <WifiOff className="mr-2 h-5 w-5" />
            Connection Error
          </CardTitle>
          <CardDescription>Unable to connect to the server.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <p>Please check your internet connection and try again. If the problem persists, the server might be down.</p>
        </CardContent>
        <CardFooter>
          {onRetry && (
            <Button variant="outline" onClick={onRetry} className="ml-auto">
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          )}
        </CardFooter>
      </Card>
    )
  }

  if (error instanceof ServerError) {
    return (
      <Card className={className}>
        <CardHeader className="bg-red-50 dark:bg-red-950/30">
          <CardTitle className="flex items-center text-red-700 dark:text-red-400">
            <Server className="mr-2 h-5 w-5" />
            Server Error
          </CardTitle>
          <CardDescription>The server encountered an error processing your request.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <p>
            There was a problem on the server side. This is not your fault. Please try again later or contact support if
            the problem persists.
          </p>
          <p className="text-sm text-muted-foreground mt-2">Error details: {error.message}</p>
        </CardContent>
        <CardFooter>
          {onRetry && (
            <Button variant="outline" onClick={onRetry} className="ml-auto">
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          )}
        </CardFooter>
      </Card>
    )
  }

  if (error instanceof NotFoundError) {
    return (
      <Card className={className}>
        <CardHeader className="bg-blue-50 dark:bg-blue-950/30">
          <CardTitle className="flex items-center text-blue-700 dark:text-blue-400">
            <AlertCircle className="mr-2 h-5 w-5" />
            Not Found
          </CardTitle>
          <CardDescription>The requested content could not be found.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <p>The chapter or manga you're looking for might have been removed or is unavailable.</p>
        </CardContent>
        <CardFooter>
          {onRetry && (
            <Button variant="outline" onClick={onRetry} className="ml-auto">
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          )}
        </CardFooter>
      </Card>
    )
  }

  if (error instanceof ClientError) {
    return (
      <Card className={className}>
        <CardHeader className="bg-amber-50 dark:bg-amber-950/30">
          <CardTitle className="flex items-center text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mr-2 h-5 w-5" />
            Request Error
          </CardTitle>
          <CardDescription>There was a problem with the request.</CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <p>
            The request could not be completed due to an error in the request parameters. This might be a temporary
            issue.
          </p>
          <p className="text-sm text-muted-foreground mt-2">Error details: {error.message}</p>
        </CardContent>
        <CardFooter>
          {onRetry && (
            <Button variant="outline" onClick={onRetry} className="ml-auto">
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          )}
        </CardFooter>
      </Card>
    )
  }

  // Default error display for ApiError or other errors
  return (
    <Card className={className}>
      <CardHeader className="bg-gray-50 dark:bg-gray-800/30">
        <CardTitle className="flex items-center">
          <AlertCircle className="mr-2 h-5 w-5" />
          Error Occurred
        </CardTitle>
        <CardDescription>Something went wrong.</CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        <p>
          {error instanceof ApiError
            ? `API Error (${error.status}): ${error.message}`
            : error.message || "An unexpected error occurred. Please try again later."}
        </p>
      </CardContent>
      <CardFooter>
        {onRetry && (
          <Button variant="outline" onClick={onRetry} className="ml-auto">
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
