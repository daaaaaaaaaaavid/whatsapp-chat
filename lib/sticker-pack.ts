export type StickerPackItem = {
  id: string
  /** Display path (SVG for crisp UI). */
  src: string
  /** Upload path (PNG — allowed by media bucket). */
  fileSrc: string
  label: string
}

/** Built-in sticker pack (Twemoji, CC-BY 4.0). */
export const BUILTIN_STICKER_PACK: StickerPackItem[] = [
  { id: "grinning", src: "/stickers/grinning.svg", fileSrc: "/stickers/grinning.png", label: "חיוך" },
  { id: "joy", src: "/stickers/joy.svg", fileSrc: "/stickers/joy.png", label: "צחוק" },
  { id: "heart-eyes", src: "/stickers/heart-eyes.svg", fileSrc: "/stickers/heart-eyes.png", label: "מאוהב" },
  { id: "cool", src: "/stickers/cool.svg", fileSrc: "/stickers/cool.png", label: "מגניב" },
  { id: "kiss", src: "/stickers/kiss.svg", fileSrc: "/stickers/kiss.png", label: "נשיקה" },
  { id: "tongue", src: "/stickers/tongue.svg", fileSrc: "/stickers/tongue.png", label: "לשון" },
  { id: "think", src: "/stickers/think.svg", fileSrc: "/stickers/think.png", label: "חושב" },
  { id: "shush", src: "/stickers/shush.svg", fileSrc: "/stickers/shush.png", label: "ששש" },
  { id: "sleep", src: "/stickers/sleep.svg", fileSrc: "/stickers/sleep.png", label: "ישן" },
  { id: "cry", src: "/stickers/cry.svg", fileSrc: "/stickers/cry.png", label: "בוכה" },
  { id: "angry", src: "/stickers/angry.svg", fileSrc: "/stickers/angry.png", label: "כועס" },
  { id: "shock", src: "/stickers/shock.svg", fileSrc: "/stickers/shock.png", label: "מופתע" },
  { id: "party", src: "/stickers/party.svg", fileSrc: "/stickers/party.png", label: "מסיבה" },
  { id: "star-struck", src: "/stickers/star-struck.svg", fileSrc: "/stickers/star-struck.png", label: "כוכבים" },
  { id: "hug", src: "/stickers/hug.svg", fileSrc: "/stickers/hug.png", label: "חיבוק" },
  { id: "salute", src: "/stickers/salute.svg", fileSrc: "/stickers/salute.png", label: "מצדיע" },
  { id: "ok-hand", src: "/stickers/ok-hand.svg", fileSrc: "/stickers/ok-hand.png", label: "סבבה" },
  { id: "thumbs-up", src: "/stickers/thumbs-up.svg", fileSrc: "/stickers/thumbs-up.png", label: "לייק" },
  { id: "thumbs-down", src: "/stickers/thumbs-down.svg", fileSrc: "/stickers/thumbs-down.png", label: "דיסלייק" },
  { id: "clap", src: "/stickers/clap.svg", fileSrc: "/stickers/clap.png", label: "מחיאות כפיים" },
  { id: "wave", src: "/stickers/wave.svg", fileSrc: "/stickers/wave.png", label: "ביי" },
  { id: "pray", src: "/stickers/pray.svg", fileSrc: "/stickers/pray.png", label: "תודה" },
  { id: "muscle", src: "/stickers/muscle.svg", fileSrc: "/stickers/muscle.png", label: "כוח" },
  { id: "victory", src: "/stickers/victory.svg", fileSrc: "/stickers/victory.png", label: "ניצחון" },
  { id: "heart", src: "/stickers/heart.svg", fileSrc: "/stickers/heart.png", label: "לב" },
  { id: "two-hearts", src: "/stickers/two-hearts.svg", fileSrc: "/stickers/two-hearts.png", label: "שני לבבות" },
  { id: "sparkling-heart", src: "/stickers/sparkling-heart.svg", fileSrc: "/stickers/sparkling-heart.png", label: "לב נוצץ" },
  { id: "broken-heart", src: "/stickers/broken-heart.svg", fileSrc: "/stickers/broken-heart.png", label: "לב שבור" },
  { id: "fire", src: "/stickers/fire.svg", fileSrc: "/stickers/fire.png", label: "אש" },
  { id: "star", src: "/stickers/star.svg", fileSrc: "/stickers/star.png", label: "כוכב" },
  { id: "sparkles", src: "/stickers/sparkles.svg", fileSrc: "/stickers/sparkles.png", label: "ניצוצות" },
  { id: "boom", src: "/stickers/boom.svg", fileSrc: "/stickers/boom.png", label: "בום" },
  { id: "100", src: "/stickers/100.svg", fileSrc: "/stickers/100.png", label: "מאה" },
  { id: "check", src: "/stickers/check.svg", fileSrc: "/stickers/check.png", label: "וי" },
  { id: "cross", src: "/stickers/cross.svg", fileSrc: "/stickers/cross.png", label: "לא" },
  { id: "warning", src: "/stickers/warning.svg", fileSrc: "/stickers/warning.png", label: "זהירות" },
  { id: "coffee", src: "/stickers/coffee.svg", fileSrc: "/stickers/coffee.png", label: "קפה" },
  { id: "pizza", src: "/stickers/pizza.svg", fileSrc: "/stickers/pizza.png", label: "פיצה" },
  { id: "cake", src: "/stickers/cake.svg", fileSrc: "/stickers/cake.png", label: "עוגה" },
  { id: "balloon", src: "/stickers/balloon.svg", fileSrc: "/stickers/balloon.png", label: "בלון" },
  { id: "gift", src: "/stickers/gift.svg", fileSrc: "/stickers/gift.png", label: "מתנה" },
  { id: "trophy", src: "/stickers/trophy.svg", fileSrc: "/stickers/trophy.png", label: "גביע" },
  { id: "rocket", src: "/stickers/rocket.svg", fileSrc: "/stickers/rocket.png", label: "רקטה" },
  { id: "sun", src: "/stickers/sun.svg", fileSrc: "/stickers/sun.png", label: "שמש" },
  { id: "rainbow", src: "/stickers/rainbow.svg", fileSrc: "/stickers/rainbow.png", label: "קשת" },
  { id: "cat", src: "/stickers/cat.svg", fileSrc: "/stickers/cat.png", label: "חתול" },
  { id: "dog", src: "/stickers/dog.svg", fileSrc: "/stickers/dog.png", label: "כלב" },
  { id: "poop", src: "/stickers/poop.svg", fileSrc: "/stickers/poop.png", label: "קקי" },
]

export async function fetchStickerAsFile(item: StickerPackItem): Promise<File> {
  const res = await fetch(item.fileSrc)
  if (!res.ok) throw new Error("לא ניתן לטעון את המדבקה")
  const blob = await res.blob()
  const type = blob.type || "image/png"
  return new File([blob], `${item.id}.png`, { type })
}
