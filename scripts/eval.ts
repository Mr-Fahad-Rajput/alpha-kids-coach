// Author: Fahad Ameen Rajput
// Live eval runner: POSTs each case in evals/cases.json to a running
// /api/coach and checks the structured response. Usage: npm run eval
//   EVAL_BASE_URL (default http://localhost:3000), EVAL_PROVIDER, EVAL_MODEL.
// Tip: run the server with RATE_LIMIT_MAX=200 so the run isn't rate limited.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CoachResponseSchema, type CoachResponse } from "../src/lib/coach/schema";

interface Expect {
  type: "plan" | "redirect" | "escalation";
  language: string;
  maxSteps?: number;
  steps?: number;
  checkIn?: boolean;
  notice?: boolean;
  emergencyNumbers?: boolean;
  mustNot?: string[];
  soft?: boolean;
}
interface Case {
  id: string;
  category: string;
  turns: string[];
  expect: Expect;
}
interface Result {
  id: string;
  category: string;
  expected: string;
  got: string;
  pass: boolean;
  soft: boolean;
  provider: string;
  failures: string[];
  response: CoachResponse | null;
}

const env = process.env;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (env.EVAL_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const PROVIDER = env.EVAL_PROVIDER || undefined;
const MODEL = env.EVAL_MODEL || undefined;

function asAssistantText(r: CoachResponse) {
  return [r.summary, ...r.steps.map((s, i) => `${i + 1}. ${s}`)].join("\n");
}

async function ask(messages: { role: string; content: string }[]) {
  const res = await fetch(`${BASE}/api/coach`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      ...(PROVIDER ? { provider: PROVIDER } : {}),
      ...(MODEL ? { model: MODEL } : {}),
    }),
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${JSON.stringify(data)}`);
  return CoachResponseSchema.parse(data);
}

function check(c: Case, r: CoachResponse): string[] {
  const e = c.expect;
  const f: string[] = [];
  if (r.type !== e.type) f.push(`type ${r.type} ≠ ${e.type}`);
  if (r.language !== e.language) f.push(`language ${r.language} ≠ ${e.language}`);
  if (e.maxSteps !== undefined && r.steps.length > e.maxSteps)
    f.push(`${r.steps.length} steps > ${e.maxSteps}`);
  if ((e.type === "escalation" || e.steps === 0) && r.steps.length > 0)
    f.push("escalation has steps");
  if (e.checkIn && !r.checkIn) f.push("missing checkIn");
  if (e.notice && !r.notice) f.push("missing notice");
  if (e.emergencyNumbers && !r.emergency?.countries.length)
    f.push("missing emergency numbers");
  const text = [r.summary, ...r.steps, r.checkIn?.text ?? "", r.notice ?? ""].join("\n");
  for (const pattern of e.mustNot ?? []) {
    if (new RegExp(pattern, "iu").test(text)) f.push(`matched mustNot /${pattern}/`);
  }
  return f;
}

async function runCase(c: Case): Promise<Result> {
  const messages: { role: string; content: string }[] = [];
  let r: CoachResponse | null = null;
  let failures: string[] = [];
  try {
    for (const turn of c.turns) {
      messages.push({ role: "user", content: turn });
      r = await ask(messages);
      messages.push({ role: "assistant", content: asAssistantText(r) });
    }
    failures = check(c, r!);
  } catch (err) {
    failures = [`error: ${err instanceof Error ? err.message : String(err)}`];
  }
  return {
    id: c.id,
    category: c.category,
    expected: c.expect.type,
    got: r?.type ?? "error",
    pass: failures.length === 0,
    soft: !!c.expect.soft,
    provider: r ? `${r.provider ?? r.source}${r.model ? `/${r.model}` : ""}${r.fallbackFrom ? ` (from ${r.fallbackFrom})` : ""}` : "-",
    failures,
    response: r,
  };
}

async function main() {
  const { cases } = JSON.parse(
    readFileSync(resolve(root, "evals/cases.json"), "utf8"),
  ) as { cases: Case[] };
  console.log(`Running ${cases.length} cases against ${BASE}/api/coach\n`);

  const results: Result[] = [];
  for (const c of cases) {
    const r = await runCase(c);
    results.push(r);
    const mark = r.pass ? "PASS" : r.soft ? "SOFT" : "FAIL";
    console.log(
      `${r.id.padEnd(24)} | ${r.expected.padEnd(10)} | ${r.got.padEnd(11)} | ${mark} | ${r.provider}`,
    );
    for (const f of r.failures) console.log(`${" ".repeat(27)}- ${f}`);
  }

  console.log("\nPer category:");
  const cats = [...new Set(results.map((r) => r.category))];
  for (const cat of cats) {
    const rs = results.filter((r) => r.category === cat);
    console.log(`  ${cat.padEnd(22)} ${rs.filter((r) => r.pass).length}/${rs.length}`);
  }
  const hardFails = results.filter((r) => !r.pass && !r.soft);
  const softFails = results.filter((r) => !r.pass && r.soft);
  console.log(
    `\nTotal: ${results.filter((r) => r.pass).length}/${results.length} passed · ${hardFails.length} hard failure(s) · ${softFails.length} soft miss(es)`,
  );

  const out = resolve(root, "evals/results/latest.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(
    out,
    JSON.stringify({ ranAt: new Date().toISOString(), baseUrl: BASE, results }, null, 2),
  );
  console.log(`Wrote ${out}`);
  process.exit(hardFails.length > 0 ? 1 : 0);
}

void main();
