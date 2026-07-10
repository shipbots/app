/**
 * Prisma access for the Projects backend.
 *
 * The client is a lazy singleton — it's only constructed when a Postgres
 * connection string is actually present, so importing this module is safe even
 * before the database is provisioned. `isDbConfigured()` is what the projects
 * API uses to decide between real persistence and the mock-preview fallback.
 *
 * The runtime URL is resolved from whichever env var the host provides
 * (Vercel Postgres → POSTGRES_PRISMA_URL; others → DATABASE_URL) and passed to
 * PrismaClient explicitly, so the app works regardless of the exact name.
 * Migrations still read the datasource block in schema.prisma.
 */

import { PrismaClient } from '@prisma/client';

function resolveDbUrl(): string | undefined {
  return (
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    undefined
  );
}

export function isDbConfigured(): boolean {
  return Boolean(resolveDbUrl());
}

const globalForPrisma = globalThis as unknown as { __projectsPrisma?: PrismaClient };

/** Get the shared PrismaClient. Only call after `isDbConfigured()` is true. */
export function getPrisma(): PrismaClient {
  if (!globalForPrisma.__projectsPrisma) {
    const url = resolveDbUrl();
    globalForPrisma.__projectsPrisma = new PrismaClient(
      url ? { datasources: { db: { url } } } : undefined,
    );
  }
  return globalForPrisma.__projectsPrisma;
}
