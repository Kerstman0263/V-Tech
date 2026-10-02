import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { rateLimit } from "@/lib/rate-limit";
import { consumeBackupCode, verifyTotp } from "@/lib/totp";
import { credentialFingerprint, credentialsUnchanged } from "@/lib/session-security";

/**
 * Auth.js (NextAuth v5) — e-mail/wachtwoord (credentials), JWT-sessies.
 * Geschikt voor serverless op Vercel (geen sessie-tabel nodig).
 *
 * BELANGRIJK (security): rol, ownerId en teamRole staan in de JWT, maar
 * worden bij iedere sessiecontrole opnieuw uit de database gelezen. Zonder dat zou een
 * gedegradeerde beheerder of een verwijderde/ontslagen medewerker met een
 * nog geldige cookie tot 30 dagen lang zijn oude rechten houden.
 */

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totp: { label: "Code", type: "text" },
      },
      async authorize(credentials, request) {
        // E-mail is case-insensitief: telefoons zetten de eerste letter vaak
        // automatisch in hoofdletters. We slaan adressen lowercase op.
        if (typeof credentials?.email !== "string" || typeof credentials?.password !== "string") return null;
        const email = credentials.email.trim().toLowerCase();
        const password = credentials.password;
        const totp = typeof credentials.totp === "string" ? credentials.totp.trim() : "";
        if (!email || email.length > 320 || !password || password.length > 1024 || totp.length > 64) return null;

        // Brute-force-rem per IP+e-mail (ook tegen het raden van 6-cijferige codes).
        const ip = request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
        try {
          rateLimit(`auth:${ip}:${email}`, 20, 15 * 60 * 1000);
        } catch {
          return null;
        }

        const user = await db.user.findUnique({ where: { email } });
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        // Tweestapsverificatie: code uit de app óf een eenmalige back-upcode.
        if (user.totpEnabled) {
          if (!totp) return null;
          const secret = decrypt(user.totpSecret);
          const okTotp = !!secret && verifyTotp(secret, totp);
          if (!okTotp) {
            const remaining = consumeBackupCode(totp, user.totpBackupCodes);
            if (!remaining) return null;
            // Back-upcode is eenmalig: direct afschrijven.
            const consumed = await db.user.updateMany({
              where: { id: user.id, totpBackupCodes: { equals: user.totpBackupCodes } },
              data: { totpBackupCodes: remaining },
            });
            if (consumed.count !== 1) return null;
          }
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? user.email,
          role: user.role,
          ownerId: user.ownerId,
          teamRole: user.teamRole,
          permissions: user.permissions,
          permissionsCustom: user.permissionsCustom,
          credentialFingerprint: credentialFingerprint(user.passwordHash, user.totpEnabledAt),
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.ownerId = user.ownerId ?? null;
        token.teamRole = user.teamRole ?? null;
        token.permissions = user.permissions ?? [];
        token.permissionsCustom = !!user.permissionsCustom;
        token.refreshedAt = Date.now();
        token.revoked = false;
        token.credentialFingerprint = user.credentialFingerprint;
        return token;
      }

      // Every server-side session check uses current permissions. A deleted user,
      // password change or 2FA change invalidates the old encrypted JWT.
      if (token.id) {
        const fresh = await db.user.findUnique({
          where: { id: token.id as string },
          select: { role: true, ownerId: true, teamRole: true, permissions: true, permissionsCustom: true, passwordHash: true, totpEnabledAt: true },
        });
        if (!fresh || !credentialsUnchanged(token.credentialFingerprint, fresh.passwordHash, fresh.totpEnabledAt)) {
          // Gebruiker bestaat niet meer (verwijderd/ontslagen): sessie waardeloos maken.
          token.revoked = true;
        } else {
          token.role = fresh.role;
          token.ownerId = fresh.ownerId ?? null;
          token.teamRole = fresh.teamRole ?? null;
          token.permissions = fresh.permissions ?? [];
          token.permissionsCustom = fresh.permissionsCustom;
          token.revoked = false;
        }
        token.refreshedAt = Date.now();
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        // Ingetrokken sessie: geen id -> requireUser() geeft 401 en de
        // dashboard-layout stuurt naar het inlogscherm.
        session.user.id = token.revoked ? "" : (token.id as string);
        session.user.role = (token.role as "USER" | "ADMIN" | "OWNER") ?? "USER";
        const ownerId = (token.ownerId as string | null) ?? null;
        session.user.ownerId = ownerId;
        session.user.teamRole = (token.teamRole as "MEMBER" | "MANAGER" | "ACCOUNTANT" | null) ?? null;
        // accountId = de team-eigenaar (medewerker erft de data van de eigenaar)
        session.user.accountId = ownerId ?? (token.id as string);
        // Rechtenmatrix (4 vinkjes) — zie lib/permissions.ts
        session.user.permissions = (token.permissions as string[] | undefined) ?? [];
        session.user.permissionsCustom = !!token.permissionsCustom;
      }
      return session;
    },
  },
});
