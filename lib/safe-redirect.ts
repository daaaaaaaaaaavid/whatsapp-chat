/**
 * Validate a post-auth redirect path to prevent open redirects.
 * Allows only same-origin relative paths (single leading slash, no protocol-relative).
 */
export function isSafeRedirectPath(path: string | null | undefined): path is string {
  if (!path) return false
  if (!path.startsWith("/")) return false
  if (path.startsWith("//")) return false
  if (path.includes("\\")) return false
  // Reject encoded tricks and control chars
  if (/[\u0000-\u001f\u007f]/.test(path)) return false
  if (!/^\/[a-zA-Z0-9/_\-?=&%.~]*$/.test(path)) return false
  return true
}

export function safeRedirectPath(
  path: string | null | undefined,
  fallback = "/chat",
): string {
  return isSafeRedirectPath(path) ? path : fallback
}
