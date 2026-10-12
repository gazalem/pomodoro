/** Parses a JSON request body, returning null instead of throwing on bad input. */
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function badRequest(message: string) {
  return Response.json({ error: message }, { status: 400 });
}
