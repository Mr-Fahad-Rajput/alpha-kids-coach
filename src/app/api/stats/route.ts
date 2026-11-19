// Author: Fahad Ameen Rajput
// GET /api/stats: in-memory, per-instance counters. Numbers only.

import { getStats } from "@/lib/coach/stats";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return Response.json(getStats(), { headers: { "Cache-Control": "no-store" } });
}
