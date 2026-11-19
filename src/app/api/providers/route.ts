// Author: Fahad Ameen Rajput
// Lists configured providers/models with an in-memory health flag. Computed
// per request (keys are injected at runtime). Never includes any key value.

import { buildProviderOptions } from "@/lib/llm/provider-options";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return Response.json(buildProviderOptions(process.env), {
    headers: { "Cache-Control": "no-store" },
  });
}
