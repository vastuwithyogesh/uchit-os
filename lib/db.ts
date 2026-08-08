import { PrismaClient } from "@prisma/client";
import { getMergedConnectionSettings } from "@/lib/server-settings";

const mergedSettings = getMergedConnectionSettings();

if (mergedSettings.databaseUrl) {
  process.env.DATABASE_URL = mergedSettings.databaseUrl;
}

if (mergedSettings.directUrl) {
  process.env.DIRECT_URL = mergedSettings.directUrl;
}

declare global {
  // eslint-disable-next-line no-var
  var uchitVastuPrisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.uchitVastuPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.uchitVastuPrisma = prisma;
}
