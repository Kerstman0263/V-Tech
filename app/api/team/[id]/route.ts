import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse, HttpError } from "@/lib/auth-helpers";
import { updateMemberRoleSchema } from "@/lib/validations/team";
import { defaultPermissions } from "@/lib/permissions";
import { logAccount } from "@/lib/audit";

// PATCH /api/team/:id — rol, rechtenmatrix of uurloon van een medewerker wijzigen (alleen eigenaar)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    if (user.id !== user.accountId) {
      throw new HttpError(403, "Alleen de eigenaar kan rollen en rechten wijzigen.");
    }
    const { id } = await params;
    const parsed = updateMemberRoleSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Ongeldige invoer" }, { status: 422 });
    }
    const d = parsed.data;
    const target = await db.user.findFirst({ where: { id, ownerId: user.accountId }, select: { id: true, name: true, email: true, teamRole: true } });
    if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // De boekhouder wordt via Instellingen beheerd; rol wisselen hoort daar niet.
    if (target.teamRole === "ACCOUNTANT" && d.teamRole) throw new HttpError(409, "De boekhouder-rol beheer je bij Instellingen.");

    const data: Record<string, unknown> = {};
    if (d.teamRole) {
      data.teamRole = d.teamRole;
      // Rol wisselen zonder eigen matrix -> de nieuwe rol-standaard geldt (permissionsCustom blijft false)
    }
    if (d.resetPermissions) {
      data.permissions = [];
      data.permissionsCustom = false;
    } else if (d.permissions) {
      data.permissions = [...new Set(d.permissions)];
      data.permissionsCustom = true;
    }
    if (d.hourlyCost !== undefined) data.hourlyCost = d.hourlyCost;

    await db.user.update({ where: { id }, data });

    const who = target.name ?? target.email;
    if (d.teamRole) logAccount(user.accountId, { id: user.id, name: user.name, email: user.email }, "team.role_changed", `${who} -> ${d.teamRole}`);
    if (d.permissions || d.resetPermissions) {
      const eff = d.resetPermissions ? defaultPermissions(d.teamRole ?? target.teamRole) : d.permissions ?? [];
      logAccount(user.accountId, { id: user.id, name: user.name, email: user.email }, "team.permissions_changed", `${who}: ${eff.length ? eff.join(", ") : "geen"}${d.resetPermissions ? " (rol-standaard)" : ""}`);
    }
    if (d.hourlyCost !== undefined) logAccount(user.accountId, { id: user.id, name: user.name, email: user.email }, "team.hourly_cost_changed", who);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE /api/team/:id — medewerker verwijderen.
// Eigenaar én wie "team beheren" heeft mogen dit; de eigenaar zelf is nooit een
// teamlid, dus kan via deze route niet verwijderd worden.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const isOwner = user.id === user.accountId;
    const { can } = await import("@/lib/permissions");
    if (!isOwner && !can(user, "manageTeam")) {
      throw new HttpError(403, "Geen rechten om medewerkers te verwijderen.");
    }
    const { id } = await params;
    if (id === user.id) {
      return NextResponse.json({ error: "Je kunt jezelf hier niet verwijderen." }, { status: 400 });
    }

    const target = await db.user.findFirst({ where: { id, ownerId: user.accountId }, select: { teamRole: true } });
    if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Een leidinggevende mag gewone medewerkers verwijderen, maar geen andere
    // leidinggevenden of de boekhouder — dat mag alleen de eigenaar.
    if ((target.teamRole === "MANAGER" || target.teamRole === "ACCOUNTANT") && !isOwner) {
      throw new HttpError(403, "Alleen de eigenaar kan een leidinggevende of boekhouder verwijderen.");
    }

    await db.user.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
