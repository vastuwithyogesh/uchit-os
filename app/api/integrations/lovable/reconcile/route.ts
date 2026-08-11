import { NextResponse } from "next/server";
import { requireRouteActor } from "../../../../../lib/auth.ts";
import { assertNoLiveActivation, readLovableWrapperConfig } from "../../../../../lib/lovable-wrapper.server.ts";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function GET(request: Request) {
  const access = await requireRouteActor(request, "SUPER_ADMIN");
  if (!access.ok) return access.response;
  try {
    const url = new URL(request.url);
    const limit = url.searchParams.get("limit");
    if (limit !== null && (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 100)) return NextResponse.json({ ok: false, error: "Invalid reconciliation limit." }, { status: 400, headers });
    assertNoLiveActivation(readLovableWrapperConfig());
    return NextResponse.json({ ok: false, error: "Lovable integration is not activated." }, { status: 503, headers });
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 503;
    return NextResponse.json({ ok: false, error: "Lovable integration is unavailable." }, { status, headers });
  }
}
