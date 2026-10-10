import { get, list, put, head } from '@vercel/blob';
import { runDailyBackup } from '../lib/daily-backup.js';

// The Pro plan supports long-running functions; snapshots must still be
// sized and monitored so they finish within the function timeout.
export const config = { maxDuration: 300 };

function respond(res, status, data) {
  return res.status(status).setHeader('Cache-Control', 'no-store').json(data);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return respond(res, 405, { error: 'METHOD' });
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.authorization !== 'Bearer ' + cronSecret) {
    return respond(res, 401, { error: 'AUTH' });
  }
  const sourceToken = process.env.BLOB_READ_WRITE_TOKEN;
  const destinationToken = process.env.BACKUP_BLOB_READ_WRITE_TOKEN;
  if (!sourceToken || !destinationToken || sourceToken === destinationToken) {
    console.error('daily backup: a distinct private destination store must be configured');
    return respond(res, 503, { error: 'BACKUP_STORAGE_NOT_CONFIGURED' });
  }

  try {
    const result = await runDailyBackup({
      listSource: (cursor) => list({
        token: sourceToken,
        limit: 1000,
        ...(cursor ? { cursor } : {}),
      }),
      readSource: async (pathname) => {
        const response = await get(pathname, {
          token: sourceToken, access: 'private', useCache: false,
        });
        if (!response || response.statusCode !== 200) throw new Error('Source object missing');
        return {
          body: Buffer.from(await new Response(response.stream).arrayBuffer()),
          contentType: response.blob?.contentType || 'application/octet-stream',
        };
      },
      writeBackup: (pathname, body, contentType) => put(pathname, body, {
        token: destinationToken,
        access: 'private',
        contentType,
        addRandomSuffix: false,
        allowOverwrite: false,
      }),
      inspectBackup: (pathname) => head(pathname, { token: destinationToken }),
    });
    console.info('daily backup succeeded', {
      day: result.day, objectCount: result.objectCount, totalBytes: result.totalBytes,
    });
    return respond(res, 200, { ok: true, ...result });
  } catch (error) {
    console.error('daily backup failed', error?.message || String(error));
    return respond(res, 500, { error: 'BACKUP_FAILED' });
  }
}
