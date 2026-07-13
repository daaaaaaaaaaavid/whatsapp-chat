import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { getSupabaseEnv } from "@/lib/supabase/env"

export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Public routes that must never be blocked by auth/env checks
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/auth") ||
    pathname === "/"
  ) {
    // Still refresh session cookies on /auth when possible, but never block.
  }

  const { url, anonKey } = getSupabaseEnv()

  if (!url || !anonKey) {
    if (pathname.startsWith("/auth") || pathname.startsWith("/api/") || pathname === "/") {
      return NextResponse.next({ request })
    }
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = "/auth/login"
    return NextResponse.redirect(redirectUrl)
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({
          request,
        })
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isAuthRoute = pathname.startsWith("/auth")
  const isPublic =
    pathname === "/" || pathname.startsWith("/api/") || isAuthRoute

  if (!user && !isPublic) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/auth/login"
    if (pathname.startsWith("/invite/")) {
      loginUrl.searchParams.set("next", pathname)
    }
    return NextResponse.redirect(loginUrl)
  }

  return supabaseResponse
}
