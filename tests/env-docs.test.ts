// Author: Fahad Ameen Rajput
// Keeps README Configuration table, .env.example and the code in sync.
// Reads only committed docs/source files — never real env files.

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CURATED_MODELS, PROVIDER_IDS } from "@/lib/llm/models";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (p: string) => readFileSync(`${root}/${p}`, "utf8");

/** Text of a "## <title>" section, up to the next "## " heading. */
function section(md: string, title: string): string {
  const start = md.indexOf(`\n## ${title}\n`);
  if (start < 0) throw new Error(`README section not found: ${title}`);
  const rest = md.slice(start + 1);
  const next = rest.indexOf("\n## ", 1);
  return next < 0 ? rest : rest.slice(0, next);
}

function readmeConfigVars(): string[] {
  const body = section(read("README.md"), "Configuration");
  const names = [...body.matchAll(/^\|\s*`([A-Z][A-Z0-9_]*)`\s*\|/gm)].map(
    (m) => m[1],
  );
  return names;
}

function envExampleVars(): string[] {
  return [...read(".env.example").matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map(
    (m) => m[1],
  );
}

/** Env var names in registry.ts: quoted ALL_CAPS strings and env.X accesses. */
function registryVars(): string[] {
  const src = read("src/lib/llm/registry.ts");
  const quoted = [...src.matchAll(/["']([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)["']/g)];
  const access = [...src.matchAll(/\benv\.([A-Z][A-Z0-9_]*)\b/g)];
  return [...new Set([...quoted, ...access].map((m) => m[1]))];
}

/** Env var names read anywhere in src/ or scripts/ via env.X / process.env.X. */
function codeVars(): string[] {
  const names = new Set<string>();
  for (const dir of ["src", "scripts"]) {
    const files = readdirSync(`${root}/${dir}`, { recursive: true }) as string[];
    for (const f of files) {
      if (!/\.(ts|tsx)$/.test(f)) continue;
      const src = read(`${dir}/${f}`);
      for (const m of src.matchAll(/\benv\.([A-Z][A-Z0-9_]*)\b/g)) names.add(m[1]);
    }
  }
  return [...names];
}

describe("env documentation", () => {
  it("README Configuration table lists variables", () => {
    expect(readmeConfigVars().length).toBeGreaterThan(0);
  });

  it("every README Configuration variable is in .env.example", () => {
    const example = new Set(envExampleVars());
    const missing = readmeConfigVars().filter((v) => !example.has(v));
    expect(missing).toEqual([]);
  });

  it("every env var referenced in registry.ts is in the README table", () => {
    const documented = new Set(readmeConfigVars());
    const found = registryVars();
    expect(found).toContain("LLM_PROVIDER");
    expect(found).toContain("GEMINI_API_KEY");
    const missing = found.filter((v) => !documented.has(v));
    expect(missing).toEqual([]);
  });

  it("every env var read in src/ and scripts/ is in the README table", () => {
    const documented = new Set(readmeConfigVars());
    const found = codeVars();
    expect(found).toContain("RATE_LIMIT_MAX");
    expect(found).toContain("EVAL_BASE_URL");
    expect(found.filter((v) => !documented.has(v))).toEqual([]);
  });

  it("README model table matches models.ts", () => {
    const body = section(read("README.md"), "How provider selection works");
    for (const id of PROVIDER_IDS.filter((p) => CURATED_MODELS[p].length > 0)) {
      const row = body
        .split("\n")
        .find((l) => l.includes(`(\`${id}\`)`));
      expect(row, `row for ${id}`).toBeDefined();
      const cells = row!.split("|").map((c) => c.trim());
      const ids = CURATED_MODELS[id].map((m) => m.id);
      expect(cells[2]).toBe(`\`${ids[0]}\``);
      expect(cells[3]).toBe(ids.map((m) => `\`${m}\``).join(", "));
    }
  });
});
