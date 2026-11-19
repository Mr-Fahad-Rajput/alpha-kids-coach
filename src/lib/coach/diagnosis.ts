// Author: Fahad Ameen Rajput
// Server-side guard: remove any sentence that attributes a condition to the
// child — as a claim, negated ("doesn't mean he has ADHD") or quoted ("the
// teacher says he has ADHD"). Sentence-level co-occurrence of subject + verb
// + condition is deliberately strict: dropping a sentence is safe; a label
// is not.

const SUBJECT_LATIN =
  /\b(he|she|they|him|her|your (child|son|daughter|kid|baby|toddler|teen)|the child|usay|usey|isay|isey|usko|isko|us ko|is ko|woh|wo|aap ka (beta|bacha)|aap ki beti)\b/iu;
const VERB_LATIN =
  /\b(has|have|had|having|is|are|was|be|been|being|hai|hain|ho|hon|tha|thi)\b/iu;
const CONDITION_LATIN =
  /\b(adhd|autism|autistic|asd|dyslexia|dyslexic|ocd|bipolar|depression|depressed|anxiety disorder|oppositional defiant)\b/iu;
// "ODD" only in capitals, so the everyday word "odd" is untouched.
const ODD = /\bODD\b/u;

const SUBJECT_UR = /(اسے|اس کو|وہ|آپ کے بچے|آپ کا بچہ|آپ کا بیٹا|آپ کی بیٹی|آپ کے بیٹے)/u;
const VERB_UR = /(ہے|ہیں|تھا|تھی|ہو)/u;
const CONDITION_UR =
  /(آٹزم|آٹسٹک|اے ڈی ایچ ڈی|ADHD|ڈسلیکسیا|او سی ڈی|بائی پولر|ڈپریشن|اینگزائٹی ڈس آرڈر)/iu;

export function isDiagnosisStatement(sentence: string): boolean {
  const latin =
    SUBJECT_LATIN.test(sentence) &&
    VERB_LATIN.test(sentence) &&
    (CONDITION_LATIN.test(sentence) || ODD.test(sentence));
  const urdu =
    SUBJECT_UR.test(sentence) && VERB_UR.test(sentence) && CONDITION_UR.test(sentence);
  return latin || urdu;
}

/** Splits into sentences, keeping terminators (. ! ? ۔ ؟ and newlines). */
function sentences(text: string): string[] {
  return text.match(/[^.!?۔؟\n]+[.!?۔؟]*\s*|\n+/gu) ?? [];
}

export interface GuardResult {
  text: string;
  removed: boolean;
}

/** Removes diagnosis sentences from free text. */
export function stripDiagnoses(text: string): GuardResult {
  let removed = false;
  const kept = sentences(text).filter((s) => {
    if (isDiagnosisStatement(s)) {
      removed = true;
      return false;
    }
    return true;
  });
  return { text: removed ? kept.join("").trim() : text, removed };
}
