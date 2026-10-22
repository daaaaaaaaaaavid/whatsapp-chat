/** Thrown when the link exists but the browser refused to put it on the clipboard. */
export class CopyFailedError extends Error {
  readonly text: string

  constructor(text: string) {
    super("לא ניתן להעתיק אוטומטית")
    this.name = "CopyFailedError"
    this.text = text
  }
}

/**
 * Copy text that is not available until after an async call.
 * `clipboard.write` has to be invoked in the click turn; awaiting the network
 * first drops the user gesture and the browser rejects the copy.
 */
export async function copyTextWhenReady(loadText: () => Promise<string>): Promise<void> {
  const textPromise = loadText()
  const earlyWrite = startClipboardWrite(textPromise)

  let text: string
  try {
    text = await textPromise
  } catch (err) {
    await earlyWrite
    throw err
  }

  if (!text) throw new Error("אין מה להעתיק")
  if (await earlyWrite) return
  if (await writeTextNow(text)) return
  if (copyWithExecCommand(text)) return
  throw new CopyFailedError(text)
}

function startClipboardWrite(textPromise: Promise<string>): Promise<boolean> {
  if (typeof window === "undefined" || !window.isSecureContext) return Promise.resolve(false)
  const clipboard = navigator.clipboard
  if (!clipboard || typeof clipboard.write !== "function" || typeof ClipboardItem === "undefined") {
    return Promise.resolve(false)
  }

  const blobPromise = textPromise.then((text) => new Blob([text], { type: "text/plain" }))
  void blobPromise.catch(() => {})

  try {
    const item = new ClipboardItem({ "text/plain": blobPromise })
    return clipboard.write([item]).then(
      () => true,
      () => false,
    )
  } catch {
    return Promise.resolve(false)
  }
}

async function writeTextNow(text: string): Promise<boolean> {
  if (!window.isSecureContext || !navigator.clipboard?.writeText) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function copyWithExecCommand(text: string): boolean {
  const field = document.createElement("textarea")
  field.value = text
  field.setAttribute("readonly", "")
  field.style.position = "fixed"
  field.style.top = "0"
  field.style.left = "0"
  field.style.width = "1px"
  field.style.height = "1px"
  field.style.opacity = "0"
  document.body.appendChild(field)
  field.focus()
  field.select()
  field.setSelectionRange(0, text.length)
  let ok = false
  try {
    ok = document.execCommand("copy")
  } catch {
    ok = false
  } finally {
    field.remove()
  }
  return ok
}
