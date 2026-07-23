import type { ContactPayload } from "@/lib/types"

export function parseContactPayload(content: string | null | undefined): ContactPayload | null {
  if (!content) return null
  try {
    const parsed = JSON.parse(content) as ContactPayload
    if (parsed?.kind === "contact" && typeof parsed.displayName === "string" && parsed.displayName.trim()) {
      return {
        kind: "contact",
        displayName: parsed.displayName.trim(),
        phone: typeof parsed.phone === "string" ? parsed.phone.trim() || null : null,
        email: typeof parsed.email === "string" ? parsed.email.trim() || null : null,
        photoUrl: typeof parsed.photoUrl === "string" ? parsed.photoUrl.trim() || null : null,
        matchedProfileId:
          typeof parsed.matchedProfileId === "string" ? parsed.matchedProfileId.trim() || null : null,
      }
    }
  } catch {
    // not a contact
  }
  return null
}

export function encodeContactPayload(payload: Omit<ContactPayload, "kind">): string {
  const body: ContactPayload = {
    kind: "contact",
    displayName: payload.displayName.trim(),
    phone: payload.phone?.trim() || null,
    email: payload.email?.trim() || null,
    photoUrl: payload.photoUrl?.trim() || null,
    matchedProfileId: payload.matchedProfileId?.trim() || null,
  }
  return JSON.stringify(body)
}

export function contactPreviewLabel(payload: ContactPayload): string {
  const name = payload.displayName.trim()
  return name ? `👤 איש קשר: ${name}` : "👤 איש קשר"
}

export function buildContactPayload(opts: {
  displayName: string
  phone?: string | null
  email?: string | null
  photoUrl?: string | null
  matchedProfileId?: string | null
}): ContactPayload | null {
  const displayName = opts.displayName.trim()
  if (!displayName) return null
  return {
    kind: "contact",
    displayName,
    phone: opts.phone?.trim() || null,
    email: opts.email?.trim() || null,
    photoUrl: opts.photoUrl?.trim() || null,
    matchedProfileId: opts.matchedProfileId?.trim() || null,
  }
}
