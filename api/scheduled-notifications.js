import { processScheduledNotices } from '../lib/manual-notifications.js';

export const config = { maxDuration: 60 };
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).end(JSON.stringify({ error: 'METHOD' }));
  if (!process.env.CRON_SECRET || req.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET) return res.status(401).end(JSON.stringify({ error: 'AUTH' }));
  try {
    const result=await processScheduledNotices();
    console.info('notification scheduler checked',result);
    return res.status(200).end(JSON.stringify(result));
  }
  catch (error) { console.error('scheduled notice cron failed', error?.name || 'Error'); return res.status(500).end(JSON.stringify({ error: 'SERVER' })); }
}
