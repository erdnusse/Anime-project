"use client"

import type React from "react"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"
import logger from "@/lib/logger"

interface LoginFormProps {
  onLogin: (username: string, password: string, clientId: string, clientSecret: string) => Promise<boolean>
}

export default function LoginForm({ onLogin }: LoginFormProps) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [clientId, setClientId] = useState("")
  const [clientSecret, setClientSecret] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const success = await onLogin(username, password, clientId, clientSecret)
      if (!success) {
        setError("Authentication failed. Please check your credentials.")
      }
    } catch (err) {
      logger.error("Login error", err)
      const errorMessage = err instanceof Error ? err.message : "An error occurred during login. Please try again."
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>MangaDex Login</CardTitle>
        <CardDescription>Enter your MangaDex credentials to access the download feature</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="client-id">Client ID</Label>
            <Input
              id="client-id"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
              placeholder="Your MangaDex API client ID"
            />
            <p className="text-xs text-muted-foreground">
              Create a client ID at{" "}
              <a
                href="https://api.mangadex.org/docs/02-authentication/personal-clients/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                MangaDex API
              </a>
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="client-secret">Client Secret</Label>
            <Input
              id="client-secret"
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              required
              placeholder="Your MangaDex API client secret"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="Your MangaDex username"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Your MangaDex password"
            />
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Logging in..." : "Login"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col text-sm text-muted-foreground">
        <p>
          Don't have API credentials? Visit the{" "}
          <a
            href="https://api.mangadex.org/docs/02-authentication/personal-clients/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline"
          >
            MangaDex API documentation
          </a>{" "}
          to learn how to create them.
        </p>
      </CardFooter>
    </Card>
  )
}

