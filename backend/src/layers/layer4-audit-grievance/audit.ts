import { query, queryOne } from '../../db/pool.js';
import { sha256 } from '../layer1-ingestion/dpi/mockDpi.js';

// Layer 4 - Append-only, hash-chained audit log.
export async function auditLog(entry: {
  actorId: number | null;
  actorRole: string;
  actorName?: string;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  detail?: Record<string, unknown>;
}) {
  const prev = await queryOne<{ hash: string }>(
    `SELECT hash FROM audit_logs ORDER BY id DESC LIMIT 1`
  );
  const prevHash = prev?.hash ?? null;
  const detail = entry.detail ?? {};
  const payload = {
    ts: new Date().toISOString(),
    actorId: entry.actorId,
    actorRole: entry.actorRole,
    actorName: entry.actorName ?? 'system',
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    detail,
    prevHash,
  };
  const hash = sha256(JSON.stringify(payload));
  const rows = await query(
    `INSERT INTO audit_logs (actor_id, actor_role, actor_name, action, entity_type, entity_id, detail, prev_hash, hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9) RETURNING *`,
    [entry.actorId, entry.actorRole, entry.actorName ?? 'system', entry.action, entry.entityType,
     entry.entityId ? String(entry.entityId) : null, JSON.stringify(detail), prevHash, hash]
  );
  return rows[0];
}

// Integrity checker: verify the whole hash chain.
export async function verifyAuditChain(): Promise<{ valid: boolean; checked: number; brokenAt?: number }> {
  const rows = await query<{ id: number; hash: string; prev_hash: string | null; action: string }>(
    `SELECT id, hash, prev_hash, action FROM audit_logs ORDER BY id ASC`
  );
  let prevHash: string | null = null;
  for (const r of rows) {
    if (r.prev_hash !== prevHash) {
      return { valid: false, checked: rows.length, brokenAt: r.id };
    }
    prevHash = r.hash;
  }
  return { valid: true, checked: rows.length };
}

export async function listAudit(filter: { entityType?: string; entityId?: string; limit?: number } = {}) {
  const conds: string[] = [];
  const params: any[] = [];
  if (filter.entityType) {
    params.push(filter.entityType);
    conds.push(`entity_type = $${params.length}`);
  }
  if (filter.entityId) {
    params.push(filter.entityId);
    conds.push(`entity_id = $${params.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  params.push(filter.limit ?? 100);
  return query(
    `SELECT * FROM audit_logs ${where} ORDER BY id DESC LIMIT $${params.length}`,
    params
  );
}
