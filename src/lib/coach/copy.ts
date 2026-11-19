// Author: Fahad Ameen Rajput
// Default server-side copy in each reply language.

import type { Language } from "@/lib/safety/language";
import type { Category, CheckIn } from "./schema";

type L = Record<Language, string>;

export const DEFAULT_NOTICE: Record<"medical" | "legal" | "developmental", L> = {
  medical: {
    en: "Please see a doctor or paediatrician about this. They can check your child properly.",
    ur: "براہِ کرم اس بارے میں ڈاکٹر یا بچوں کے ڈاکٹر سے رجوع کریں۔ وہ بچے کا صحیح معائنہ کر سکتے ہیں۔",
    "ur-roman": "Meharbani karke is baare mein doctor ya bachon ke doctor se milein. Woh bachay ka sahi muaina kar sakte hain.",
  },
  legal: {
    en: "For legal questions, please speak to a qualified family lawyer or the relevant authority.",
    ur: "قانونی معاملات کے لیے کسی مستند فیملی وکیل یا متعلقہ ادارے سے رابطہ کریں۔",
    "ur-roman": "Qanooni masail ke liye kisi qualified family lawyer ya mutaliqa idaray se raabta karein.",
  },
  developmental: {
    en: "Only a qualified professional, such as a paediatrician or child psychologist, can assess attention, development or behaviour concerns.",
    ur: "توجہ، نشوونما یا رویّے سے متعلق خدشات کا جائزہ صرف کوئی مستند ماہر، جیسے بچوں کے ڈاکٹر یا چائلڈ سائیکالوجسٹ، ہی لے سکتا ہے۔",
    "ur-roman": "Tawajjuh, nashonuma ya rawaiye ke khadshaat ka jaiza sirf koi qualified mahir, jaise bachon ke doctor ya child psychologist, hi le sakta hai.",
  },
};

export const DEFAULT_CHECKIN: Record<Language, CheckIn> = {
  en: { kind: "question", text: "Try this for the next few days, then tell me how it went." },
  ur: { kind: "question", text: "اگلے چند دن یہ آزمائیں، پھر مجھے بتائیں کہ کیسا رہا۔" },
  "ur-roman": { kind: "question", text: "Agle chand din yeh aazmayen, phir mujhe batayen kaisa raha." },
};

export const OFFTOPIC: Record<Language, { summary: string; checkIn: CheckIn }> = {
  en: {
    summary: "I can only help with parenting questions.",
    checkIn: { kind: "question", text: "What is going on with your child that I can help with?" },
  },
  ur: {
    summary: "میں صرف بچوں کی تربیت سے متعلق سوالات میں مدد کر سکتا ہوں۔",
    checkIn: { kind: "question", text: "آپ کے بچے کے ساتھ کیا ہو رہا ہے جس میں میں مدد کر سکوں؟" },
  },
  "ur-roman": {
    summary: "Main sirf bachon ki parwarish ke sawalat mein madad kar sakta hoon.",
    checkIn: { kind: "question", text: "Aap ke bachay ke saath kya ho raha hai jis mein main madad kar sakoon?" },
  },
};

export const UNAVAILABLE: Record<Language, { summary: string; notice: string }> = {
  en: {
    summary: "The coach can't answer right now. Please try again in a moment.",
    notice: "If this is an emergency, call your local emergency number now.",
  },
  ur: {
    summary: "کوچ اس وقت جواب نہیں دے سکتا۔ تھوڑی دیر بعد دوبارہ کوشش کریں۔",
    notice: "اگر یہ ایمرجنسی ہے تو ابھی اپنے مقامی ایمرجنسی نمبر پر کال کریں۔",
  },
  "ur-roman": {
    summary: "Coach is waqt jawab nahi de sakta. Thori dair baad dobara koshish karein.",
    notice: "Agar yeh emergency hai to abhi apne local emergency number par call karein.",
  },
};

export function isRedirectCategory(
  c: Category,
): c is "medical" | "legal" | "developmental" | "offtopic" {
  return c === "medical" || c === "legal" || c === "developmental" || c === "offtopic";
}
