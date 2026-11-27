import { NextResponse } from "next/server";

import { callTool } from "@/lib/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json()) as { name?: string; arguments?: Record<string, unknown> };
  if (!body.name) {
    return NextResponse.json({ error: "Tool name is required" }, { status: 400 });
  }
  try {
    return NextResponse.json(await callTool(body.name, body.arguments ?? {}));
  } catch (err) {
    // Protocol-level errors, e.g. a tool hidden by policy or invalid arguments.
    return NextResponse.json({ isError: true, text: (err as Error).message });
  }
}
