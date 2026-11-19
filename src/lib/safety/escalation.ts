// Author: Fahad Ameen Rajput
// Templated (never generated) escalation copy. No steps by design.

import type { Language } from "./language";
import { getEmergencyNumbers, type EmergencyNumbers } from "./numbers";

export interface EscalationTemplate {
  headline: string;
  sentences: string[];
  closing: string;
  emergency: EmergencyNumbers;
}

const COPY: Record<Language, Omit<EscalationTemplate, "emergency">> = {
  en: {
    headline: "This needs urgent help right now.",
    sentences: [
      "Get yourself and your child to safety and call an emergency number now.",
      "Stay with your child until help arrives.",
    ],
    closing:
      "When everyone is safe, come back and we can talk through what comes next.",
  },
  ur: {
    headline: "اس صورتحال میں فوراً مدد کی ضرورت ہے۔",
    sentences: [
      "اپنے آپ کو اور بچے کو محفوظ جگہ پر لے جائیں اور ابھی ایمرجنسی نمبر پر کال کریں۔",
      "مدد پہنچنے تک بچے کے ساتھ رہیں، اسے اکیلا نہ چھوڑیں۔",
    ],
    closing:
      "جب سب محفوظ ہو جائیں تو واپس آئیں، ہم مل کر آگے کی بات کریں گے۔",
  },
  "ur-roman": {
    headline: "Is surat-e-haal mein foran madad ki zaroorat hai.",
    sentences: [
      "Apne aap ko aur bachay ko mehfooz jagah le jayen aur abhi emergency number par call karein.",
      "Madad pohanchne tak bachay ke saath rahein, usay akela na chhorein.",
    ],
    closing:
      "Jab sab mehfooz ho jayen to wapas aayen, hum mil kar aage ki baat karenge.",
  },
};

export function getEscalation(language: Language): EscalationTemplate {
  return { ...COPY[language], emergency: getEmergencyNumbers(language) };
}
