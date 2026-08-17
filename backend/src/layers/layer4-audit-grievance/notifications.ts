import { query } from '../../db/pool.js';

export async function notify(userId: number, title: string, body: string, channel = 'INAPP') {
  await query(
    `INSERT INTO notifications (user_id, title, body, channel) VALUES ($1,$2,$3,$4)`,
    [userId, title, body, channel]
  );
}
