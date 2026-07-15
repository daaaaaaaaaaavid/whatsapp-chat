import { updateSession } from "@/lib/supabase/proxy"
import { type NextRequest, NextResponse } from "next/server"

export async function middleware(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    const proto = request.headers.get("x-forwarded-proto")
    if (proto === "http") {
      const httpsUrl = request.nextUrl.clone()
      httpsUrl.protocol = "https:"
      return NextResponse.redirect(httpsUrl, 308)
    }
  }

  return await updateSession(request)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
