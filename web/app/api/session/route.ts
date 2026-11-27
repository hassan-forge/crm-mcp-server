import { NextResponse } from "next/server";

import { describe, restart } from "@/lib/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await describe());
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

/** Restart the MCP server with a different policy. */
export async function POST(request: Request) {
  const body = (await request.json()) as { mode?: string; allowClosingDeals?: boolean };
  const mode = body.mode === "read-write" ? "read-write" : "read-only";
  try {
    return NextResponse.json(
      await restart({ mode, allowClosingDeals: Boolean(body.allowClosingDeals) }),
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
