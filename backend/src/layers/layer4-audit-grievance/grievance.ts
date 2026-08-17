import { query, queryOne } from '../../db/pool.js';
import { auditLog } from './audit.js';
import { notify } from './notifications.js';

export async function createGrievance(citizen: { id: number; name: string }, input: { application_id?: number; subject: string; description: string }) {
  const ref = 'GRV-' + new Date().getFullYear() + '-' + String(Math.floor(1000 + Math.random() * 9000));
  const row = await queryOne<any>(
    `INSERT INTO grievances (ref, citizen_id, application_id, subject, description, assigned_role)
     VALUES ($1,$2,$3,$4,$5,'DWO') RETURNING *`,
    [ref, citizen.id, input.application_id ?? null, input.subject, input.description]
  );
  await auditLog({ actorId: citizen.id, actorRole: 'CITIZEN', actorName: citizen.name, action: 'GRIEVANCE_RAISED', entityType: 'grievance', entityId: row.id, detail: { ref } });
  return row;
}

export async function listGrievances(filter: { role?: string; citizen_id?: number } = {}) {
  const conds: string[] = [];
  const params: any[] = [];
  if (filter.role === 'DWO') params.push('DWO');
  if (filter.role === 'DM') params.push('DM');
  if (filter.role) conds.push(`assigned_role = $${params.length}`);
  if (filter.citizen_id) {
    params.push(filter.citizen_id);
    conds.push(`citizen_id = $${params.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  return query(`SELECT * FROM grievances ${where} ORDER BY id DESC`, params);
}

export async function updateGrievance(g: { id: number }, officer: { id: number; name: string; role: string }, input: { status?: string; resolution?: string }) {
  const row = await queryOne<any>(`SELECT * FROM grievances WHERE id=$1`, [g.id]);
  if (!row) throw Object.assign(new Error('Grievance not found'), { status: 404 });
  const status = input.status ?? row.status;
  await query(
    `UPDATE grievances SET status=$2, resolution=COALESCE($3, resolution), updated_at=now() WHERE id=$1`,
    [row.id, status, input.resolution ?? null]
  );
  await auditLog({ actorId: officer.id, actorRole: officer.role, actorName: officer.name, action: 'GRIEVANCE_UPDATE', entityType: 'grievance', entityId: row.id, detail: { status, resolution: input.resolution ?? null } });
  await notify(row.citizen_id, 'Grievance Update', `Your grievance ${row.ref} is now: ${status}`);
  return queryOne(`SELECT * FROM grievances WHERE id=$1`, [row.id]);
}

export async function escalateGrievance(id: number) {
  await query(`UPDATE grievances SET status='ESCALATED', assigned_role='DM', updated_at=now() WHERE id=$1`, [id]);
  return queryOne(`SELECT * FROM grievances WHERE id=$1`, [id]);
}
