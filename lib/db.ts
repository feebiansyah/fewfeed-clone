import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "../generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL must be set");
}

const globalForPrisma = globalThis as unknown as { db?: PrismaClient };

export const db: PrismaClient =
  globalForPrisma.db ??
  new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.db = db;
}
