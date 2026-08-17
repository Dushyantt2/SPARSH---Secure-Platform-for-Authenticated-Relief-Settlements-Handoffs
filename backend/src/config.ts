import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Simple, dependency-free helper to load environment variables from .env
function loadEnv() {
  const pathsToTry = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '..', '..', '.env'),
    path.resolve(__dirname, '..', '.env')
  ];

  for (const envPath of pathsToTry) {
    if (existsSync(envPath)) {
      try {
        const content = readFileSync(envPath, 'utf8');
        for (const line of content.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const firstEquals = trimmed.indexOf('=');
          if (firstEquals !== -1) {
            const key = trimmed.slice(0, firstEquals).trim();
            const val = trimmed.slice(firstEquals + 1).trim().replace(/^['"]|['"]$/g, '');
            if (process.env[key] === undefined) {
              process.env[key] = val;
            }
          }
        }
        break;
      } catch (e) {
        // Ignore files we cannot read
      }
    }
  }
}

loadEnv();

export const config = {
  port: Number(process.env.PORT || 4000),
  db: {
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'samarth',
    url: process.env.DATABASE_URL || '',
  },
  jwtSecret: process.env.JWT_SECRET || 'samarth-dev-secret-change-me',
  jwtExpiresIn: '12h',
  qrSecret: process.env.QR_SECRET || 'samarth-qr-dev-secret-change-me',
  nodeEnv: process.env.NODE_ENV || 'development',
  schemaPath: path.join(__dirname, 'db', 'schema.sql'),
  dataDir: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),
};
