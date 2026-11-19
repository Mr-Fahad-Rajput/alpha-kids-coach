// Author: Fahad Ameen Rajput
// Deterministic language detection, shared by server and client.
// Codes: en | ur (Urdu script) | ur-roman (Urdu written in Latin letters).

export const LANGUAGES = ["en", "ur", "ur-roman"] as const;
export type Language = (typeof LANGUAGES)[number];

const ARABIC_SCRIPT = /[؀-ۿݐ-ݿ]/u;
const LETTER = /\p{L}/gu;

const ROMAN_URDU_WORDS = new Set([
  "hai", "hain", "mera", "meri", "mere", "mujhe", "karta", "karti", "karun",
  "kya", "nahi", "bacha", "bachay", "beta", "beti", "aur", "dil", "raat",
  "saal", "kaise", "kyun", "dawai", "kar", "ko", "se", "ki", "ke",
]);

export function detectLanguage(text: string): Language {
  const letters = text.match(LETTER) ?? [];
  if (letters.length > 0) {
    const arabic = letters.filter((ch) => ARABIC_SCRIPT.test(ch)).length;
    if (arabic / letters.length >= 0.3) return "ur";
  }
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  let hits = 0;
  for (const w of words) {
    if (ROMAN_URDU_WORDS.has(w) && ++hits >= 2) return "ur-roman";
  }
  return "en";
}

export function isLanguage(value: unknown): value is Language {
  return (
    typeof value === "string" && (LANGUAGES as readonly string[]).includes(value)
  );
}
