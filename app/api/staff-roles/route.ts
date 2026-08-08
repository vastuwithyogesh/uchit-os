import { NextResponse } from "next/server";
import { listStaffRoleAssignments, resolveRequestActor, upsertStaffRoleAssignment } from "@/lib/auth";

export async function GET(request: Request) {
  const actor = await resolveRequestActor(request.headers);
  if (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") {
    return NextResponse.json({ ok: false, error: "Only admin roles can view staff role assignments." }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    assignments: await listStaffRoleAssignments()
  });
}

export async function POST(request: Request) {
  const actor = await resolveRequestActor(request.headers);
  if (actor.role !== "SUPER_ADMIN") {
    return NextResponse.json({ ok: false, error: "Only a Super-Admin can update staff role assignments." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim();
  const role = String(body.role ?? "").trim();
  const fullName = String(body.fullName ?? "").trim();

  if (!email || !role) {
    return NextResponse.json({ ok: false, error: "Email and role are required." }, { status: 400 });
  }

  if (!["SETTER", "CONSULTANT", "ADMIN", "SUPER_ADMIN", "CLIENT"].includes(role)) {
    return NextResponse.json({ ok: false, error: "Invalid role." }, { status: 400 });
  }

  const assignment = await upsertStaffRoleAssignment({
    email,
    role: role as "CLIENT" | "SETTER" | "CONSULTANT" | "ADMIN" | "SUPER_ADMIN",
    fullName
  });

  return NextResponse.json({
    ok: true,
    assignment,
    assignments: await listStaffRoleAssignments()
  });
}
