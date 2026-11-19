// Author: Fahad Ameen Rajput
// Deterministic crisis pre-check, run on the latest user message BEFORE any
// LLM call. Deliberately broad: a false escalation is safe, a miss is not.
// Bare words like "kill" / "die" are avoided so idioms ("this homework is
// killing him") do not trigger. Latin patterns use \b; Urdu-script patterns
// are plain substrings (JS \b is ASCII-only).

const EN: RegExp[] = [
  /\bsuicid(e|al)\b/,
  /\bkill(ing|ed)? (myself|himself|herself|themselves)\b/,
  /\bend(ing|ed)? (my|his|her|their) (own )?life\b/,
  /\btake (my|his|her|their) (own )?life\b/,
  /\bwants? to die\b/,
  /\bwant(s|ed)? to be dead\b/,
  /\bbetter off dead\b/,
  /\bhang(ing|ed)? (myself|himself|herself|themselves)\b/,
  /\bself[- ]?harm/,
  /\bcuts? on .{0,40}?\b(arms?|wrists?|thighs?|legs?)\b/,
  /\bcutting (herself|himself|myself|themselves)\b/,
  /\bhurt(s|ing)? (myself|himself|herself|themselves)\b/,
  /\babus(e|ed|es|ing|ive)\b/,
  /\bmolest/,
  /\brap(e|ed|ing)\b/,
  /\btouch(es|ed|ing)? (her|him|them|my \w+) inappropriately\b/,
  /\binappropriately touch/,
  /\bsexually (abused|touched|assaulted|abusing)\b/,
  /\b(hits?|hitting|beats?|beating) .{0,60}\bwith (a|an|the|his|her) (belt|stick|rod|wire|cable|shoe|slipper)\b/,
  /\bbeat(s|ing|en)? (my|our) (son|daughter|child|children|kids?|baby)\b/,
  /\bburn(s|ed|t|ing)? (him|her|them) with\b/,
  /\bnot breathing\b/,
  /\bstopped breathing\b/,
  /\bcan'?t breathe\b/,
  /\bunconscious\b/,
  /\bwon'?t wake up\b/,
  /\bseizures?\b/,
  /\bchok(ing|ed) on\b/,
  /\bdrown(ing|ed)\b/,
  /\bswallow(ed|s)?\b.{0,40}\b(battery|batteries|bleach|chemicals?|poison|pills|tablets|medicine|magnets?|detergent)\b/,
  /\b(drank|drunk|ate) .{0,30}\b(bleach|poison|chemicals?|detergent)\b/,
  /\boverdos(e|ed|ing)\b/,
  /\b(knife|gun|weapon)\b.{0,60}\bschool\b/,
];

const UR: string[] = [
  "خودکشی", "خود کشی",
  "مر جانا چاہ", "مرنا چاہ",
  "خود کو ختم", "جان دے",
  "خود کو نقصان", "خود کو کاٹ",
  "کلائی",
  "زیادتی",
  "غلط طریقے سے چھو", "غلط طریقے سے ہاتھ",
  "بیلٹ سے مار", "ڈنڈے سے مار", "سوٹی سے مار",
  "بے ہوش", "بےہوش",
  "سانس نہیں",
  "زہر",
  "کیمیکل پی", "کیمیکل نگل", "تیزاب",
  "گولیاں کھا", "بیٹری نگل",
];

const ROMAN: RegExp[] = [
  /\bkhud ?kushi\b/,
  /\bmar jana chah/,
  /\bmarna chah(ta|ti|tay|te)\b/,
  /\bkhatam kar (dun|doon|lun|loon|du|lu)\b/,
  /\bkhud ko khatam\b/,
  /\bjaan de\b/,
  /\bjeene ka dil nahi\b/,
  /\bkhud ko (kaata|kaat|kata|kat|nuksan|nuqsan)\b/,
  /\bkalai\b/,
  /\bz(i)?yadti\b/,
  /\bghalat (tareeqe|tarike|tareeke|tariqe) se\b/,
  /\bbelt se maar/,
  /\bdan(d|dd)ay se maar/,
  /\bdande se maar/,
  /\bbehosh\b/,
  /\bhosh mein nahi\b/,
  /\bsaans nahi\b/,
  /\bzeh(e|a)r\b/,
  /\bchemical pi/,
  /\bgoliyan kha/,
];

const LATIN = [...EN, ...ROMAN].map((r) => new RegExp(r.source, "iu"));

export interface PrecheckResult {
  crisis: boolean;
  /** Source of the matching pattern, for logs/tests only (never user input). */
  matched: string | null;
}

export function precheck(text: string): PrecheckResult {
  const t = text.normalize("NFC").replace(/[’‘]/g, "'");
  for (const re of LATIN) {
    if (re.test(t)) return { crisis: true, matched: re.source };
  }
  for (const s of UR) {
    if (t.includes(s)) return { crisis: true, matched: s };
  }
  return { crisis: false, matched: null };
}
