import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Missing env vars on Vercel cause MIDDLEWARE_INVOCATION_FAILED (500).
  // Fail softly so the deploy still loads and shows auth/setup instead of crashing.
  if (!url || !key) {
    const pathname = request.nextUrl.pathname
    if (pathname.startsWith("/auth")) {
      return NextResponse.next({ request })
    }
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = "/auth/login"
    return NextResponse.redirect(redirectUrl)
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(url, key, {
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
    },
  )

  // Do not run code between createServerClient and supabase.auth.getUser()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname
  const isAuthRoute = pathname.startsWith("/auth")
  const isPublicAsset = pathname === "/"

  if (!user && !isAuthRoute && !isPublicAsset) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/auth/login"
    return NextResponse.redirect(loginUrl)
  }

  return supabaseResponse
}
