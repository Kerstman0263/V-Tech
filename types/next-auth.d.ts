import type { DefaultSession } from "next-auth";

// Voegt id, role, en team-velden (ownerId/accountId) toe aan sessie en gebruiker.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "USER" | "ADMIN" | "OWNER";
      /** De account-eigenaar (= id voor eigenaren, = ownerId voor medewerkers). */
      accountId: string;
      /** null voor eigenaren, het eigenaar-id voor medewerkers. */
      ownerId: string | null;
      /** Teamrol: null (eigenaar/solo), MEMBER of MANAGER. */
      teamRole: "MEMBER" | "MANAGER" | "ACCOUNTANT" | null;
      /** Rechtenmatrix: aangevinkte rechten (alleen relevant als permissionsCustom). */
      permissions: string[];
      permissionsCustom: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    /** Server-only; copied to the encrypted JWT, never to Session.user. */
    credentialFingerprint?: string;
    role?: "USER" | "ADMIN" | "OWNER";
    ownerId?: string | null;
    teamRole?: "MEMBER" | "MANAGER" | "ACCOUNTANT" | null;
    permissions?: string[];
    permissionsCustom?: boolean;
    /** Laatste DB-verversing van de rechten (ms). */
    refreshedAt?: number;
    /** Gebruiker bestaat niet meer -> sessie ongeldig. */
    revoked?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    credentialFingerprint?: string;
    id?: string;
    role?: "USER" | "ADMIN" | "OWNER";
    ownerId?: string | null;
    teamRole?: "MEMBER" | "MANAGER" | "ACCOUNTANT" | null;
    permissions?: string[];
    permissionsCustom?: boolean;
  }
}
