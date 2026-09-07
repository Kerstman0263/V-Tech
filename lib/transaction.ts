import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/** Retry only serialization conflicts; never put email/provider calls here. */
export async function serializableTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (attempt >= 2 || typeof error !== "object" || error === null || !("code" in error) || error.code !== "P2034") throw error;
    }
  }
}
