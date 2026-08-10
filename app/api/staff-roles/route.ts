import { NextResponse } from "next/server";
import { listStaffRoleAssignments, listStaffRoleAudit, requireRouteActor, revokeStaffRoleAssignment, upsertStaffRoleAssignment } from "@/lib/auth";
import type { UserRole } from "@/lib/domain";

const assignableStaffRoles = ["SETTER", "CONSULTANT", "ADMIN"] as const satisfies readonly UserRole[];

function privateHeaders() {
  return { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
}

export async function GET(request: Request) {
  const access = await requireRouteActor(request, "ADMIN");
  if (!access.ok) return access.response;

  return NextResponse.json({
    ok: true,
    assignments: await listStaffRoleAssignments(),
    audit: await listStaffRoleAudit()
  }, { headers: privateHeaders() });
}

export async function POST(request: Request) {
  const access = await requireRouteActor(request, "SUPER_ADMIN");
  if (!access.ok) return access.response;

  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const allowedFields = new Set(["email", "role", "fullName"]);
    const unknownField = Object.keys(body).find((key) => !allowedFields.has(key));
    if (unknownField) {
      return NextResponse.json({ ok: false, error: `Unknown staff assignment field: ${unknownField}.` }, { status: 400, headers: privateHeaders() });
    }

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const role = typeof body.role === "string" ? body.role.trim() : "";
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return NextResponse.json({ ok: false, error: "Enter a valid staff email address." }, { status: 400, headers: privateHeaders() });
    }
    if (!fullName || fullName.length > 160) {
      return NextResponse.json({ ok: false, error: "Enter a staff name of 160 characters or fewer." }, { status: 400, headers: privateHeaders() });
    }
    if (!assignableStaffRoles.includes(role as (typeof assignableStaffRoles)[number])) {
      return NextResponse.json({ ok: false, error: "Choose Setter, Consultant, or Admin. Super-Admin is controlled outside this form." }, { status: 400, headers: privateHeaders() });
    }

    const assignment = await upsertStaffRoleAssignment({ email, role: role as UserRole, fullName }, access.actor);
    return NextResponse.json({
      ok: true,
      assignment,
      assignments: await listStaffRoleAssignments(),
      audit: await listStaffRoleAudit()
    }, { headers: privateHeaders() });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Staff role update failed." }, {
      status: 400,
      headers: privateHeaders()
    });
  }
}

export async function DELETE(request: Request) {
  const access = await requireRouteActor(request, "SUPER_ADMIN");
  if (!access.ok) return access.response;
  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const unknownField = Object.keys(body).find((key) => key !== "email");
    if (unknownField) {
      return NextResponse.json({ ok: false, error: `Unknown staff revocation field: ${unknownField}.` }, { status: 400, headers: privateHeaders() });
    }
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const revoked = await revokeStaffRoleAssignment(email, access.actor);
    return NextResponse.json({ ok: true, revoked, assignments: await listStaffRoleAssignments(), audit: await listStaffRoleAudit() }, {
      headers: privateHeaders()
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Staff access revocation failed." }, {
      status: 400,
      headers: privateHeaders()
    });
  }
}
