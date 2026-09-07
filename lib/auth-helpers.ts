import { auth } from "@/lib/auth";
import { HttpError } from "@/lib/http-error";

/**
 * Server-side guards voor API-routes en server components.
 * Gooien een Error met een `status`-eigenschap zodat routes
 * netjes kunnen reageren.
 */

// Her-export zodat bestaande `import { HttpError } from "@/lib/auth-helpers"` blijft werken.
export { HttpError };

/** Vereist een ingelogde gebruiker. Geeft de sessie-user terug. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new HttpError(401, "Unauthorized");
  }
  return session.user;
}

/** Vereist een ingelogde ADMIN of OWNER. Geeft de sessie-user terug. */
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new HttpError(401, "Unauthorized");
  }
  if (session.user.role !== "ADMIN" && session.user.role !== "OWNER") {
    throw new HttpError(403, "Forbidden — admin only");
  }
  return session.user;
}

/** Vereist de platform-eigenaar (OWNER). Geeft de sessie-user terug. */
export async function requireOwner() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new HttpError(401, "Unauthorized");
  }
  if (session.user.role !== "OWNER") {
    throw new HttpError(403, "Forbidden — alleen de eigenaar");
  }
  return session.user;
}

/** Zet een HttpError om naar een JSON Response (voor route-handlers). */
export function errorResponse(err: unknown) {
  if (err instanceof HttpError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  // Prisma unique-conflict (bijv. dubbel factuurnummer) is een gebruikersfout, geen crash.
  if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
    return Response.json({ error: "Dit item bestaat al (dubbele waarde)." }, { status: 409 });
  }
  if (err instanceof SyntaxError) {
    return Response.json({ error: "De invoer kon niet worden gelezen. Controleer de velden en probeer opnieuw." }, { status: 400 });
  }
  // Do not log query arguments, documents, provider payloads or secrets.
  console.error("[api] request_failed", { type: err instanceof Error ? err.name : "UnknownError" });
  return Response.json({ error: "Dit is niet gelukt. Probeer het opnieuw; neem contact op met support als het blijft gebeuren." }, { status: 500 });
}
