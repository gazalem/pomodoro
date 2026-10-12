import type { NextRequest } from "next/server";
import { badRequest } from "@/lib/http";
import { getDayStats, isIsoDate } from "@/lib/repo";

/** GET /api/stats?date=YYYY-MM-DD — focus totals for one local day. */
export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date");
  if (!isIsoDate(date)) return badRequest("date must be YYYY-MM-DD");
  return Response.json(getDayStats(date));
}
