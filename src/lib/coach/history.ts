// Author: Fahad Ameen Rajput
// Context budget: last HISTORY_LIMIT messages, then drop the oldest turns
// until the total fits HISTORY_CHAR_BUDGET (default 6000). The latest user
// message is always kept. Assistant turns arrive already compressed
// (summary + steps) from the client.

import { HISTORY_LIMIT, type ChatMessage } from "./schema";

export const DEFAULT_HISTORY_CHAR_BUDGET = 6000;

export function historyCharBudget(
  env: Record<string, string | undefined> = process.env,
) {
  const n = Number.parseInt(env.HISTORY_CHAR_BUDGET ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_HISTORY_CHAR_BUDGET;
}

export function trimHistory(
  messages: ChatMessage[],
  budget = historyCharBudget(),
): ChatMessage[] {
  let recent = messages.slice(-HISTORY_LIMIT);
  let total = recent.reduce((n, m) => n + m.content.length, 0);
  while (recent.length > 1 && total > budget) {
    total -= recent[0].content.length;
    recent = recent.slice(1);
  }
  // Start on a user turn.
  const firstUser = recent.findIndex((m) => m.role === "user");
  return recent.slice(Math.max(firstUser, 0));
}
