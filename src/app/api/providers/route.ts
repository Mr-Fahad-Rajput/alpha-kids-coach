// Author: Fahad Ameen Rajput
// Lists available providers/models. Computed per request (keys are injected at
// runtime, never at build time). Never includes any key value.

import { resolveDefaults } from "@/lib/llm/registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  const { providers, defaultProvider } = resolveDefaults(process.env);
  return Response.json(
    {
      providers: providers.map((p) => ({
        id: p.id,
        label: p.label,
        models: p.models.map((m) => ({ id: m.id, label: m.label })),
        defaultModel: p.defaultModel,
      })),
      defaultProvider,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
