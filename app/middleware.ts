import { clerkMiddleware } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"

// Define public routes
const publicRoutes = ["/", "/search", "/manga", "/api/manga-image", "/api/mangadex-proxy"]

export default clerkMiddleware((auth, req) => {
  // Check if the path matches any of our public routes
  const path = req.nextUrl.pathname

  // Allow access to public routes or routes that start with public paths
  if (publicRoutes.some((route) => path === route || path.startsWith(`${route}/`))) {
    return NextResponse.next()
  }

  // For protected routes, we'll let Clerk handle the authentication
  // If the user isn't authenticated, Clerk will redirect them appropriately
  return NextResponse.next()
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    "/((?!_next|[^?]*\\.(jpg|jpeg|gif|png|svg|ico|css|js|woff|woff2)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
}

