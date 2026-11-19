// Author: Fahad Ameen Rajput
// Emergency numbers — verified 2026-11-19.
// Sources:
//   Pakistan: https://pcsw.punjab.gov.pk/node/44 (15 Police, 1122 Rescue,
//             115 Edhi ambulance); 1121 declared by PTA for child protection
//             agencies.
//   India:    https://depwd.gov.in/en/others-helplines/ (112 Emergency,
//             14416 Tele-MANAS, 1098 Childline)
//   UAE:      https://u.ae/en/information-and-services/justice-safety-and-the-law/handling-emergencies
//             (999 Police, 998 Ambulance, 116111 Child protection — MOI)

import type { Language } from "./language";

export const NUMBERS_VERIFIED = "2026-11-19";

export interface EmergencyLine {
  label: string;
  number: string;
}
export interface EmergencyCountry {
  country: string;
  lines: EmergencyLine[];
}
export interface EmergencyNumbers {
  verified: string;
  countries: EmergencyCountry[];
  elsewhere: string;
}

type L = Record<Language, string>;
const t = (en: string, ur: string, roman: string): L => ({
  en,
  ur,
  "ur-roman": roman,
});

const DATA: { country: L; lines: { label: L; number: string }[] }[] = [
  {
    country: t("Pakistan", "پاکستان", "Pakistan"),
    lines: [
      { label: t("Police", "پولیس", "Police"), number: "15" },
      { label: t("Rescue / ambulance", "ریسکیو / ایمبولینس", "Rescue / ambulance"), number: "1122" },
      { label: t("Edhi ambulance", "ایدھی ایمبولینس", "Edhi ambulance"), number: "115" },
      { label: t("Child protection", "چائلڈ پروٹیکشن", "Child protection"), number: "1121" },
    ],
  },
  {
    country: t("India", "بھارت", "India"),
    lines: [
      { label: t("Emergency", "ایمرجنسی", "Emergency"), number: "112" },
      { label: t("Tele-MANAS mental health", "ٹیلی مانس (ذہنی صحت)", "Tele-MANAS mental health"), number: "14416" },
      { label: t("Childline", "چائلڈ لائن", "Childline"), number: "1098" },
    ],
  },
  {
    country: t("UAE", "متحدہ عرب امارات", "UAE"),
    lines: [
      { label: t("Police", "پولیس", "Police"), number: "999" },
      { label: t("Ambulance", "ایمبولینس", "Ambulance"), number: "998" },
      { label: t("Child protection (Ministry of Interior)", "چائلڈ پروٹیکشن (وزارتِ داخلہ)", "Child protection (Ministry of Interior)"), number: "116111" },
    ],
  },
];

const ELSEWHERE = t(
  "Elsewhere: call your local emergency number.",
  "کسی اور ملک میں: اپنا مقامی ایمرجنسی نمبر ملائیں۔",
  "Kisi aur mulk mein: apna local emergency number milayen.",
);

export function getEmergencyNumbers(language: Language): EmergencyNumbers {
  return {
    verified: NUMBERS_VERIFIED,
    countries: DATA.map((c) => ({
      country: c.country[language],
      lines: c.lines.map((l) => ({ label: l.label[language], number: l.number })),
    })),
    elsewhere: ELSEWHERE[language],
  };
}
