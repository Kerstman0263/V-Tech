# PROMPT — Interactieve productrondleiding (guided onboarding) voor Saldova

## Context

Saldova is een SaaS-toolkit voor zzp'ers en kleine bedrijven.
Stack: **Next.js 15 (App Router) + React 19 + TypeScript + Tailwind CSS + Prisma ORM + PostgreSQL (Supabase) + next-intl (nl/en) + NextAuth v5**.

Relevante bestaande structuur:

- `app/[locale]/(dashboard)/layout.tsx` — server component, auth-guard, rendert `Sidebar` + `MobileSidebar` + `<main>`.
- `app/[locale]/(dashboard)/dashboard/page.tsx` — dark premium dashboard (welkomstbanner, KPI's, grafiek, "Team vandaag"-blok).
- `components/dashboard/SidebarContent.tsx` — de menu-items; wordt door zowel de desktop-`Sidebar` als de mobiele drawer gerenderd.
- `lib/permissions.ts` — `can(user, "financials" | "manageTeam" | ...)`. Rollen binnen een account: **account-eigenaar** (`user.id === user.accountId`), **MANAGER**, **MEMBER**. Daarnaast platformrollen `OWNER`/`ADMIN`.
- Accounttypes: `Company.accountType` = `ZZP` of `BEDRIJF`.
- UI-regels: **geen emoji's**, dark theme (`bg-[#12112a]/60`, `border-white/[0.05]`), merkkleur `brand` (paars, `brand-600 = #7c3aed`).

**AVG-eis (hard):** medewerkers (MEMBER/MANAGER) mogen niets van de bedrijfsadministratie of facturen zien. De rondleiding mag daar dus nooit naar wijzen.

## Opdracht

Bouw een interactieve productrondleiding met deze eisen:

1. **Database + API** — `hasCompletedOnboarding` boolean op `User` (`@default(false)`), plus een API-route `/api/user/onboarding` (PUT/POST) die de status permanent op `true` zet zodra de tour wordt afgerond óf overgeslagen.
2. **Rol-specifieke tour** — dynamisch splitsen op basis van de ingelogde gebruiker:
   - **BEDRIJF (eigenaar)**: volledige tour → welkomstbanner, "Team vandaag"-blok, Projecten, Klanten.
   - **BEDRIJF (MEMBER/MANAGER)**: korte, privacy-proof tour → welkomstbanner, urenregistratie, verlof aanvragen. Geen administratie/facturen.
   - **ZZP**: solo-tour → welkomstbanner, uren, ritten, Fiscale Rust.
3. **Pure Tailwind tooltips** — GEEN externe libraries (geen Floating UI, geen Popper, geen react-joyride). Positionering via de ids/refs van de zijbalk-items (`#menu-time`, `#menu-projects`, …). Responsive: zodra de zijbalk op mobiel inklapt, wordt de tooltip een gecentreerde overlay onderaan het scherm (`fixed bottom-4 left-4 right-4`).

---

# De complete implementatie

## 1. Prisma — `prisma/schema.prisma`

Toevoegen aan het `User`-model:

```prisma
  // Productrondleiding: eenmalig per gebruiker (dus ook per medewerker),
  // gezet zodra de tour is afgerond óf overgeslagen.
  hasCompletedOnboarding Boolean @default(false)
```

Bewust op `User` en niet op `Company`: elke nieuwe medewerker krijgt zo zijn eigen rondleiding, los van de eigenaar.

Daarna: `npx prisma generate` en `npm run db:push` (additieve wijziging, bestaande rijen krijgen `false`).

## 2. API-route — `app/api/user/onboarding/route.ts`

```ts
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, errorResponse } from "@/lib/auth-helpers";

/**
 * Onboarding-status van de INGELOGDE gebruiker (niet van het account).
 * Een medewerker krijgt dus zijn eigen rondleiding, los van de eigenaar.
 *
 * Body is optioneel: { completed?: boolean }. Zonder body -> true.
 * `completed: false` is er voor een "rondleiding opnieuw bekijken"-knop.
 */
async function setOnboarding(req: Request) {
  const user = await requireUser();

  let completed = true;
  try {
    const body = await req.json();
    if (typeof body?.completed === "boolean") completed = body.completed;
  } catch {
    // Geen (geldige) body — dat is prima, we nemen de standaard: afgerond.
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
```

**Beveiliging:** er wordt altijd geschreven op `user.id` uit de sessie, nooit op een id uit de request-body. Niemand kan de status van een ander aanpassen.

## 3. Tourconfiguratie — `components/onboarding/tour-steps.ts`

```ts
/**
 * Rol-specifieke productrondleiding.
 *
 * De variant wordt SERVER-SIDE bepaald (zie de dashboard-layout), zodat een
 * medewerker nooit een tour krijgt die naar financiële modules wijst — die
 * menu-items bestaan voor hem niet eens in de DOM.
 *
 * `target` is een CSS-selector. De ankers:
 *  - #tour-welcome, #tour-team-today  -> dashboardpagina
 *  - #menu-<key>                      -> zijbalk-items (alleen desktop-zijbalk;
 *    de mobiele drawer krijgt bewust GEEN ids, anders staan ze dubbel in de DOM)
 */

export type TourVariant = "ZZP" | "BEDRIJF_OWNER" | "BEDRIJF_MEMBER";

export interface TourStep {
  /** i18n-sleutel: tour.steps.<key>.title / .body */
  key: string;
  /** Element dat wordt uitgelicht. */
  target: string;
  /** Voorkeurskant van de tooltip op desktop. */
  side: "right" | "bottom";
}

const WELCOME: TourStep = { key: "welcome", target: "#tour-welcome", side: "bottom" };

export const TOURS: Record<TourVariant, TourStep[]> = {
  // Eigenaar van een bedrijf: volledige rondleiding.
  BEDRIJF_OWNER: [
    WELCOME,
    { key: "teamToday", target: "#tour-team-today", side: "bottom" },
    { key: "projects", target: "#menu-projects", side: "right" },
    { key: "customers", target: "#menu-customers", side: "right" },
  ],

  // Medewerker/leidinggevende: korte, privacy-proof rondleiding.
  // Verwijst UITSLUITEND naar het eigen werk — geen administratie of facturen.
  BEDRIJF_MEMBER: [
    WELCOME,
    { key: "memberTime", target: "#menu-time", side: "right" },
    { key: "memberLeave", target: "#menu-leave", side: "right" },
  ],

  // Zzp'er: solo-rondleiding.
  ZZP: [
    WELCOME,
    { key: "time", target: "#menu-time", side: "right" },
    { key: "mileage", target: "#menu-mileage", side: "right" },
    { key: "fiscaleRust", target: "#menu-fiscaleRust", side: "right" },
  ],
};
```

## 4. Het tour-component — `components/onboarding/ProductTour.tsx`

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import { TOURS, type TourVariant } from "@/components/onboarding/tour-steps";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 8; // ruimte tussen de uitlichting en het element
const TIP_W = 320; // breedte van de tooltip op desktop
const GAP = 14; // afstand tussen element en tooltip

/** Meet een element; geeft null als het niet bestaat of onzichtbaar is
 *  (op mobiel is de desktop-zijbalk `display:none` -> rect is dan 0x0). */
function measure(selector: string): Rect | null {
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/**
 * Interactieve productrondleiding.
 *
 * - Rendert via een portal op <body> (buiten elke blur-/stacking-context).
 * - Spotlight = één kader met een enorme box-shadow: alles eromheen wordt
 *   gedimd, zonder SVG-masks of extra libraries.
 * - Desktop: tooltip absoluut naast/onder het element.
 * - Mobiel (< md): tooltip wordt een gecentreerde overlay onderaan het scherm.
 */
export function ProductTour({ variant }: { variant: TourVariant }) {
  const t = useTranslations("tour");
  const router = useRouter();
  const pathname = usePathname();

  const steps = TOURS[variant];
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [mounted, setMounted] = useState(false);
  const [closed, setClosed] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  const step = steps[index];
  // De ankers (#tour-welcome) staan op de dashboardpagina; elders geen tour.
  const onDashboard = pathname === "/dashboard";
  const active = mounted && !closed && onDashboard && Boolean(step);

  useEffect(() => setMounted(true), []);

  // Breekpunt volgen (md = 768px) — bepaalt tooltip- vs bottom-sheet-modus.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Positie van het doelwit bijhouden: bij stapwissel, scrollen en resizen.
  useEffect(() => {
    if (!active || !step) return;

    const update = () => setRect(measure(step.target));

    // Direct meten, en nog een keer in de volgende frame: bij de eerste stap
    // kan de kaart nog aan het in-animeren zijn (animate-rise).
    update();
    const raf = requestAnimationFrame(update);
    const timer = setTimeout(update, 350);

    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [active, step, index]);

  // Doelwit in beeld scrollen als het buiten de viewport valt.
  useEffect(() => {
    if (!active || !step) return;
    const el = document.querySelector(step.target);
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.height > 0 && (r.top < 0 || r.bottom > window.innerHeight)) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [active, step, index]);

  /** Status permanent vastleggen en de tour sluiten. */
  const finish = useCallback(async () => {
    setClosed(true);
    try {
      await fetch("/api/user/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: true }),
      });
    } catch {
      // Netwerkfout: de tour is voor deze sessie weg; bij de volgende
      // pagina-load probeert hij het simpelweg opnieuw. Geen blokkade.
    }
    // Server components opnieuw ophalen -> de layout rendert de tour niet meer.
    router.refresh();
  }, [router]);

  const next = useCallback(() => {
    if (index >= steps.length - 1) void finish();
    else setIndex((i) => i + 1);
  }, [index, steps.length, finish]);

  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  // Toetsenbordbediening.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void finish();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, next, prev, finish]);

  if (!active || !step) return null;

  const isLast = index === steps.length - 1;

  // --- Tooltip-positionering (desktop) -------------------------------------
  // Alleen deze twee waarden worden berekend; de rest is Tailwind.
  let tipStyle: React.CSSProperties | undefined;
  if (isDesktop && rect) {
    if (step.side === "right") {
      tipStyle = {
        top: Math.min(Math.max(12, rect.top - 8), window.innerHeight - 220),
        left: Math.min(rect.left + rect.width + GAP, window.innerWidth - TIP_W - 12),
        width: TIP_W,
      };
    } else {
      tipStyle = {
        top: Math.min(rect.top + rect.height + GAP, window.innerHeight - 220),
        left: Math.min(Math.max(12, rect.left), window.innerWidth - TIP_W - 12),
        width: TIP_W,
      };
    }
  }

  const card = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
      style={tipStyle}
      className={cn(
        "z-[101] rounded-2xl border border-white/10 bg-[#12112a]/95 p-5 shadow-2xl shadow-black/60 backdrop-blur-md",
        // Mobiel: nette overlay onderaan het scherm. Desktop: zwevende tooltip.
        tipStyle
          ? "fixed animate-rise"
          : "fixed bottom-4 left-4 right-4 animate-rise",
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-300">
        {t("stepOf", { current: index + 1, total: steps.length })}
      </p>
      <h2 id="tour-title" className="mt-1 text-base font-bold text-white">
        {t(`steps.${step.key}.title`)}
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{t(`steps.${step.key}.body`)}</p>

      {/* Voortgangsstippen */}
      <div className="mt-4 flex items-center gap-1.5">
        {steps.map((s, i) => (
          <span
            key={s.key}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              i === index ? "w-6 bg-brand-500" : i < index ? "w-1.5 bg-brand-500/50" : "w-1.5 bg-white/10",
            )}
          />
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => void finish()}
          className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-slate-300"
        >
          {t("skip")}
        </button>
        <div className="flex items-center gap-2">
          {index > 0 && (
            <button
              type="button"
              onClick={prev}
              className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/10"
            >
              {t("prev")}
            </button>
          )}
          <button
            type="button"
            autoFocus
            onClick={next}
            className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-glow transition-all duration-200 hover:bg-brand-500 hover:shadow-glow-md"
          >
            {isLast ? t("finish") : t("next")}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[100]">
      {rect ? (
        // Spotlight: het kader zelf is transparant; de gigantische box-shadow
        // dimt alles eromheen. Eén element, geen mask, geen library.
        <div
          aria-hidden
          className="absolute rounded-2xl ring-2 ring-brand-400/80 transition-all duration-300 ease-out"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(4, 3, 12, 0.72), 0 0 30px rgba(124, 58, 237, 0.45)",
          }}
        />
      ) : (
        // Geen (zichtbaar) doelwit — bijv. de zijbalk is ingeklapt op mobiel.
        // Dan alleen dimmen; de uitleg staat in de bottom-sheet.
        <div aria-hidden className="absolute inset-0 bg-[#04030c]/72" />
      )}

      {/* Alleen de kaart is klikbaar */}
      <div className="pointer-events-auto">{card}</div>
    </div>,
    document.body,
  );
}
```

## 5. Ankers in de zijbalk — `components/dashboard/SidebarContent.tsx`

Voeg een `anchorIds`-prop toe en zet daarmee `id="menu-<key>"` op elke link:

```tsx
export function SidebarContent({
  isAdmin = false,
  isOwner = true,
  isZzp = true,
  canFinance = true,
  plan = "FREE",
  anchorIds = false,
  onNavigate,
}: {
  isAdmin?: boolean;
  isOwner?: boolean;
  isZzp?: boolean;
  canFinance?: boolean;
  plan?: Plan;
  /** Zet `id="menu-<key>"` op de links (ankers voor de productrondleiding).
   *  Alleen de DESKTOP-zijbalk doet dit — de mobiele drawer rendert dezelfde
   *  links en zou anders dubbele ids in de DOM zetten. */
  anchorIds?: boolean;
  onNavigate?: () => void;
}) {
  // ...
  const renderLink = (key: string) => {
    const href = HREF[key];
    const active = pathname.startsWith(href);
    return (
      <Link
        key={key}
        id={anchorIds ? `menu-${key}` : undefined}
        href={href}
        onClick={onNavigate}
        className={/* ongewijzigd */}
      >
        {/* ... */}
      </Link>
    );
  };
  // ...
}
```

En in `components/dashboard/Sidebar.tsx` (de desktop-zijbalk, en **alleen** daar):

```tsx
{/* anchorIds: alleen hier — de zijbalk-items zijn de ankers van de tour. */}
<SidebarContent isAdmin={isAdmin} isOwner={isOwner} isZzp={isZzp} canFinance={canFinance} plan={plan} anchorIds />
```

## 6. Ankers op het dashboard — `app/[locale]/(dashboard)/dashboard/page.tsx`

```tsx
{/* Welkomstbanner — anker voor stap 1 van de productrondleiding */}
<div id="tour-welcome" ...>

{/* "Team vandaag"-blok */}
<Card id="tour-team-today" ...>
```

`components/ui/Card.tsx` moet daarvoor een `id` doorgeven:

```tsx
export function Card({
  className,
  children,
  style,
  id,
}: {
  className?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  /** Anker voor bijv. de productrondleiding (#tour-team-today). */
  id?: string;
}) {
  return (
    <div id={id} style={style} className={cn("rounded-2xl border border-white/[0.05] bg-[#12112a]/60 backdrop-blur-md", className)}>
      {children}
    </div>
  );
}
```

## 7. Inladen in de layout — `app/[locale]/(dashboard)/layout.tsx`

De layout is de juiste plek: hij kent de sessie én rendert de sidebar al.

```tsx
import { ProductTour } from "@/components/onboarding/ProductTour";
import type { TourVariant } from "@/components/onboarding/tour-steps";

// In de bestaande Promise.all — geen extra database-call:
db.user.findUnique({
  where: { id: session.user.id },
  select: { name: true, email: true, hasCompletedOnboarding: true, company: { select: { name: true } } },
}),

// Welke rondleiding krijgt deze gebruiker? Server-side beslist, zodat een
// medewerker nooit een tour krijgt die naar de administratie wijst.
const tourVariant: TourVariant = isZzp
  ? "ZZP"
  : isOwner || ["ADMIN", "OWNER"].includes(session.user.role)
    ? "BEDRIJF_OWNER"
    : "BEDRIJF_MEMBER";
const showTour = !dbUser.hasCompletedOnboarding;

// Onderaan de JSX, naast <SupportWidget />:
{/* Productrondleiding — eenmalig per gebruiker. Het component rendert
    zichzelf alleen op /dashboard (daar staan de ankers). */}
{showTour && <ProductTour variant={tourVariant} />}
```

## 8. Teksten — `messages/nl.json` en `messages/en.json`

Nieuwe `tour`-namespace (nl):

```json
"tour": {
  "stepOf": "Stap {current} van {total}",
  "next": "Volgende",
  "prev": "Vorige",
  "finish": "Aan de slag",
  "skip": "Overslaan",
  "steps": {
    "welcome": {
      "title": "Welkom bij Saldova",
      "body": "Dit is je startpunt. Hier zie je in één oogopslag hoe je ervoor staat en start je de dingen die je dagelijks doet. We lopen het even kort met je door."
    },
    "teamToday": {
      "title": "Team vandaag",
      "body": "Wie is er afwezig, welk verlof wacht op je goedkeuring en hoeveel taken staan er open. Alles wat je vandaag over je team moet weten, op één plek."
    },
    "projects": {
      "title": "Projecten",
      "body": "Bundel werk per project, zodat uren en facturen automatisch bij de juiste opdracht horen."
    },
    "customers": {
      "title": "Klanten",
      "body": "Sla klantgegevens één keer op en hergebruik ze op elke factuur en offerte."
    },
    "memberTime": {
      "title": "Je uren registreren",
      "body": "Log hier je gewerkte uren. Je ziet alleen je eigen registraties — je collega's en de administratie blijven privé."
    },
    "memberLeave": {
      "title": "Verlof aanvragen",
      "body": "Dien hier je vakantie- of verlofaanvraag in en volg je saldo. Je leidinggevende krijgt hem automatisch ter beoordeling."
    },
    "time": {
      "title": "Uren registreren",
      "body": "Log je gewerkte uren per klant of project. Openstaande uren zet je later met één klik op een factuur."
    },
    "mileage": {
      "title": "Ritten bijhouden",
      "body": "Registreer je zakelijke kilometers. Saldova rekent de aftrekpost automatisch voor je uit."
    },
    "fiscaleRust": {
      "title": "Fiscale Rust",
      "body": "Zie precies hoeveel je opzij moet zetten voor de belasting, zodat je nooit voor verrassingen komt te staan."
    }
  }
}
```

De Engelse variant is een 1-op-1 vertaling met dezelfde sleutels.

---

# Ontwerpbeslissingen (waarom het zo werkt)

- **Spotlight zonder library**: één `div` op de positie van het doelwit met `box-shadow: 0 0 0 9999px rgba(4,3,12,0.72)`. Die enorme schaduw dimt het hele scherm behalve het kader zelf. Geen SVG-mask, geen overlay met gaten, geen dependency. `transition-all` laat het kader vloeiend naar de volgende stap glijden.
- **Responsive fallback**: een `matchMedia("(min-width: 768px)")`-listener bepaalt de modus. Onder `md` — of wanneer het doelwit 0×0 meet, wat gebeurt zodra de desktop-zijbalk `display:none` is — valt de kaart terug op `fixed bottom-4 left-4 right-4` en wordt het scherm volledig gedimd.
- **Portal naar `<body>`**: voorkomt dat de overlay in een `backdrop-blur`- of stacking-context van de header terechtkomt.
- **Privacy by design**: de variant wordt server-side bepaald. De medewerker-tour verwijst uitsluitend naar eigen werk, en de financiële menu-items bestaan voor hem sowieso niet in de DOM (`canFinance` verbergt de hele Administratie-groep). De tour kan dus niets lekken.
- **Herstelbaar**: `POST /api/user/onboarding` met `{ "completed": false }` zet de tour weer aan — handig voor een "rondleiding opnieuw bekijken"-knop in de instellingen.
- **Toegankelijk**: `role="dialog"` + `aria-modal`, toetsenbordbediening (Esc = overslaan, pijltjes = vooruit/terug), `autoFocus` op de primaire knop, en `scrollIntoView` als het doelwit buiten beeld valt.

# Stappen per variant

| Variant | Stappen |
|---|---|
| `BEDRIJF_OWNER` | Welkomstbanner → Team vandaag → Projecten → Klanten |
| `BEDRIJF_MEMBER` (MEMBER én MANAGER) | Welkomstbanner → Uren registreren → Verlof aanvragen |
| `ZZP` | Welkomstbanner → Uren → Ritten → Fiscale Rust |

"Uren & Ritten" en "Projecten & Klanten" zijn opgesplitst in aparte stappen, omdat één spotlight één element uitlicht. Samenvoegen = een regel uit de array halen.

# Nog te doen

```
npm run db:push
```

De kolom `hasCompletedOnboarding` bestaat nog niet in de database. Zonder die kolom crasht het dashboard, want de layout selecteert hem. De wijziging is puur additief (nieuwe boolean met default `false`), dus bestaande gebruikers krijgen de tour precies één keer te zien.
