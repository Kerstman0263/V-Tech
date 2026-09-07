import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";
import { PAGE_TOURS } from "@/components/onboarding/page-tour-steps";

/**
 * Onboarding-status van de INGELOGDE gebruiker (niet van het account).
 * Een medewerker krijgt dus zijn eigen rondleiding, los van de eigenaar.
 *
 * Twee vormen:
 * 1. { completed?: boolean } — de hoofdrondleiding op het dashboard.
 *    Zonder body -> true. `completed: false` is er voor "opnieuw bekijken".
 * 2. { tour: "<page-key>" } — een per-pagina walkthrough afvinken.
 *    "all" is de sentinel voor "alle rondleidingen uitzetten".
 *
 * Alleen sleutels uit de echte tour-registry (plus "all") worden
 * geaccepteerd, met een harde cap — anders kan een ingelogde gebruiker de
 * completedTours-array onbeperkt laten groeien met verzonnen sleutels.
 */
const VALID_TOURS = new Set([...Object.keys(PAGE_TOURS), "all"]);
const MAX_TOURS = 64;

async function setOnboarding(req: Request) {
  const user = await requireUser();

  let completed = true;
  let tour: string | null = null;
  try {
    const body = await req.json();
    if (typeof body?.completed === "boolean") completed = body.completed;
    if (typeof body?.tour === "string") tour = body.tour;
  } catch {
    // Geen (geldige) body — dat is prima, we nemen de standaard: afgerond.
  }

  if (tour !== null) {
    if (!VALID_TOURS.has(tour)) {
      return NextResponse.json({ error: "Ongeldige tour-sleutel." }, { status: 400 });
    }
    // Lees-dan-schrijf om dubbele entries te voorkomen (push dedupet niet).
    // Een zeldzame race kan een duplicaat opleveren; dat is onschadelijk
    // (de client leest als Set) en de cap houdt de array sowieso begrensd.
    const current = await db.user.findUnique({
      where: { id: user.id },
      select: { completedTours: true },
    });
    if (!current?.completedTours.includes(tour) && (current?.completedTours.length ?? 0) < MAX_TOURS) {
      await db.user.update({
        where: { id: user.id },
        data: { completedTours: { push: tour } },
      });
    }
    return NextResponse.json({ ok: true, tour });
  }

  await db.user.update({
    where: { id: user.id },
    data: { hasCompletedOnboarding: completed },
  });

  return NextResponse.json({ ok: true, hasCompletedOnboarding: completed });
}

// De tour rondt af of wordt overgeslagen -> status permanent vastleggen.
export async function POST(req: Request) {
  try {
    return await setOnboarding(req);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PUT(req: Request) {
  try {
    return await setOnboarding(req);
  } catch (err) {
    return errorResponse(err);
  }
}
