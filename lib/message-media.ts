export function messageMediaStreamUrl(messageId: string): string {
  return `/api/drive/message-media?id=${encodeURIComponent(messageId)}`
}

export async function downloadUrlAsFile(href: string, fileName: string): Promise<void> {
  const res = await fetch(href)
  if (!res.ok) {
    throw new Error(res.status === 404 ? "הקובץ נמחק ולא ניתן לצפות בו" : "ההורדה נכשלה")
  }
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = objectUrl
  anchor.download = fileName || "file"
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}
