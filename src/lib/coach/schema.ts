// Author: Fahad Ameen Rajput
// Zod schemas shared by server and client.

import { z } from "zod";
import { LANGUAGES } from "@/lib/safety/language";

export const CATEGORIES = [
  "everyday",
  "medical",
  "legal",
  "developmental",
  "crisis",
  "offtopic",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CheckInSchema = z.object({
  kind: z.enum(["question", "time"]),
  text: z.string(),
});
export type CheckIn = z.infer<typeof CheckInSchema>;

/**
 * What the LLM must return. Kept lenient (no length limits) so strict
 * structured-output modes accept it; limits are enforced server-side.
 */
export const LlmOutputSchema = z.object({
  category: z.enum(CATEGORIES),
  summary: z.string(),
  steps: z.array(z.string()),
  checkIn: CheckInSchema.nullable(),
  notice: z.string().nullable(),
});
export type LlmOutput = z.infer<typeof LlmOutputSchema>;

export const EmergencyNumbersSchema = z.object({
  verified: z.string(),
  countries: z.array(
    z.object({
      country: z.string(),
      lines: z.array(z.object({ label: z.string(), number: z.string() })),
    }),
  ),
  elsewhere: z.string(),
});

export const CoachResponseSchema = z.object({
  type: z.enum(["plan", "redirect", "escalation", "unavailable"]),
  language: z.enum(LANGUAGES),
  category: z.enum(CATEGORIES),
  summary: z.string(),
  steps: z.array(z.string()),
  checkIn: CheckInSchema.nullable(),
  notice: z.string().nullable(),
  emergency: EmergencyNumbersSchema.nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  fallbackFrom: z.string().optional(),
  source: z.enum(["precheck", "llm", "fallback"]),
});
export type CoachResponse = z.infer<typeof CoachResponseSchema>;

export const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});
export type ChatMessage = z.infer<typeof MessageSchema>;

/** Max messages sent to the LLM (and kept by the client). */
export const HISTORY_LIMIT = 12;
