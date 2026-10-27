import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

export function databaseUrl(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  try {
    const url = new URL(value);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.hostname ||
      url.pathname.length < 2 ||
      url.hash
    )
      throw new Error();
    return value;
  } catch {
    throw new Error('Invalid database configuration');
  }
}

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  readonly client: PrismaClient | undefined;
  private closing: Promise<void> | undefined;
  private checking: Promise<boolean> | undefined;

  constructor() {
    const connectionString = databaseUrl(process.env.DATABASE_URL);
    if (connectionString) {
      const schema =
        new URL(connectionString).searchParams.get('schema') ?? 'public';
      this.client = new PrismaClient({
        adapter: new PrismaPg(
          {
            connectionString,
            max: 5,
            connectionTimeoutMillis: 1000,
            idleTimeoutMillis: 1000,
            query_timeout: 1000,
            statement_timeout: 1000,
          },
          { schema },
        ),
        log: [],
      });
    }
  }

  // Lazy connection: missing/unavailable DB allows liveness, never readiness.
  async isReady(): Promise<boolean> {
    if (!this.client || this.closing) return false;
    // Coalesce concurrent probes only; never cache a completed success.
    this.checking ??= this.client.$queryRaw`SELECT 1`
      .then(
        () => true,
        () => false,
      )
      .finally(() => {
        this.checking = undefined;
      });
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        this.checking,
        new Promise<false>((resolve) => {
          timer = setTimeout(() => resolve(false), 2000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  onApplicationShutdown(): Promise<void> {
    return (this.closing ??= this.client?.$disconnect() ?? Promise.resolve());
  }
}
