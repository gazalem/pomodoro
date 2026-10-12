import type { NextRequest } from "next/server";
import { badRequest, readJson } from "@/lib/http";
import { deleteTask, updateTask } from "@/lib/repo";

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/tasks/[id]">) {
  const id = parseId((await ctx.params).id);
  const body = await readJson(request);
  if (!id || !body) return badRequest("Invalid task update");
  const task = updateTask(id, body);
  if (!task) return Response.json({ error: "Task not found or invalid fields" }, { status: 404 });
  return Response.json(task);
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/tasks/[id]">) {
  const id = parseId((await ctx.params).id);
  if (!id) return badRequest("Invalid task id");
  return deleteTask(id)
    ? new Response(null, { status: 204 })
    : Response.json({ error: "Task not found" }, { status: 404 });
}
