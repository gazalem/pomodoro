import { badRequest, readJson } from "@/lib/http";
import { insertSessions } from "@/lib/repo";

/** POST /api/sessions { sessions: SessionLog[] } — idempotent on clientId. */
export async function POST(request: Request) {
  const body = await readJson(request);
  if (!body || !Array.isArray(body.sessions)) return badRequest("Expected { sessions: [...] }");
  if (body.sessions.length > 500) return badRequest("Too many sessions in one batch");
  return Response.json({ accepted: insertSessions(body.sessions) });
}
