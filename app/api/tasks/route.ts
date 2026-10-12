import type { NextRequest } from "next/server";
import { badRequest, readJson } from "@/lib/http";
import { createTask, listTasks } from "@/lib/repo";

/** GET /api/tasks?since=<epoch ms> — open tasks plus tasks completed since then. */
export async function GET(request: NextRequest) {
  const since = Number(request.nextUrl.searchParams.get("since"));
  return Response.json(listTasks(Number.isFinite(since) ? since : 0));
}

export async function POST(request: Request) {
  const body = await readJson(request);
  const task = body && createTask(body);
  if (!task) return badRequest("A non-empty title is required");
  return Response.json(task, { status: 201 });
}
