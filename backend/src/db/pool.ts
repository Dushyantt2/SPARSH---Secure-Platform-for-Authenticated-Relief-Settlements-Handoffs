import pg from 'pg';
import { config } from '../config.js';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const poolConfig: any = {
  max: 10,
  idleTimeoutMillis: 30000,
};

if (config.db.url) {
  // Strip query parameters to prevent them from overriding custom SSL settings
  poolConfig.connectionString = config.db.url.split('?')[0];
} else {
  poolConfig.host = config.db.host;
  poolConfig.port = config.db.port;
  poolConfig.user = config.db.user;
  poolConfig.password = config.db.password;
  poolConfig.database = config.db.database;
}

if (
  process.env.PGSSLMODE === 'require' ||
  (config.db.url && config.db.url.includes('sslmode=require'))
) {
  const caPath = path.resolve(__dirname, '..', '..', 'ca.pem');
  if (existsSync(caPath)) {
    poolConfig.ssl = {
      rejectUnauthorized: true,
      ca: readFileSync(caPath, 'utf8'),
    };
  } else {
    poolConfig.ssl = { rejectUnauthorized: false };
  }
}

export const pool = new Pool(poolConfig);

export async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

export async function queryOne<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export const tx = async <T>(fn: (q: QueryFn) => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const q: QueryFn = async (text, params) => {
      const res = await client.query(text, params);
      return res.rows;
    };
    const result = await fn(q);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

export type QueryFn = (text: string, params?: any[]) => Promise<any[]>;
