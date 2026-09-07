import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { isToggleableModule } from "@/lib/modules";

/**
 * Menu-voorkeur van de INGELOGDE gebruiker: welke uitzetbare modules zijn
 * verborgen. Body: { hidden: string[] } — alleen waarden uit
 * TOGGLEABLE_MODULES; al het andere wordt geweigerd zodat kernpagina's
 * nooit uit het menu kunnen verdwijnen.
 */
export async function PUT(req: Request) {
  try {
    const user = await requireUser();

    let hidden: unknown;
    try {
      hidden = (await req.json())?.hidden;
    } catch {
      hidden = undefined;
    }
    if (!Array.isArray(hidden) || hidden.length > 32 || !hidden.every((v) => typeof v === "string")) {
      return NextResponse.json({ error: "Ongeldige module-lijst." }, { status: 400 });
    }
    const invalid = hidden.filter((v) => !isToggleableModule(v));
    if (invalid.length > 0) {
      return NextResponse.json({ error: `Niet uitzetbaar: ${invalid.join(", ")}` }, { status: 400 });
    }

    const unique = [...new Set(hidden)];
    await db.user.update({
      where: { id: user.id },
      data: { hiddenModules: unique },
    });

    return NextResponse.json({ ok: true, hidden: unique });
  } catch (err) {
    return errorResponse(err);
  }
}
