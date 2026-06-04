import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

function getSslConfig(connectionString: string): { rejectUnauthorized: false } | false | undefined {
  try {
    const url = new URL(connectionString);
    const sslmode = url.searchParams.get('sslmode');
    
    if (sslmode === 'require') {
      return { rejectUnauthorized: false };
    }
  } catch {}
  
  return undefined;
}

function removeSslModeFromConnectionString(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    url.searchParams.delete('sslmode');
    return url.toString();
  } catch {
    return connectionString.replace(/[?&]sslmode=[^&]*/g, '');
  }
}

// Lazily initialise the connection pool so the framework can boot without a
// DATABASE_URL (e.g. the customer-facing portal deployment, which holds no DB
// and runs with SKIP_MIGRATIONS=true). The DATABASE_URL check fires on first
// real db access rather than at module load, so importing `db` is always safe.
let _db: NodePgDatabase | null = null;

function getDb(): NodePgDatabase {
  if (_db) return _db;

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  const sslConfig = getSslConfig(process.env.DATABASE_URL);
  const connectionString = sslConfig !== undefined && sslConfig !== false
    ? removeSslModeFromConnectionString(process.env.DATABASE_URL)
    : process.env.DATABASE_URL;

  const pool = new Pool({
    connectionString,
    ssl: sslConfig,
  });

  _db = drizzle(pool);
  return _db;
}

// Proxy preserves the `import { db }` contract for all existing consumers while
// deferring pool creation until the first property access.
const db = new Proxy({} as NodePgDatabase, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver);
  },
}) as NodePgDatabase;

export { db };
