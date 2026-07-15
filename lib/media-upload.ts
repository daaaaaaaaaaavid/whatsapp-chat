import type { SupabaseClient } from "@supabase/supabase-js"

export type UploadProgress = {
  loaded: number
  total: number
  /** 0–1 within the current file */
  ratio: number
}

function storageBaseUrl(): { url: string; anonKey: string } {
  const url =
    (typeof window !== "undefined" ? window.__SUPABASE_URL__?.trim() : undefined) ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    ""
  const anonKey =
    (typeof window !== "undefined" ? window.__SUPABASE_ANON_KEY__?.trim() : undefined) ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    ""
  return { url, anonKey }
}

/** Upload to the private `media` bucket with real XHR byte progress. */
export async function uploadMediaWithProgress(
  supabase: SupabaseClient,
  path: string,
  file: Blob,
  options: {
    contentType: string
    upsert?: boolean
    onProgress?: (progress: UploadProgress) => void
  },
): Promise<{ error: Error | null }> {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !sessionData.session?.access_token) {
    return { error: new Error(sessionError?.message || "לא מחובר") }
  }

  const { url, anonKey } = storageBaseUrl()
  if (!url || !anonKey) {
    return { error: new Error("חסרים מפתחות Supabase") }
  }

  const encodedPath = path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")
  const objectUrl = `${url.replace(/\/$/, "")}/storage/v1/object/media/${encodedPath}`

  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open("POST", objectUrl)
    xhr.responseType = "text"
    xhr.setRequestHeader("Authorization", `Bearer ${sessionData.session!.access_token}`)
    xhr.setRequestHeader("apikey", anonKey)
    xhr.setRequestHeader("Content-Type", options.contentType)
    xhr.setRequestHeader("x-upsert", options.upsert ? "true" : "false")

    xhr.upload.onprogress = (event) => {
      if (!options.onProgress || !event.lengthComputable || event.total <= 0) return
      options.onProgress({
        loaded: event.loaded,
        total: event.total,
        ratio: Math.min(1, event.loaded / event.total),
      })
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        options.onProgress?.({ loaded: file.size, total: file.size || 1, ratio: 1 })
        resolve({ error: null })
        return
      }
      let message = `העלאה נכשלה (${xhr.status})`
      try {
        const parsed = JSON.parse(xhr.responseText) as { message?: string; error?: string }
        message = parsed.message || parsed.error || message
      } catch {
        if (xhr.responseText?.trim()) message = xhr.responseText.trim().slice(0, 200)
      }
      resolve({ error: new Error(message) })
    }

    xhr.onerror = () => resolve({ error: new Error("שגיאת רשת בהעלאה") })
    xhr.onabort = () => resolve({ error: new Error("ההעלאה בוטלה") })
    xhr.send(file)
  })
}
