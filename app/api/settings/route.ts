import { connection } from "next/server";
import { badRequest, readJson } from "@/lib/http";
import { getSettings, saveSettings } from "@/lib/repo";

export async function GET() {
  await connection();
  return Response.json(getSettings());
}

export async function PUT(request: Request) {
  const body = await readJson(request);
  if (!body) return badRequest("Expected a JSON object");
  return Response.json(saveSettings(body));
}
