/** Normalized contact row from Google People API. */
export type GoogleContactImport = {
  google_resource_name: string
  display_name: string | null
  email: string | null
  photo_url: string | null
}

type GooglePerson = {
  resourceName?: string
  names?: Array<{ displayName?: string }>
  emailAddresses?: Array<{ value?: string }>
  photos?: Array<{ url?: string; default?: boolean }>
}

type ConnectionsResponse = {
  connections?: GooglePerson[]
  nextPageToken?: string
  error?: { message?: string; status?: string }
}

const PEOPLE_CONNECTIONS_URL =
  "https://people.googleapis.com/v1/people/me/connections"

function pickPhoto(photos: GooglePerson["photos"]): string | null {
  if (!photos?.length) return null
  const nonDefault = photos.find((p) => p.url && !p.default)
  return (nonDefault ?? photos[0])?.url ?? null
}

function personToImport(person: GooglePerson): GoogleContactImport | null {
  const resourceName = person.resourceName?.trim()
  if (!resourceName) return null

  const email =
    person.emailAddresses
      ?.map((e) => e.value?.trim().toLowerCase())
      .find((v) => v && v.includes("@")) ?? null

  // Skip contacts without an email — we match WhaChat users by email only.
  if (!email) return null

  const displayName = person.names?.[0]?.displayName?.trim() || null

  return {
    google_resource_name: resourceName,
    display_name: displayName,
    email,
    photo_url: pickPhoto(person.photos),
  }
}

/** Fetch all connections with an email from Google People API. */
export async function fetchGooglePeopleConnections(
  accessToken: string,
): Promise<GoogleContactImport[]> {
  const byResource = new Map<string, GoogleContactImport>()
  let pageToken: string | undefined

  do {
    const url = new URL(PEOPLE_CONNECTIONS_URL)
    url.searchParams.set("personFields", "names,emailAddresses,photos")
    url.searchParams.set("pageSize", "1000")
    if (pageToken) url.searchParams.set("pageToken", pageToken)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    })

    const data = (await res.json()) as ConnectionsResponse

    if (!res.ok) {
      const msg = data.error?.message || `Google People API error (${res.status})`
      throw new Error(msg)
    }

    for (const person of data.connections ?? []) {
      const row = personToImport(person)
      if (row) byResource.set(row.google_resource_name, row)
    }

    pageToken = data.nextPageToken
  } while (pageToken)

  return [...byResource.values()]
}
