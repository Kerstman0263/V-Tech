import type { DefaultSession } from "next-auth";

// Voegt `id` toe aan de sessie-gebruiker (gezet in de jwt/session callbacks).
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
