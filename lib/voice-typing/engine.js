// Speech → text engine from the "הקלדה קולית" Chrome extension (v1.8.46, src/content/settings.js).
// Kept close to the original so behaviour matches the extension; only storage was replaced.
/* eslint-disable */
const QW = {};

QW.DEFAULTS = {
  language: "he-IL",
  voiceCommands: true,
  sendCommand: true,
  mailSendPhrase: "שלח מייל",
  soundFeedback: true,
  autoCapitalize: true,
  autoPunctuation: true,
  autoStopOnSilence: true,
  continuous: true,
  enableGmail: true,
  enableChat: true,
  continueAfterSend: false
};

QW.LANGUAGES = [
  { code: "he-IL", label: "עברית", dir: "rtl" },
  { code: "en-US", label: "English (US)", dir: "ltr" },
  { code: "en-GB", label: "English (UK)", dir: "ltr" },
  { code: "ar-IL", label: "العربية", dir: "rtl" },
  { code: "ru-RU", label: "Русский", dir: "ltr" },
  { code: "fr-FR", label: "Français", dir: "ltr" },
  { code: "es-ES", label: "Español", dir: "ltr" },
  { code: "de-DE", label: "Deutsch", dir: "ltr" },
  { code: "yi-DE", label: "ייִדיש", dir: "rtl" }
];

QW.COMMAND_GROUPS = [
  { id: "punctuation", label: "פיסוק" },
  { id: "break", label: "שורות ורווחים" },
  { id: "send", label: "שליחה" },
  { id: "edit", label: "עריכה" },
  { id: "emoji", label: "אימוג'י" },
  { id: "snippet", label: "משפטים מוכנים" }
];

function makeCommand(group, phrase, action, value, extra) {
  return {
    id: `${group}:${phrase}`,
    group,
    phrase,
    action,
    value: value == null ? "" : String(value),
    enabled: true,
    ...(extra || {})
  };
}

QW.DEFAULT_COMMANDS = [
  makeCommand("punctuation", "פסיק", "text", ","),
  makeCommand("punctuation", "פסק", "text", ",", { trailing: true }),
  makeCommand("punctuation", "נקודה", "text", "."),
  makeCommand("punctuation", "סימן שאלה", "text", "?"),
  makeCommand("punctuation", "סימן השאלה", "text", "?"),
  makeCommand("punctuation", "סימן של שאלה", "text", "?"),
  makeCommand("punctuation", "שאלה", "text", "?", { trailing: true }),
  makeCommand("punctuation", "סימן קריאה", "text", "!"),
  makeCommand("punctuation", "סימן הקריאה", "text", "!"),
  makeCommand("punctuation", "סימן של קריאה", "text", "!"),
  makeCommand("punctuation", "קריאה", "text", "!", { trailing: true }),
  makeCommand("punctuation", "נקודתיים", "text", ":"),
  makeCommand("punctuation", "נקודה פסיק", "text", ";"),
  makeCommand("punctuation", "גרשיים", "text", '"'),
  makeCommand("punctuation", "גרש", "text", "'"),
  makeCommand("punctuation", "סוגריים פתוחים", "text", "("),
  makeCommand("punctuation", "סוגריים סגורים", "text", ")"),
  makeCommand("punctuation", "מקף", "text", "-"),
  makeCommand("punctuation", "שלוש נקודות", "text", "…", { trailing: true }),
  makeCommand("punctuation", "שלוש נקודה", "text", "…", { trailing: true }),
  makeCommand("punctuation", "סימן שלוש נקודות", "text", "…"),
  makeCommand("punctuation", "נקודה נקודה נקודה", "text", "…", { trailing: true }),
  makeCommand("punctuation", "3 נקודות", "text", "…", { trailing: true }),
  makeCommand("punctuation", "כרוכית", "text", "@"),
  makeCommand("punctuation", "שטרודל", "text", "@"),
  makeCommand("punctuation", "סולמית", "text", "#"),
  makeCommand("punctuation", "אחוז", "text", "%"),
  makeCommand("punctuation", "קו תחתון", "text", "_"),
  makeCommand("punctuation", "לוכסן", "text", "/"),

  makeCommand("break", "לרדת שורה", "newline", ""),
  makeCommand("break", "שורה חדשה", "newline", ""),
  makeCommand("break", "ירידת שורה", "newline", ""),
  makeCommand("break", "ירידה שורה", "newline", ""),
  makeCommand("break", "רדת שורה", "newline", ""),
  makeCommand("break", "תרד שורה", "newline", ""),
  makeCommand("break", "תוריד שורה", "newline", ""),
  makeCommand("break", "תורידי שורה", "newline", ""),
  makeCommand("break", "תרדי שורה", "newline", ""),
  makeCommand("break", "תרדו שורה", "newline", ""),
  makeCommand("break", "תורידו שורה", "newline", ""),
  makeCommand("break", "רד שורה", "newline", ""),
  makeCommand("break", "רדי שורה", "newline", ""),
  makeCommand("break", "תרד לי שורה", "newline", ""),
  makeCommand("break", "תוריד לי שורה", "newline", ""),
  makeCommand("break", "תרד לשורה", "newline", ""),
  makeCommand("break", "תוריד לשורה", "newline", ""),
  makeCommand("break", "שורה למטה", "newline", ""),
  makeCommand("break", "שורה הבאה", "newline", ""),
  makeCommand("break", "פסקה חדשה", "paragraph", ""),
  makeCommand("break", "רווח", "space", ""),

  makeCommand("send", "אנטר", "send", ""),
  makeCommand("send", "אינטר", "send", ""),
  makeCommand("send", "enter", "send", ""),
  makeCommand("send", "שלח", "send", ""),
  makeCommand("send", "שלחי", "send", ""),
  makeCommand("send", "שליחה", "send", ""),
  makeCommand("send", "שלח הודעה", "send", ""),
  makeCommand("send", "שליחת הודעה", "send", ""),
  makeCommand("send", "שלח מייל", "send", ""),
  makeCommand("send", "שלח את המייל", "send", ""),
  makeCommand("send", "לשלוח", "send", ""),
  makeCommand("send", "תשלח", "send", ""),

  makeCommand("edit", "מחק", "undo", ""),
  makeCommand("edit", "תמחק", "undo", ""),
  makeCommand("edit", "תמחוק", "undo", ""),
  makeCommand("edit", "למחוק", "undo", ""),
  makeCommand("edit", "מחקי", "undo", ""),
  makeCommand("edit", "מחקו", "undo", ""),
  makeCommand("edit", "תמחקי", "undo", ""),
  makeCommand("edit", "תמחקו", "undo", ""),
  makeCommand("edit", "מחק מילה", "undo", ""),
  makeCommand("edit", "תמחק מילה", "undo", ""),
  makeCommand("edit", "תמחוק מילה", "undo", ""),
  makeCommand("edit", "למחוק מילה", "undo", ""),
  makeCommand("edit", "מחק את זה", "undo", ""),
  makeCommand("edit", "תמחק את זה", "undo", ""),
  makeCommand("edit", "תמחוק את זה", "undo", ""),
  makeCommand("edit", "למחוק את זה", "undo", ""),
  makeCommand("edit", "מחק את המילה", "undo", ""),
  makeCommand("edit", "מחק מילה אחרונה", "undo", ""),
  makeCommand("edit", "ביטול אחרון", "undo", ""),
  makeCommand("edit", "בטל אחרון", "undo", ""),
  makeCommand("edit", "מחק הכל", "clear", ""),
  makeCommand("edit", "מחק הכול", "clear", ""),
  makeCommand("edit", "מחק כל", "clear", ""),
  makeCommand("edit", "מחק את הכל", "clear", ""),
  makeCommand("edit", "מחק את הכול", "clear", ""),
  makeCommand("edit", "מחק את כל", "clear", ""),
  makeCommand("edit", "תמחק הכל", "clear", ""),
  makeCommand("edit", "תמחק הכול", "clear", ""),
  makeCommand("edit", "תמחק כל", "clear", ""),
  makeCommand("edit", "תמחק את הכל", "clear", ""),
  makeCommand("edit", "תמחק את הכול", "clear", ""),
  makeCommand("edit", "תמחק את כל", "clear", ""),
  makeCommand("edit", "תמחוק הכל", "clear", ""),
  makeCommand("edit", "תמחוק הכול", "clear", ""),
  makeCommand("edit", "תמחוק את הכל", "clear", ""),
  makeCommand("edit", "תמחוק את הכול", "clear", ""),
  makeCommand("edit", "למחוק הכל", "clear", ""),
  makeCommand("edit", "למחוק הכול", "clear", ""),
  makeCommand("edit", "למחוק את הכל", "clear", ""),
  makeCommand("edit", "למחוק את הכול", "clear", ""),
  makeCommand("edit", "נקה הכל", "clear", ""),
  makeCommand("edit", "נקה הכול", "clear", ""),
  makeCommand("edit", "נקה את הכל", "clear", ""),
  makeCommand("edit", "נקה את הכול", "clear", ""),
  makeCommand("edit", "תנקה הכל", "clear", ""),
  makeCommand("edit", "תנקה הכול", "clear", ""),
  makeCommand("edit", "תתחיל מחדש", "clear", ""),
  makeCommand("edit", "תתחילי מחדש", "clear", ""),
  makeCommand("edit", "נתחיל מחדש", "clear", ""),
  makeCommand("edit", "מההתחלה", "clear", ""),
  makeCommand("edit", "מההתחלה מחדש", "clear", ""),
  makeCommand("edit", "תמחק את המשפט", "undoSentence", ""),
  makeCommand("edit", "מחק את המשפט", "undoSentence", ""),
  makeCommand("edit", "תמחק משפט", "undoSentence", ""),
  makeCommand("edit", "מחק משפט", "undoSentence", ""),
  makeCommand("edit", "מחק משפט אחרון", "undoSentence", ""),
  makeCommand("edit", "תמחק משפט אחרון", "undoSentence", ""),
  makeCommand("edit", "לא את זה", "undoSentence", ""),
  makeCommand("edit", "לא לא את זה", "undoSentence", ""),
  makeCommand("edit", "scratch that", "undoSentence", ""),

  makeCommand("emoji", "אימוג'י צוחק", "text", "😂"),
  makeCommand("emoji", "אימוג'י צחוק", "text", "😂"),
  makeCommand("emoji", "אימוג'י חיוך", "text", "😊"),
  makeCommand("emoji", "אימוג'י קריצה", "text", "😉"),
  makeCommand("emoji", "אימוג'י אהבה", "text", "😍"),
  makeCommand("emoji", "אימוג'י לב", "text", "❤️"),
  makeCommand("emoji", "אימוג'י בוכה", "text", "😭"),
  makeCommand("emoji", "אימוג'י עצוב", "text", "😢"),
  makeCommand("emoji", "אימוג'י כועס", "text", "😠"),
  makeCommand("emoji", "אימוג'י חושב", "text", "🤔"),
  makeCommand("emoji", "אימוג'י וואו", "text", "😮"),
  makeCommand("emoji", "אימוג'י גלגול עיניים", "text", "🙄"),
  makeCommand("emoji", "אימוג'י מצחקק", "text", "😅"),
  makeCommand("emoji", "אימוג'י רועד מצחוק", "text", "🤣"),
  makeCommand("emoji", "אימוג'י אש", "text", "🔥"),
  makeCommand("emoji", "אימוג'י ידיים", "text", "👏"),
  makeCommand("emoji", "אימוג'י תפילה", "text", "🙏"),
  makeCommand("emoji", "אימוג'י יד", "text", "👋"),
  makeCommand("emoji", "אימוג'י לייק", "text", "👍"),
  makeCommand("emoji", "אימוג'י אגודל", "text", "👍"),
  makeCommand("emoji", "אימוג'י דיסלייק", "text", "👎"),
  makeCommand("emoji", "אימוג'י וי", "text", "✅"),
  makeCommand("emoji", "אימוג'י עיניים", "text", "👀"),
  makeCommand("emoji", "אימוג'י כוכב", "text", "⭐"),
  makeCommand("emoji", "אימוג'י מסיבה", "text", "🎉"),
  makeCommand("emoji", "אימוג'י קפה", "text", "☕"),
  makeCommand("emoji", "אימוג'י רעיון", "text", "💡"),
  makeCommand("emoji", "אימוג'י בושה", "text", "😳"),

  makeCommand("snippet", "תודה רבה", "text", "תודה רבה"),
  makeCommand("snippet", "בבקשה", "text", "בבקשה"),
  makeCommand("snippet", "סליחה", "text", "סליחה"),
  makeCommand("snippet", "בהצלחה", "text", "בהצלחה"),
  makeCommand("snippet", "יום טוב", "text", "יום טוב"),
  makeCommand("snippet", "שבת שלום", "text", "שבת שלום"),
  makeCommand("snippet", "נשמע טוב", "text", "נשמע טוב"),
  makeCommand("snippet", "אעדכן", "text", "אעדכן"),
  makeCommand("snippet", "רגע בבקשה", "text", "רגע בבקשה"),
  makeCommand("snippet", "אין בעיה", "text", "אין בעיה"),
  makeCommand("snippet", "מצוין", "text", "מצוין"),
  makeCommand("snippet", "בסדר גמור", "text", "בסדר גמור"),
  makeCommand("snippet", "תודה לך", "text", "תודה לך"),
  makeCommand("snippet", "מעולה", "text", "מעולה"),
  makeCommand("snippet", "מובן", "text", "מובן"),
  makeCommand("snippet", "אחזור אליך", "text", "אחזור אליך"),
  makeCommand("snippet", "אבדוק ואחזור", "text", "אבדוק ואחזור")
];

QW.isRtl = (lang) => {
  const item = QW.LANGUAGES.find((l) => l.code === lang);
  return item ? item.dir === "rtl" : String(lang).startsWith("he") || String(lang).startsWith("ar") || String(lang).startsWith("yi");
};

QW.normalizeSpeech = (text) =>
  String(text || "")
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/[׳’]/g, "'")
    .replace(/[.,!?…]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const KEEP_STUTTER_WORDS = new Set(["לי"]);

function looseKeepPunct(s) {
  return String(s || "")
    .replace(/[\u200B\uFEFF\u00A0]/g, " ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^ +| +$/g, "");
}

function compactSpeechLetters(s) {
  return QW.normalizeSpeech(s).replace(/[\s,.;:?!…]+/g, "");
}

QW.isLetterStutter = (s) => {
  const raw = looseKeepPunct(s);
  if (!raw || /^[,.;:?!…]+$/.test(raw)) return false;
  const t = QW.normalizeSpeech(raw);
  if (!t) return false;
  if (KEEP_STUTTER_WORDS.has(t)) return false;
  const compact = compactSpeechLetters(t);
  if (/^וואו$/.test(compact) || KEEP_STUTTER_WORDS.has(compact)) return false;
  if (/^[יל]$/.test(compact)) return true;
  if (/^[יל]{2,}$/.test(compact) && !KEEP_STUTTER_WORDS.has(compact)) return true;
  if (/^ו{3,}$/.test(compact)) return true;
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && parts.every((p) => /^[ילו]$/.test(p))) return true;
  return false;
};

QW.scrubLetterStutter = (s) => {
  const raw = String(s == null ? "" : s);
  const lead = (raw.match(/^\s*/) || [""])[0];
  const trail = (raw.match(/\s*$/) || [""])[0];
  let t = looseKeepPunct(raw);
  if (!t) return t;
  if (/^[,.;:?!…]+$/.test(t)) return t;
  t = t.replace(/(^|[\s,.;:?!…])[יל](?:\s+[יל])+(?=[\s,.;:?!…]|$)/g, "$1");
  t = t.replace(/(^|[\s,.;:?!…])ו(?:\s+ו){2,}(?=[\s,.;:?!…]|$)/g, "$1");
  t = t.replace(/(^|[\s,.;:?!…])(?!לי(?:[\s,.;:?!…]|$))[יל]{2,}(?=[\s,.;:?!…]|$)/g, "$1");
  t = t.replace(/(^|[\s,.;:?!…])ו{4,}(?=[\s,.;:?!…]|$)/g, "$1");
  return lead + looseKeepPunct(t) + trail;
};

QW.SPEECH_CONFUSIONS = [["נישואים", "ניסויים", "נישואין"]];

function confusionGroup(word) {
  const w = QW.normalizeSpeech(word);
  if (!w) return null;
  return QW.SPEECH_CONFUSIONS.find((group) => group.some((item) => QW.normalizeSpeech(item) === w)) || null;
}

QW.sameSpeechConfusion = (a, b) => {
  const left = QW.normalizeSpeech(a);
  const right = QW.normalizeSpeech(b);
  if (!left || !right || left === right) return false;
  const group = confusionGroup(left);
  return Boolean(group && group.some((item) => QW.normalizeSpeech(item) === right));
};

QW.speechConfusionAlt = (word) => {
  const w = QW.normalizeSpeech(word);
  const group = confusionGroup(w);
  if (!group) return "";
  const i = group.findIndex((item) => QW.normalizeSpeech(item) === w);
  if (i < 0) return "";
  return group[(i + 1) % group.length];
};

QW.applySpeechConfusion = (text, opts) => {
  const raw = QW.normalizeSpeech(text);
  if (!raw) return raw;
  const rewrites = (opts && opts.rewrites) || {};
  const words = raw.split(/\s+/).filter(Boolean).map((word) => rewrites[word] || word);
  const lastWord = QW.normalizeSpeech((opts && opts.lastWord) || "");
  const last = words[words.length - 1] || "";
  if (lastWord && last === lastWord) {
    const group = confusionGroup(last);
    if (group) {
      const altLasts = ((opts && opts.alts) || [])
        .map((item) => QW.normalizeSpeech(item).split(/\s+/).filter(Boolean).pop() || "")
        .filter(Boolean);
      const fromAlt = altLasts.find((word) => group.includes(word) && word !== last);
      const next = fromAlt || QW.speechConfusionAlt(last);
      if (next && next !== last) words[words.length - 1] = next;
    }
  }
  return words.join(" ");
};

QW.escapePhrase = (phrase) =>
  String(phrase || "")
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[\\s-]+");

QW.cloneCommands = (list) => (list || []).map((item) => ({ ...item }));

QW.activeCommands = (settings) => {
  const list = settings && Array.isArray(settings.commands) && settings.commands.length
    ? settings.commands
    : QW.DEFAULT_COMMANDS;
  return list.filter((item) => item && item.enabled !== false && item.phrase);
};

function isEditAction(action) {
  return action === "undo" || action === "clear" || action === "undoSentence";
}

QW.commandResultLabel = (item) => {
  if (!item) return "";
  if (item.action === "send") return "שליחה";
  if (item.action === "undo") return "מחיקת מילה אחורה";
  if (item.action === "undoSentence") return "מחיקת המשפט האחרון";
  if (item.action === "clear") return "מחיקת כל הטקסט";
  if (item.action === "newline") return "שורה חדשה";
  if (item.action === "paragraph") return "פסקה חדשה";
  if (item.action === "space") return "רווח";
  return item.value || "";
};

QW.commandInsertValue = (item) => {
  if (!item) return "";
  if (item.action === "newline") return "\n";
  if (item.action === "paragraph") return "\n\n";
  if (item.action === "space") return " ";
  if (item.action === "text") {
    const value = item.value == null ? "" : String(item.value);
    if (value !== "") return value;
    return item.phrase == null ? "" : String(item.phrase);
  }
  return "";
};

let compiledCacheKey = "";
let compiledCacheRows = [];

function compiledCommands(settings) {
  const list = commandsForSpeech(settings);
  const key = [
    settings && settings.composerKind,
    settings && settings.mailSendPhrase,
    settings && settings.sendCommand
  ].join("\0") + "\n" + list
    .map((item) => `${item.id}\0${item.phrase}\0${item.action}\0${item.value}\0${item.enabled !== false ? 1 : 0}\0${item.trailing ? 1 : 0}`)
    .join("\n");
  if (key === compiledCacheKey) return compiledCacheRows;
  compiledCacheKey = key;
  compiledCacheRows = list
    .map((item) => ({
      item,
      norm: QW.normalizeSpeech(item.phrase),
      re: new RegExp(`(?:^|\\s)(${QW.escapePhrase(item.phrase)})(?=\\s|$)`, "gi")
    }))
    .filter((row) => row.norm)
    .sort((a, b) => b.norm.length - a.norm.length);
  return compiledCacheRows;
}

function snippetValueNorm(item) {
  return QW.normalizeSpeech(QW.commandInsertValue(item));
}

function isExpandingSnippetRow(row) {
  if (!row || !row.item || row.item.action !== "text") return false;
  if (row.item.group !== "snippet" && row.item.group !== "emoji") return false;
  const value = snippetValueNorm(row.item);
  return Boolean(value) && value !== row.norm;
}

function shouldHoldPrefix(token, row) {
  if (!token || !row || row.norm === token || !row.norm.startsWith(token)) return false;
  if (row.item.group === "snippet" && !isExpandingSnippetRow(row)) return false;
  const words = row.norm.split(/\s+/);
  if (words.length > 1 && words[0] === token) return true;
  if (row.item.action === "newline" || row.item.action === "paragraph") {
    return token.length >= 1;
  }
  if (isEditAction(row.item.action) || row.item.action === "send") {
    return token.length >= 2;
  }
  if (isExpandingSnippetRow(row)) return token.length >= 2;
  return token.length >= 3;
}

function isPrefixOfLongerCommand(token, rows) {
  if (!token) return false;
  return rows.some((row) => {
    if (!row.norm || row.norm === token) return false;
    if (row.item.group === "snippet" && !isExpandingSnippetRow(row)) return false;
    if (row.norm.startsWith(`${token} `) || row.norm.startsWith(`${token}-`)) return true;
    if (token.includes(" ") || row.norm.includes(" ")) return false;
    if (!row.norm.startsWith(token)) return false;
    const minLen = isEditAction(row.item.action) || row.item.action === "send" || isExpandingSnippetRow(row) ? 2 : 3;
    return token.length >= minLen;
  });
}

const COMMAND_FILLER = /^(?:אה+|אמ+|המ+|אהמ+|כאילו|יעני|אוקיי|אוקי|טוב|רגע|בבקשה|please|ok|okay|עכשיו)\s+/i;

function stripCommandFiller(text) {
  let next = String(text || "").trim();
  while (next && COMMAND_FILLER.test(next)) next = next.replace(COMMAND_FILLER, "").trim();
  return next;
}

QW.MEANT_PREFIXES = [
  "לא התכוונתי ל",
  "התכוונתי ל",
  "i meant",
  "i mean"
];

function repairMeantSpeech(text) {
  return String(text || "")
    .replace(/(^|\s)לא\s+התכונתי(?=\s|$)/gi, "$1לא התכוונתי")
    .replace(/(^|\s)התכונתי(?=\s|$)/gi, "$1התכוונתי");
}

function parseMeantCorrection(raw) {
  const text = repairMeantSpeech(QW.normalizeSpeech(raw));
  if (!text) return null;
  const prefixes = QW.MEANT_PREFIXES.slice().sort((a, b) => b.length - a.length);
  for (const prefix of prefixes) {
    const norm = QW.normalizeSpeech(prefix);
    if (!norm || !text.startsWith(`${norm} `)) continue;
    const rest = text.slice(norm.length).trim();
    if (!rest) continue;
    const targetWords = rest.split(/\s+/).filter(Boolean);
    if (targetWords.length !== 1) continue;
    if (norm.endsWith(" ל")) {
      if (!/^\S+$/.test(rest)) continue;
      return { meant: rest.replace(/^ל/, "") || rest };
    }
    return { meant: rest };
  }

  // Hebrew speakers commonly attach the preposition ל to the corrected word:
  // "התכוונתי לשלוח" / ASR variant "התכונתי לשלוח". Treat only a single
  // attached target word as a correction; longer sentences remain ordinary text.
  for (const base of ["לא התכוונתי", "התכוונתי"]) {
    if (!text.startsWith(`${base} `)) continue;
    const rest = text.slice(base.length).trim();
    const targetWords = rest.split(/\s+/).filter(Boolean);
    if (targetWords.length !== 1) continue;
    const target = targetWords[0];
    if (!/^ל\S{2,}$/.test(target)) continue;
    if (/^ל(?:ך|י|ו|ה|נו|כם|כן)$/.test(target)) continue;
    return { meant: target.slice(1) };
  }
  return null;
}

QW.cleanSpoken = (text) => {
  let s = String(text == null ? "" : text);
  if (!s.trim()) return text;
  const lead = (s.match(/^\s*/) || [""])[0];
  const trail = (s.match(/\s*$/) || [""])[0];
  let inner = s.slice(lead.length, s.length - trail.length);
  inner = inner.replace(/^(?:אמ+|אהמ+|המ+|כאילו|יעני|um+|uh+|erm)\s+/gi, "");
  inner = inner.replace(/(^|[\s,])(?:אמ+|אהמ+|המ+|כאילו|יעני|um+|uh+|erm)(?=[\s,]|$)/gi, (m, left) => (left === "," ? "," : left ? " " : ""));
  inner = inner.replace(/[ \t]{2,}/g, " ").replace(/ +\n/g, "\n").replace(/\n +/g, "\n");
  inner = inner.replace(/^[ \t]+|[ \t]+$/g, "");
  return lead + inner + trail;
};

QW.intentLabel = (parsed, written, raw) => {
  if (!parsed) return "";
  if (parsed.clear) return "מחדש";
  if (parsed.undoSentence) return "מחיקת משפט";
  if (parsed.meant) return "תיקון";
  if (parsed.undo) return "מחיקה";
  if (parsed.send) return "שליחה";
  if (parsed.snippet) return "משפט מוכן";
  const text = String(written != null ? written : parsed.text || "");
  if (text === "\n" || text === "\n\n") return "שורה חדשה";
  if (/\?\s*$/.test(text)) return "שאלה";
  if (/!\s*$/.test(text)) return "קריאה";
  return "";
};

function commandMatchKey(row) {
  return `${row.item.action}\0${row.item.value == null ? "" : row.item.value}`;
}

function repairCommandSpeech(text) {
  return String(text || "")
    .replace(/(^|\s)סימן\s+(?:ה|של\s+)?שאלה\s*[?؟.!]*(?=\s|$)/gi, "$1סימן שאלה")
    .replace(/(^|\s)סימן\s+(?:ה|של\s+)?קרי(?:אה|עה|יה|א|ה)?\s*[!?.]*(?=\s|$)/gi, "$1סימן קריאה")
    .replace(/(^|\s)סימן\s*[?؟](?=\s|$)/gi, "$1סימן שאלה")
    .replace(/(^|\s)סימן\s*!(?=\s|$)/gi, "$1סימן קריאה")
    .replace(/(^|\s)((?:ת)?מחק(?:י|ו)?|תמחוק|למחוק)\s+(?:את\s+)?(?:ה\s*)?(?:כל|כול)(?:ם)?(?=\s|$)/gi, "$1מחק הכל")
    .replace(/(^|\s)(?:ת)?מחק(?:י|ו)?\s+את\s+המשפט(?=\s|$)/gi, "$1מחק את המשפט")
    .replace(/(^|\s)תתחילי?\s+מחדש(?=\s|$)/gi, "$1תתחיל מחדש")
    .replace(/(^|\s)סימן\s+קרי(?:עה|יה|ה)(?=\s|$)/gi, "$1סימן קריאה")
    .replace(/(^|\s)סימן\s+שאלת(?=\s|$)/gi, "$1סימן שאלה")
    .replace(/(^|\s)נקודתים(?=\s|$)/gi, "$1נקודתיים")
    .replace(/(^|\s)סוגריים\s+פתוח(?=\s|$)/gi, "$1סוגריים פתוחים")
    .replace(/(^|\s)סוגריים\s+סגור(?=\s|$)/gi, "$1סוגריים סגורים")
    .replace(/(^|\s)אימוג['׳]?י\s+/gi, "$1אימוג'י ")
    .replace(/(^|\s)אימוגי\s+/gi, "$1אימוג'י ")
    .replace(/(^|\s)נקודה\s+פסיק(?=\s|$)/gi, "$1נקודה פסיק")
    .replace(/(^|\s)(?:שלוש|3)\s+נקוד(?:ה|ות)(?=\s|$)/gi, "$1שלוש נקודות")
    .replace(/(^|\s)נקודה\s+נקודה\s+נקודה(?=\s|$)/gi, "$1שלוש נקודות");
}

function uniqueTruncatedCommand(token, rows) {
  const norm = QW.normalizeSpeech(token);
  if (!norm) return null;
  const exact = rows.find((row) => row.norm === norm);
  if (exact) return exact;
  const tokWords = norm.split(/\s+/).filter(Boolean);
  if (!tokWords.length) return null;
  const hits = [];
  const seen = new Set();
  for (const row of rows) {
    if (!row.norm) continue;
    const words = row.norm.split(/\s+/);
    if (words.length !== tokWords.length) continue;
    let ok = true;
    for (let i = 0; i < words.length; i += 1) {
      if (words[i] === tokWords[i]) continue;
      const last = i === words.length - 1;
      if (!last || !words[i].startsWith(tokWords[i])) {
        ok = false;
        break;
      }
      if (tokWords[i].length < (words.length === 1 ? Math.max(4, Math.ceil(words[i].length * 0.7)) : 2)) {
        ok = false;
        break;
      }
    }
    if (!ok || words[words.length - 1] === tokWords[tokWords.length - 1]) continue;
    const key = commandMatchKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push(row);
  }
  return hits.length === 1 ? hits[0] : null;
}

function rewriteTruncatedCommands(text, rows) {
  const parts = QW.normalizeSpeech(text).split(/\s+/).filter(Boolean);
  if (!parts.length) return QW.normalizeSpeech(text);
  const out = [];
  for (let i = 0; i < parts.length; ) {
    let row = null;
    let n = 1;
    for (let len = Math.min(4, parts.length - i); len >= 1; len -= 1) {
      const token = parts.slice(i, i + len).join(" ");
      const hit = rows.find((item) => item.norm === token) || uniqueTruncatedCommand(token, rows);
      if (!hit) continue;
      row = hit;
      n = len;
      break;
    }
    if (row && row.norm.split(/\s+/).length === n) {
      out.push(...row.norm.split(/\s+/));
      i += n;
    } else {
      out.push(parts[i]);
      i += 1;
    }
  }
  return out.join(" ");
}

function canonCommandSpeech(raw, rows) {
  return rewriteTruncatedCommands(QW.normalizeSpeech(repairCommandSpeech(raw)), rows);
}

function resolvesToCommand(token, rows) {
  const norm = QW.normalizeSpeech(token);
  if (!norm) return false;
  const canon = canonCommandSpeech(norm, rows);
  return rows.some((row) => row.norm === norm || row.norm === canon);
}

QW.incompleteCommandTail = (raw, settings) => {
  if (!settings || settings.voiceCommands === false) return null;
  const rows = compiledCommands(settings);
  const text = canonCommandSpeech(raw, rows);
  if (!text) return null;
  const meant = parseMeantCorrection(text);
  if (meant && meant.hold) return { head: "", tail: text };
  const stripped = stripCommandFiller(text) || text;
  const complete = (token) => resolvesToCommand(token, rows);
  const prefixOfCommand = (token) => rows.some((row) => shouldHoldPrefix(token, row));
  if (complete(stripped) && !isPrefixOfLongerCommand(stripped, rows)) return null;
  if (prefixOfCommand(stripped) || isPrefixOfLongerCommand(stripped, rows)) return { head: "", tail: text };
  const parts = text.split(/\s+/);
  for (let n = Math.min(parts.length, 6); n >= 2; n -= 1) {
    const suffix = parts.slice(-n).join(" ");
    if (complete(suffix) && !isPrefixOfLongerCommand(suffix, rows)) return null;
  }
  const last = parts[parts.length - 1];
  if (!last || !prefixOfCommand(last)) return null;
  if (complete(last) && !isPrefixOfLongerCommand(last, rows)) return null;
  if (parts.length >= 2) {
    const prev = parts[parts.length - 2];
    const glued = `${prev} ${last}`;
    if (complete(glued) && !isPrefixOfLongerCommand(glued, rows)) return null;
    const continuesCommand = rows.some(
      (row) => shouldHoldPrefix(glued, row) || row.norm.startsWith(`${glued} `) || row.norm.startsWith(`${glued}-`)
    );
    const holdableLast = prefixOfCommand(last) || isPrefixOfLongerCommand(last, rows);
    if (!continuesCommand && !holdableLast) return null;
  }
  return { head: parts.slice(0, -1).join(" "), tail: last };
};

QW.isStickyHoldTail = (raw, settings) => {
  const rows = compiledCommands(settings);
  const text = canonCommandSpeech(raw, rows);
  if (!text || !settings || settings.voiceCommands === false) return false;
  if (rows.some((row) => row.norm === text)) return false;
  return rows.some((row) => {
    if (row.item.group === "snippet" && !isExpandingSnippetRow(row)) return false;
    const words = row.norm.split(/\s+/);
    if (words.length > 1 && words[0] === text) return true;
    if (
      !isEditAction(row.item.action) &&
      row.item.action !== "send" &&
      row.item.action !== "newline" &&
      row.item.action !== "paragraph" &&
      !isExpandingSnippetRow(row)
    ) {
      return false;
    }
    return row.norm.startsWith(text) && row.norm !== text && text.length >= 2;
  });
};

QW.isActionPhrase = (raw, settings) => {
  if (!raw || !settings || settings.voiceCommands === false) return false;
  const parsed = QW.processUtterance(raw, settings);
  return Boolean(parsed.send || parsed.undo || parsed.clear || parsed.undoSentence || parsed.meant);
};

QW.isExactCommand = (raw, settings) => {
  if (!raw || !settings || settings.voiceCommands === false) return false;
  const rows = compiledCommands(settings);
  const text = canonCommandSpeech(raw, rows);
  if (!text) return false;
  const stripped = stripCommandFiller(text) || text;
  return rows.some((row) => row.norm === text || row.norm === stripped);
};

QW.isAmbiguousCommandPrefix = (raw, settings) => {
  if (!raw || !settings || settings.voiceCommands === false) return false;
  const rows = compiledCommands(settings);
  const text = canonCommandSpeech(raw, rows);
  if (!text) return false;
  const stripped = stripCommandFiller(text) || text;
  const row = rows.find((item) => item.norm === text || item.norm === stripped);
  if (!row) return false;
  if (!isEditAction(row.item.action) && row.item.action !== "send") return false;
  return rows.some((other) => {
    if (other.norm === row.norm || other.item.group === "snippet") return false;
    if (other.item.action === row.item.action) return false;
    return other.norm.startsWith(`${row.norm} `) || other.norm.startsWith(`${row.norm}-`);
  });
};

QW.peelPunctMarkLeftover = (text) => {
  const trimmed = String(text || "").replace(/\s+$/g, "");
  if (!trimmed) return null;
  const m = trimmed.match(/(?:^|\s)(סימן(?:\s+(?:קר(?:י(?:א(?:ה)?)?)?|קרי(?:עה|יה|ה)|שאל(?:ה|ת)?))?)$/);
  if (!m) return null;
  return {
    head: trimmed.slice(0, m.index).replace(/\s+$/g, ""),
    mark: m[1].trim()
  };
};

QW.hasExplicitBreakCommand = (raw, settings) => {
  if (!raw || !settings || settings.voiceCommands === false) return false;
  const text = QW.normalizeSpeech(repairCommandSpeech(raw));
  if (!text) return false;
  const rows = compiledCommands(settings);
  return rows.some((row) => {
    if (row.item.action !== "newline" && row.item.action !== "paragraph") return false;
    row.re.lastIndex = 0;
    return row.re.test(text);
  });
};

QW.speechHasCommands = (raw, settings) => {
  if (!raw || !settings || settings.voiceCommands === false) return false;
  const parsed = QW.processUtterance(raw, settings);
  if (parsed.send || parsed.undo || parsed.clear || parsed.undoSentence || parsed.meant || parsed.spaces) return true;
  const norm = QW.normalizeSpeech(raw);
  const out = String(parsed.text || "");
  if (!norm) return false;
  if (out.includes("\n") && !String(raw).includes("\n")) return true;
  return out !== norm;
};

QW.isBareCommandPrefix = (raw, settings) => {
  const incomplete = QW.incompleteCommandTail(raw, settings);
  return Boolean(incomplete && !incomplete.head && incomplete.tail) && !QW.isExactCommand(raw, settings);
};

QW.isActionCommandPrefix = (raw, settings) => {
  if (!raw || !settings || settings.voiceCommands === false) return false;
  const rows = compiledCommands(settings);
  const text = canonCommandSpeech(raw, rows);
  const last = (text.split(/\s+/).filter(Boolean).pop() || text);
  if (!last) return false;
  return rows.some(
    (row) =>
      (row.item.action === "send" || isEditAction(row.item.action)) &&
      shouldHoldPrefix(last, row)
  );
};

function echoSuffixList(phrases) {
  const out = [];
  const seen = new Set();
  const add = (token) => {
    const t = QW.normalizeSpeech(token);
    if (!t || t.length < 2 || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  for (const phrase of phrases) {
    const norm = QW.normalizeSpeech(phrase);
    if (!norm) continue;
    add(norm);
    const compact = norm.replace(/\s+/g, "");
    for (let i = compact.length - 1; i >= 2; i -= 1) add(compact.slice(0, i));
    const words = norm.split(/\s+/).filter(Boolean);
    for (let n = 1; n <= words.length; n += 1) add(words.slice(0, n).join(" "));
    const first = words[0] || "";
    for (let i = first.length - 1; i >= 2; i -= 1) add(first.slice(0, i));
  }
  out.sort((a, b) => b.length - a.length);
  return out;
}

QW.sendEchoSuffixes = (settings) => {
  const phrases = sendPhrasesForSpeech(settings).filter((item) => /שלח|שלחי|שליחה|לשלוח|תשלח|\bsend\b/i.test(item));
  return echoSuffixList(phrases);
};

const EDIT_ECHO_ROOT = /^(?:ת?מחק|תמחוק|למחוק|נקה|בטל|ביטול|תתחיל|מההתחלה)/i;

QW.editEchoSuffixes = (settings, actions) => {
  const want = Array.isArray(actions) && actions.length ? new Set(actions) : new Set(["undo", "clear", "undoSentence"]);
  const phrases = QW.activeCommands(settings)
    .filter((item) => want.has(item.action))
    .map((item) => QW.normalizeSpeech(item.phrase))
    .filter(Boolean);
  const out = [];
  const seen = new Set();
  const add = (token) => {
    const t = QW.normalizeSpeech(token);
    if (!t || t.length < 2 || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  for (const phrase of phrases) {
    add(phrase);
    if (!EDIT_ECHO_ROOT.test(phrase)) continue;
    const compact = phrase.replace(/\s+/g, "");
    for (let i = compact.length - 1; i >= 2; i -= 1) add(compact.slice(0, i));
    const words = phrase.split(/\s+/).filter(Boolean);
    for (let n = 1; n <= words.length; n += 1) add(words.slice(0, n).join(" "));
    const first = words[0] || "";
    for (let i = first.length - 1; i >= 2; i -= 1) add(first.slice(0, i));
  }
  out.sort((a, b) => b.length - a.length);
  return out;
};

QW.peelEditEchoLeftover = (text, settings, actions) => {
  const raw = String(text || "").replace(/^\s+|\s+$/g, "");
  if (!raw || !settings || settings.voiceCommands === false) return null;
  const suffixes = QW.editEchoSuffixes(settings, actions);
  for (const d of suffixes) {
    if (!d) continue;
    const esc = QW.escapePhrase(d);
    const end = raw.match(new RegExp(`(?:^|\\s)(${esc})$`, "i"));
    if (end) {
      return { head: raw.slice(0, end.index).replace(/\s+$/g, ""), echo: d };
    }
    const start = raw.match(new RegExp(`^(${esc})(?:\\s+|$)`, "i"));
    if (start) {
      return { head: raw.slice(start[0].length).replace(/^\s+/g, ""), echo: d };
    }
  }
  return null;
};

QW.isCommandPrefix = (raw, settings) => Boolean(QW.incompleteCommandTail(raw, settings));

QW.SEND_PHRASES = [
  "שלח הודעה",
  "שליחת הודעה",
  "לשלוח",
  "תשלח",
  "שלחי",
  "שליחה",
  "שלח",
  "אנטר",
  "אינטר",
  "enter",
  "send message",
  "send it",
  "send"
];

QW.SEND_NOT_TRAILING = ["לשלוח", "תשלח", "שליחה", "אני רוצה לשלוח", "רוצה לשלוח"];
QW.DEFAULT_MAIL_SEND_PHRASE = "שלח מייל";
QW.MAIL_SEND_ALIASES = ["שלח את המייל", "שלח המייל", "שליחת מייל", "send email", "send mail"];
QW.ENTER_PHRASES = ["אנטר", "אינטר", "enter"];

QW.speechKind = (settings) => (settings && settings.composerKind) || "chat";

QW.mailSendPhrases = (settings) => {
  const custom = QW.normalizeSpeech(settings && settings.mailSendPhrase);
  const primary = custom || QW.DEFAULT_MAIL_SEND_PHRASE;
  const phrases = [primary, ...QW.MAIL_SEND_ALIASES.map((item) => QW.normalizeSpeech(item))];
  return phrases.filter((item, i, arr) => item && arr.indexOf(item) === i);
};

function uniquePhrases(list) {
  return list.filter((item, i, arr) => item && arr.indexOf(item) === i).sort((a, b) => b.length - a.length);
}

function sendPhrasesForSpeech(settings) {
  if (QW.speechKind(settings) === "mail") return uniquePhrases(QW.mailSendPhrases(settings));
  return uniquePhrases(
    QW.activeCommands(settings)
      .filter((item) => item.action === "send")
      .map((item) => QW.normalizeSpeech(item.phrase))
      .concat(QW.SEND_PHRASES)
  );
}

function commandsForSpeech(settings) {
  const list = QW.activeCommands(settings);
  if (QW.speechKind(settings) !== "mail") return list;
  const mailPhrases = new Set(QW.mailSendPhrases(settings));
  const enter = new Set(QW.ENTER_PHRASES);
  const out = [];
  for (const item of list) {
    if (item.action !== "send") {
      out.push(item);
      continue;
    }
    const norm = QW.normalizeSpeech(item.phrase);
    if (enter.has(norm)) {
      out.push({ ...item, action: "newline", value: "", group: "break" });
      continue;
    }
    if (mailPhrases.has(norm)) out.push(item);
  }
  for (const phrase of mailPhrases) {
    if (out.some((item) => item.action === "send" && QW.normalizeSpeech(item.phrase) === phrase)) continue;
    out.push({
      id: `send:mail:${phrase}`,
      group: "send",
      phrase,
      action: "send",
      value: "",
      enabled: true
    });
  }
  return out;
}

function leftoverIsFiller(left) {
  return !left || /^(?:הודעה|בבקשה|please|now|עכשיו|זה)$/i.test(left);
}

function phrasesConsumed(text, leftover) {
  return leftover !== text;
}

function isEnterBlurb(text) {
  const left = leftoverAfterPhrases(text, QW.ENTER_PHRASES);
  return phrasesConsumed(text, left) && leftoverIsFiller(left);
}

QW.isSendBlurb = (raw, settings) => {
  if (!settings || settings.sendCommand === false || settings.voiceCommands === false) return false;
  const text = QW.normalizeSpeech(raw);
  if (!text) return false;
  const phrases = sendPhrasesForSpeech(settings);
  if (!phrases.length) return false;
  const left = leftoverAfterPhrases(text, phrases);
  return phrasesConsumed(text, left) && leftoverIsFiller(left);
};

function leftoverAfterPhrases(text, phrases) {
  let left = ` ${text} `;
  for (const phrase of phrases) {
    left = left.replace(new RegExp(`\\s${QW.escapePhrase(phrase)}\\s`, "gi"), " ");
  }
  return left.replace(/\s+/g, " ").trim();
}

function isActionBlurb(text, settings, action) {
  if (!text || !settings || settings.voiceCommands === false) return false;
  if (action === "undo") {
    const clearPhrases = QW.activeCommands(settings)
      .filter((item) => item.action === "clear")
      .map((item) => QW.normalizeSpeech(item.phrase))
      .filter(Boolean)
      .sort((a, b) => b.length - a.length);
    if (clearPhrases.length) {
      const clearLeft = leftoverAfterPhrases(text, clearPhrases);
      if (phrasesConsumed(text, clearLeft) && leftoverIsFiller(clearLeft)) return false;
    }
  }
  const phrases = QW.activeCommands(settings)
    .filter((item) => item.action === action)
    .map((item) => QW.normalizeSpeech(item.phrase))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (!phrases.length) return false;
  const left = leftoverAfterPhrases(text, phrases);
  return phrasesConsumed(text, left) && leftoverIsFiller(left);
}

const RETIRED_COMMAND_IDS = new Set(["break:יורד שורה", "break:ירדתי שורה", "break:ירד שורה"]);
const RETIRED_BREAK_PHRASES = new Set(["יורד שורה", "ירדתי שורה", "ירד שורה"]);

function isRetiredCommand(item) {
  if (!item) return false;
  const id = item.id || `${item.group}:${item.phrase}`;
  if (RETIRED_COMMAND_IDS.has(id)) return true;
  return item.group === "break" && RETIRED_BREAK_PHRASES.has(QW.normalizeSpeech(item.phrase));
}

QW.mergeCommands = (stored) => {
  const list = QW.cloneCommands(Array.isArray(stored) && stored.length ? stored : QW.DEFAULT_COMMANDS).filter(
    (item) => !isRetiredCommand(item)
  );
  const have = new Set(list.map((item) => item.id || `${item.group}:${item.phrase}`));
  const defaults = new Map(QW.DEFAULT_COMMANDS.map((item) => [item.id, item]));
  for (const item of list) {
    const fresh = defaults.get(item.id);
    if (!fresh) continue;
    if (fresh.trailing) item.trailing = true;
    // Migrate the built-in "רווח" command from the old text action to the
    // dedicated space action so existing users receive the fixed behavior too.
    if (item.id === fresh.id && fresh.phrase === "רווח" && fresh.action === "space") {
      item.action = "space";
      item.value = fresh.value;
      item.group = fresh.group;
    }
  }
  for (const item of QW.DEFAULT_COMMANDS) {
    if (!have.has(item.id) && !isRetiredCommand(item)) list.push({ ...item });
  }
  return list;
};

const TRAILING_CMD_FILLER = "(?:בבקשה|please|now|עכשיו|זה|הודעה)";

function peelTrailingCommands(text, rows, settings, allowSend) {
  let current = String(text || "").trim();
  let send = false;
  let undo = false;
  let clear = false;
  let undoSentence = false;
  let spaces = 0;
  let suffix = "";
  const blocked = new Set((QW.SEND_NOT_TRAILING || []).map((item) => QW.normalizeSpeech(item)));
  const sendPhrases = allowSend
    ? uniquePhrases(
        rows
          .filter((row) => row.item.action === "send" && !blocked.has(row.norm))
          .map((row) => row.norm)
          .concat(sendPhrasesForSpeech(settings).filter((item) => !blocked.has(item)))
      )
    : [];
  const breakRows = rows
    .filter((row) => row.item.action === "newline" || row.item.action === "paragraph")
    .sort((a, b) => b.norm.length - a.norm.length);
  const spaceRows = rows
    .filter((row) => row.item.action === "space")
    .sort((a, b) => b.norm.length - a.norm.length);
  const clearRows = rows
    .filter((row) => row.item.action === "clear")
    .sort((a, b) => b.norm.length - a.norm.length);
  const sentenceRows = rows
    .filter((row) => row.item.action === "undoSentence")
    .sort((a, b) => b.norm.length - a.norm.length);
  const undoRows = rows
    .filter((row) => row.item.action === "undo")
    .sort((a, b) => b.norm.length - a.norm.length);

  for (let i = 0; i < 12 && current; i += 1) {
    let hit = false;
    for (const phrase of sendPhrases) {
      const re = new RegExp(`(?:^|\\s)(?:${QW.escapePhrase(phrase)})(?:\\s+${TRAILING_CMD_FILLER})?$`, "i");
      if (!re.test(current)) continue;
      current = current.replace(re, "").replace(/\s+/g, " ").trim();
      send = true;
      hit = true;
      break;
    }
    if (hit) continue;
    for (const row of breakRows) {
      const re = new RegExp(`(?:^|\\s)(?:${QW.escapePhrase(row.item.phrase)})(?:\\s+${TRAILING_CMD_FILLER})?$`, "i");
      if (!re.test(current)) continue;
      current = current.replace(re, "").replace(/\s+/g, " ").trim();
      const add = QW.commandInsertValue(row.item);
      suffix = `${add}${suffix}`;
      hit = true;
      break;
    }
    if (hit) continue;
    for (const row of spaceRows) {
      const re = new RegExp(`(?:^|\\s)(?:${QW.escapePhrase(row.item.phrase)})(?:\\s+${TRAILING_CMD_FILLER})?$`, "i");
      if (!re.test(current)) continue;
      current = current.replace(re, "").replace(/\s+/g, " ").trim();
      spaces += 1;
      hit = true;
      break;
    }
    if (hit) continue;
    for (const row of clearRows) {
      const re = new RegExp(`(?:^|\\s)(?:${QW.escapePhrase(row.item.phrase)})(?:\\s+${TRAILING_CMD_FILLER})?$`, "i");
      if (!re.test(current)) continue;
      current = current.replace(re, "").replace(/\s+/g, " ").trim();
      clear = true;
      hit = true;
      break;
    }
    if (hit) continue;
    for (const row of sentenceRows) {
      const re = new RegExp(`(?:^|\\s)(?:${QW.escapePhrase(row.item.phrase)})(?:\\s+${TRAILING_CMD_FILLER})?$`, "i");
      if (!re.test(current)) continue;
      current = current.replace(re, "").replace(/\s+/g, " ").trim();
      undoSentence = true;
      hit = true;
      break;
    }
    if (hit) continue;
    for (const row of undoRows) {
      const re = new RegExp(`(?:^|\\s)(?:${QW.escapePhrase(row.item.phrase)})(?:\\s+${TRAILING_CMD_FILLER})?$`, "i");
      if (!re.test(current)) continue;
      current = current.replace(re, "").replace(/\s+/g, " ").trim();
      undo = true;
      hit = true;
      break;
    }
    if (!hit) break;
  }
  return { text: current, send, undo, clear, undoSentence, spaces, suffix };
}

function tidyInserted(text) {
  return String(text || "")
    .replace(/(?:^|\s)סימן(?:\s+(?:קר(?:י(?:א(?:ה)?)?)?|קרי(?:עה|יה|ה)|שאל(?:ה|ת)?))?\s*([?!])/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/"\s+([^"\n]*?)\s+"/g, '"$1"')
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .replace(/ +([,.;:?!…])/g, "$1")
    .replace(/([,.;:?!…])(?=[^\s\n])/g, "$1 ")
    .replace(/([@#%_\/])\s+(?=[@#%_\/])/g, "$1")
    .replace(/ {2,}/g, " ")
    .replace(/^[ \t]+/, "")
    .replace(/[ \t]+$/, "");
}

function tidyCommandText(text) {
  return tidyInserted(text);
}

function tidyPunct(text) {
  return tidyInserted(text);
}

function applyWholeCommand(result, item, allowSend, suffix) {
  if (item.action === "clear") {
    result.clear = true;
    result.text = suffix || "";
    return true;
  }
  if (item.action === "undoSentence") {
    result.undoSentence = true;
    result.text = suffix || "";
    return true;
  }
  if (item.action === "undo") {
    result.undo = true;
    result.text = suffix || "";
    return true;
  }
  if (item.action === "space") {
    result.spaces += 1;
    result.text = suffix || "";
    return true;
  }
  if (item.action === "send") {
    if (allowSend) {
      result.send = true;
      result.text = suffix || "";
      return true;
    }
    result.text = suffix ? tidyCommandText(`${item.phrase}${suffix}`) : String(item.phrase || "");
    return true;
  }
  const value = `${QW.commandInsertValue(item)}${suffix || ""}`;
  result.text = suffix ? tidyCommandText(value) : value;
  if (
    (item.group === "snippet" || item.group === "emoji") &&
    snippetValueNorm(item) &&
    snippetValueNorm(item) !== QW.normalizeSpeech(item.phrase)
  ) {
    result.snippet = true;
  }
  return true;
}

QW.isExpandingSnippet = (raw, settings) => {
  if (!raw || !settings || settings.voiceCommands === false) return false;
  const rows = compiledCommands(settings);
  const text = canonCommandSpeech(raw, rows);
  if (!text) return false;
  return rows.some((row) => isExpandingSnippetRow(row) && (row.norm === text || row.norm === (stripCommandFiller(text) || text)));
};

QW.snippetReplaceTail = (box, want, settings) => {
  if (!box || !want || !settings || settings.voiceCommands === false) return "";
  const shown = QW.normalizeSpeech(box);
  const wantNorm = QW.normalizeSpeech(want);
  if (!shown || !wantNorm) return "";
  const rows = compiledCommands(settings).filter(isExpandingSnippetRow);
  for (const row of rows) {
    const value = snippetValueNorm(row.item);
    const rawValue = String(row.item.value == null ? "" : row.item.value);
    if (wantNorm !== value && QW.normalizeSpeech(want) !== QW.normalizeSpeech(rawValue) && String(want) !== rawValue) continue;
    if (shown === row.norm || shown.endsWith(` ${row.norm}`)) return row.item.phrase;
    const words = row.norm.split(/\s+/).filter(Boolean);
    for (let i = words.length - 1; i >= 1; i -= 1) {
      const pre = words.slice(0, i).join(" ");
      if (shown === pre || shown.endsWith(` ${pre}`)) return words.slice(0, i).join(" ");
    }
    if (row.norm.length >= 2 && shown.endsWith(row.norm.slice(0, Math.max(2, Math.ceil(row.norm.length * 0.6))))) {
      const cut = row.norm.slice(0, Math.max(2, Math.ceil(row.norm.length * 0.6)));
      if (shown.endsWith(cut)) return cut;
    }
  }
  return "";
};

QW.processUtterance = (raw, settings) => {
  const result = { text: "", send: false, undo: false, clear: false, undoSentence: false, meant: false, spaces: 0, snippet: false };
  if (!raw) return result;
  if (!settings || settings.voiceCommands === false) {
    result.text = QW.normalizeSpeech(raw);
    return result;
  }

  const rows = compiledCommands(settings);
  const allowSend = settings.sendCommand !== false;
  let text = canonCommandSpeech(raw, rows);
  if (!text) return result;
  if (QW.speechKind(settings) === "mail" && isEnterBlurb(text)) {
    result.text = "\n";
    return result;
  }
  if (allowSend && QW.isSendBlurb(text, settings)) {
    result.send = true;
    return result;
  }
  const stripped = stripCommandFiller(text) || text;
  const meantHit = parseMeantCorrection(stripped) || parseMeantCorrection(text);
  if (meantHit && meantHit.meant) {
    result.meant = true;
    result.text = meantHit.meant;
    return result;
  }
  if (isActionBlurb(stripped, settings, "clear") || isActionBlurb(text, settings, "clear")) {
    result.clear = true;
    return result;
  }
  if (isActionBlurb(stripped, settings, "undoSentence") || isActionBlurb(text, settings, "undoSentence")) {
    result.undoSentence = true;
    return result;
  }
  if (isActionBlurb(stripped, settings, "undo") || isActionBlurb(text, settings, "undo")) {
    result.undo = true;
    return result;
  }
  const whole = rows.find((row) => row.norm === text) || rows.find((row) => row.norm === stripped);
  if (whole) {
    applyWholeCommand(result, whole.item, allowSend, "");
    return result;
  }

  const peeled = peelTrailingCommands(text, rows, settings, allowSend);
  text = peeled.text;
  result.send = peeled.send;
  result.undo = peeled.undo;
  result.clear = peeled.clear;
  result.undoSentence = peeled.undoSentence;
  result.spaces = peeled.spaces || 0;

  // Explicit destructive-command precedence: clear > undoSentence > undo.
  // This keeps the parsed result unambiguous even for compound utterances
  // such as "מחק הכל מחק"; only the highest-priority destructive action remains.
  if (result.clear) {
    result.undoSentence = false;
    result.undo = false;
  } else if (result.undoSentence) {
    result.undo = false;
  }

  const suffix = peeled.suffix || "";
  if ((result.send || result.undo || result.clear || result.undoSentence) && leftoverIsFiller(text) && !suffix) {
    result.text = "";
    return result;
  }
  if (!text) {
    result.text = suffix;
    return result;
  }
  if (result.clear || result.undoSentence) {
    result.text = suffix;
    return result;
  }
  if (result.undo) {
    result.text = tidyCommandText(`${text}${suffix}`);
    return result;
  }

  const rest = stripCommandFiller(text) || text;
  if (isActionBlurb(rest, settings, "clear") || isActionBlurb(text, settings, "clear")) {
    result.clear = true;
    result.text = suffix;
    return result;
  }
  if (isActionBlurb(rest, settings, "undoSentence") || isActionBlurb(text, settings, "undoSentence")) {
    result.undoSentence = true;
    result.text = suffix;
    return result;
  }
  if (isActionBlurb(rest, settings, "undo") || isActionBlurb(text, settings, "undo")) {
    result.undo = true;
    result.text = suffix;
    return result;
  }
  const wholeRest = rows.find((row) => row.norm === text) || rows.find((row) => row.norm === rest);
  if (wholeRest) {
    applyWholeCommand(result, wholeRest.item, allowSend, suffix);
    return result;
  }

  for (const row of rows) {
    if (!row.item.trailing) continue;
    const tail = new RegExp(`(?:^|\\s)(?:${QW.escapePhrase(row.item.phrase)})(?:\\s*[.!]*)?$`, "i");
    if (!tail.test(text)) continue;
    const left = text.replace(tail, "").trim();
    const last = left.split(/\s+/).pop() || "";
    const fullNorm = QW.normalizeSpeech(`${last} ${row.item.phrase}`);
    const longer = rows.find((item) => !item.item.trailing && item.norm === fullNorm);
    if (longer) {
      const value = QW.commandInsertValue(longer.item);
      const head = left.split(/\s+/).slice(0, -1).join(" ");
      text = head ? `${head} ${value}` : value;
      break;
    }
    if (!shouldApplyTrailingPunct(left, row.item.phrase)) continue;
    const value = QW.commandInsertValue(row.item);
    text = left ? `${left} ${value}` : value;
    break;
  }

  for (const row of rows) {
    if (row.item.action === "send" || isEditAction(row.item.action)) continue;
    // "רווח" is a normal Hebrew word as well as a formatting command.
    // Do not replace it when it appears inside ordinary prose; exact/trailing
    // command handling above still supports an explicit spoken space.
    if (row.item.action === "space") continue;
    if (row.item.trailing) continue;
    const value = QW.commandInsertValue(row.item);
    if (!value) continue;
    if (row.item.action === "text" && QW.normalizeSpeech(value) === row.norm) continue;
    row.re.lastIndex = 0;
    const next = text.replace(row.re, ` ${value} `);
    if (next !== text && isExpandingSnippetRow(row)) result.snippet = true;
    text = next;
  }

  text = tidyCommandText(`${text}${suffix}`);

  if (settings.autoCapitalize && String(settings.language || "").startsWith("en") && text) {
    text = text.replace(/(^|[.!?]\s+)([a-z])/g, (_, a, b) => a + b.toUpperCase());
  }
  result.text = text;
  return result;
};

function shouldApplyTrailingPunct(left, phrase) {
  const p = QW.normalizeSpeech(phrase);
  if (!left) return true;
  const last = QW.normalizeSpeech(left).split(/\s+/).pop() || "";
  if (p === "שאלה") {
    if (/^(יש|אין)(?:\s+(?:לי|לו|לה|לנו|לכם|לכן|לך))?$/i.test(left)) return false;
    if (/^(מה|למה|איך|מתי|איפה|מי|האם|איזו|איזה|זו|זאת|ה)$/i.test(last)) return false;
    if (/שאלה$/.test(QW.normalizeSpeech(left))) return false;
  }
  if (p === "קריאה" && /^(קריאה|לקריאה|קריאת)$/i.test(last)) return false;
  return true;
}

QW.QUESTION_STARTERS_HE = [
  "האם",
  "מדוע",
  "כיצד",
  "מתי",
  "איפה",
  "היכן",
  "לאן",
  "מאין",
  "מנין",
  "למה",
  "איך",
  "למי",
  "מי",
  "מה",
  "מאיפה",
  "מאיזה",
  "לאיזה",
  "באיזה"
];
QW.QUESTION_PREFIXES_HE = [
  "על מה",
  "בשביל מה",
  "מפני מה",
  "למה לא",
  "יש לך",
  "יש לכם",
  "יש לכן",
  "אתה יכול",
  "את יכולה",
  "אתם יכולים",
  "אתן יכולות",
  "אפשר לקבל",
  "אפשר לבקש",
  "כמה זה",
  "כמה עולה",
  "כמה זמן",
  "יש מצב",
  "יש סיכוי",
  "מה דעתך",
  "מה אתה אומר",
  "מה את אומרת",
  "מה אתם אומרים",
  "אפשר רגע",
  "יש לך דקה"
];
QW.QUESTION_LEAD_INS = [
  "היי",
  "שלום",
  "אהלן",
  "היוש",
  "בוקר טוב",
  "ערב טוב",
  "אז",
  "טוב",
  "אוקיי",
  "אוקי",
  "רגע",
  "אגב",
  "בעצם",
  "נו"
];
QW.QUESTION_TAGS_HE = ["נכון", "אה"];
QW.QUESTION_TAG_PHRASES_HE = ["או מה", "או לא"];
QW.QUESTION_STARTERS_EN = [
  "what",
  "who",
  "when",
  "where",
  "why",
  "how",
  "which",
  "whose",
  "is",
  "are",
  "do",
  "does",
  "did",
  "can",
  "could",
  "would",
  "should"
];
QW.EXCLAIM_PREFIXES = ["וואו", "ואו", "wow", "מזל טוב", "כל הכבוד", "איזה יופי", "איזה כיף"];
QW.EXCLAIM_WHOLE = ["די", "מספיק"];

function clauseCore(text) {
  return String(text || "")
    .replace(/[\u200B\uFEFF\u00A0]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[,.;:?!…]+$/g, "")
    .trim();
}

function startsWithPhrase(text, phrase) {
  const t = String(text || "");
  const p = String(phrase || "");
  if (!t || !p) return false;
  if (t === p) return true;
  return t.startsWith(`${p} `) || t.startsWith(`${p},`);
}

function stripLeadIns(text) {
  let t = clauseCore(text);
  const leads = QW.QUESTION_LEAD_INS.slice().sort((a, b) => b.length - a.length);
  for (let i = 0; i < 3; i += 1) {
    let next = t;
    for (const lead of leads) {
      const re = new RegExp(`^${QW.escapePhrase(lead)}(?:[\\s,]+|$)`, "i");
      if (!re.test(next)) continue;
      const rest = next.replace(re, "").trim();
      if (rest) {
        next = rest;
        break;
      }
    }
    if (next === t) break;
    t = next;
  }
  return t;
}

function hasQuestionTag(text) {
  const words = clauseCore(text).split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  const last = words[words.length - 1];
  const lastTwo = words.slice(-2).join(" ");
  if (QW.QUESTION_TAG_PHRASES_HE.includes(lastTwo) && words.length >= 3) return true;
  if (QW.QUESTION_TAGS_HE.includes(last) && words.length >= 2) return true;
  if (last === "בסדר" && words.length >= 3) return true;
  return false;
}

function looksLikeQuestion(text, settings) {
  const raw = clauseCore(text);
  if (!raw) return false;
  if (/^(נכון|בסדר|אה|כן|לא|אוקיי|אוקי)$/i.test(raw)) return false;
  const candidates = [raw, stripLeadIns(raw)].filter((item, i, arr) => arr.indexOf(item) === i);
  for (const t of candidates) {
    if (/^מה שלומ/.test(t)) {
      return true;
    }
    if (/^(?:הכל|הכול)\s+בסדר/.test(t)) return true;
    if (/^(מה ש|מי ש)(?!ל)/.test(t)) continue;
    const words = t.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const first = words[0];
    if (QW.QUESTION_STARTERS_HE.includes(first)) return true;
    if (first === "אפשר" && words.length <= 6) return true;
    if (QW.QUESTION_PREFIXES_HE.some((p) => startsWithPhrase(t, p))) return true;
    const lang = String((settings && settings.language) || "");
    if (lang.startsWith("en") && QW.QUESTION_STARTERS_EN.includes(String(first).toLowerCase())) return true;
    if (hasQuestionTag(t)) return true;
  }
  return false;
}

function looksLikeExclamation(text) {
  const t = clauseCore(text);
  if (!t) return false;
  if (QW.EXCLAIM_PREFIXES.some((p) => startsWithPhrase(t.toLowerCase(), p.toLowerCase()))) return true;
  const words = t.split(/\s+/).filter(Boolean);
  if (QW.EXCLAIM_WHOLE.includes(words[0]) && words.length <= 4) return true;
  return false;
}

function applyDiscourseComma(text) {
  const s = String(text || "").trim();
  if (!s) return s;
  const greetings = ["בוקר טוב", "ערב טוב", "היי", "שלום", "אהלן", "היוש"];
  const markers = ["וואו", "ואו", "wow", "אוקיי", "אוקי", "אגב", "בעצם", "טוב"];
  for (const lead of greetings) {
    if (new RegExp(`^${QW.escapePhrase(lead)},`, "i").test(s)) return s;
    const re = new RegExp(`^${QW.escapePhrase(lead)}\\s+`, "i");
    const m = s.match(re);
    if (!m) continue;
    const rest = s.slice(m[0].length);
    if (!rest) return s;
    if (/^ל\S*(?:\s+\S+)?$/.test(rest) && !looksLikeQuestion(rest) && !looksLikeExclamation(rest)) return s;
    return `${lead}, ${rest}`;
  }
  for (const lead of markers) {
    if (new RegExp(`^${QW.escapePhrase(lead)},`, "i").test(s)) return s;
    const re = new RegExp(`^${QW.escapePhrase(lead)}\\s+`, "i");
    const m = s.match(re);
    if (!m) continue;
    const rest = s.slice(m[0].length);
    if (!rest) return s;
    const words = rest.split(/\s+/).filter(Boolean);
    if (words.length < 2 && !looksLikeQuestion(rest) && !looksLikeExclamation(rest)) return s;
    return `${lead}, ${rest}`;
  }
  return s;
}

function applyClauseCommas(text) {
  let s = String(text || "");
  if (!s.trim()) return s;
  const joiners = [
    "בכל אופן",
    "מצד שני",
    "עם זאת",
    "חוץ מזה",
    "משום ש",
    "למרות ש",
    "כדי ש",
    "ולכן",
    "ואז",
    "לכן",
    "אבל",
    "אולם",
    "וואו",
    "ואו",
    "כי"
  ];
  for (const join of joiners) {
    const re = new RegExp(`([^\\s,])[ \\t]+(${QW.escapePhrase(join)})(?=\\s|$)`, "gi");
    s = s.replace(re, "$1, $2");
  }
  return s;
}

function applyEnding(text, settings, ctx) {
  const s = String(text || "").trim();
  if (!s || /[,.;:?!…]$/.test(s)) return s;
  const words = clauseCore(s).split(/\s+/).filter(Boolean);
  const close = Boolean(ctx && (ctx.whole || ctx.close));
  if (looksLikeQuestion(s, settings) && (ctx && ctx.whole || close && words.length >= 2)) return `${s}?`;
  if (looksLikeExclamation(s) && (ctx && ctx.whole || close && words.length >= 2)) return `${s}!`;
  if (!ctx || !ctx.whole) return s;
  if (!/[A-Za-z0-9\u0590-\u05FF\u0600-\u06FF\u0400-\u04FF]$/.test(s)) return s;
  const min = ctx.kind === "mail" ? 4 : 5;
  if (words.length >= min) return `${s}.`;
  return s;
}

function splitSentences(text) {
  const s = String(text || "");
  const out = [];
  let rest = s;
  while (rest) {
    const match = rest.match(/[.!?…]+(?:[ \t]+|$)|(?:\n+)/);
    if (!match) {
      out.push({ body: rest, sep: "" });
      break;
    }
    const idx = match.index;
    out.push({ body: rest.slice(0, idx), sep: match[0] });
    rest = rest.slice(idx + match[0].length);
  }
  return out;
}

QW.splitHeadTailForPunct = (text) => {
  const raw = String(text == null ? "" : text);
  if (!raw.trim()) return { head: "", tail: raw };
  const trail = (raw.match(/\s*$/) || [""])[0];
  const body = raw.slice(0, raw.length - trail.length);
  const para = body.lastIndexOf("\n\n");
  const line = body.lastIndexOf("\n");
  let cut = -1;
  if (para >= 0) cut = para + 2;
  else if (line >= 0) cut = line + 1;
  else {
    const marks = body.match(/[.!?…]+\s+/g);
    if (marks && marks.length) {
      const lastMark = marks[marks.length - 1];
      const at = body.lastIndexOf(lastMark);
      if (at >= 0) cut = at + lastMark.length;
    }
  }
  if (cut < 0) return { head: "", tail: raw };
  return { head: body.slice(0, cut), tail: body.slice(cut) + trail };
};

QW.autoPunctuate = (text, settings, ctx) => {
  if (!settings) return text;
  const raw = QW.cleanSpoken(text);
  if (settings.autoPunctuation === false) return raw;
  if (!raw.trim()) return text;
  const whole = Boolean(ctx && ctx.whole);
  const close = Boolean(ctx && ctx.close);
  const kind = (ctx && ctx.kind) || "chat";
  const leadWs = raw.match(/^\s*/)[0];
  const trailWs = raw.match(/\s*$/)[0];
  const inner = raw.slice(leadWs.length, raw.length - trailWs.length);
  const endingCtx = { kind, whole, close };
  const rebuilt = splitSentences(inner)
    .map((part) => {
      let body = String(part.body || "").replace(/^[ \t]+|[ \t]+$/g, "");
      const sep = part.sep || "";
      if (!body) return sep;
      const wordCount = clauseCore(body).split(/\s+/).filter(Boolean).length;
      if (whole || wordCount >= 2) body = applyDiscourseComma(body);
      body = applyClauseCommas(body);
      if (/[.!?…]/.test(sep)) {
        const marks = sep.match(/[.!?…]+/)[0];
        const after = sep.slice(marks.length);
        return body + marks + (after || " ");
      }
      if (/\n/.test(sep)) return applyEnding(body, settings, endingCtx) + sep;
      return applyEnding(body, settings, endingCtx);
    })
    .join("");
  return leadWs + tidyPunct(rebuilt) + trailWs;
};

QW.parseSiteInput = (raw) => {
  let s = String(raw || "").trim();
  if (!s) return null;
  let protocol = "https:";
  let host = s;
  if (/^https?:\/\//i.test(s)) {
    try {
      const url = new URL(s);
      protocol = url.protocol;
      host = url.hostname;
    } catch (_) {
      return null;
    }
  } else {
    host = s.replace(/\/.*$/, "").replace(/^\*+\./, "*.");
  }
  host = String(host || "").toLowerCase().replace(/^www\./, "");
  if (!host || !host.includes(".") || !/^[a-z0-9*.-]+$/i.test(host)) return null;
  if (host === "mail.google.com" || host === "chat.google.com") return { builtin: true, host };
  const https = `https://${host}/*`;
  const http = `http://${host}/*`;
  const origins = protocol === "http:" ? [http] : [https, http];
  return {
    id: `site:${host}`,
    host,
    match: protocol === "http:" ? http : https,
    matches: origins,
    origins,
    label: host,
    enabled: true
  };
};

QW.normalizeCustomSites = (list) => {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      if (!item) return null;
      const parsed = item.host ? item : QW.parseSiteInput(item.match || item.origin || "");
      if (!parsed || parsed.builtin) return null;
      return {
        id: item.id || parsed.id,
        host: parsed.host,
        match: item.match || parsed.match,
        matches: item.matches || parsed.matches,
        enabled: item.enabled !== false
      };
    })
    .filter(Boolean);
};

QW.hostMatchesSite = (hostname, site) => {
  const host = String(hostname || "").toLowerCase().replace(/^www\./, "");
  const pattern = String(site && site.host ? site.host : "").toLowerCase().replace(/^www\./, "");
  if (!host || !pattern) return false;
  if (pattern.startsWith("*.")) {
    const base = pattern.slice(2);
    return host === base || host.endsWith(`.${base}`);
  }
  return host === pattern;
};

QW.isCustomHost = (hostname, settings) =>
  QW.normalizeCustomSites(settings && settings.customSites).some((site) => site.enabled && QW.hostMatchesSite(hostname, site));

export default QW;
