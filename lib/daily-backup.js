import { createHash, randomUUID } from 'node:crypto';

const DEFAULT_LIMIT = 10000;

/**
 * Creates a complete, append-only backup of one Vercel Blob store.
 * Injected IO keeps this independent from production credentials and testable.
 * A snapshot is restorable only when its manifest has been committed LAST.
 *
 * Note: copying multiple independently updated blobs is not a transactional
 * point-in-time database snapshot. Schedule off peak and test restores.
 */
export async function runDailyBackup({
  listSource,
  readSource,
  writeBackup,
  inspectBackup,
  now = new Date(),
  snapshotId = randomUUID(),
  maxFiles = DEFAULT_LIMIT,
}) {
  if (typeof listSource !== 'function' || typeof readSource !== 'function' ||
      typeof writeBackup !== 'function' || typeof inspectBackup !== 'function') {
    throw new Error('Backup storage functions are required');
  }
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid backup date');
  if (!/^[a-zA-Z0-9-]+$/.test(snapshotId)) throw new Error('Invalid snapshot ID');

  const day = now.toISOString().slice(0, 10);
  const base = 'autoprovoz-backups/daily/' + day + '/' + snapshotId;
  const files = new Map();
  let cursor;
  const visited = new Set();

  do {
    const page = await listSource(cursor);
    if (!page || !Array.isArray(page.blobs)) throw new Error('Invalid source listing');
    for (const blob of page.blobs) {
      if (!blob || typeof blob.pathname !== 'string') throw new Error('Invalid source blob');
      // Never copy any snapshots back into snapshots (even if misconfigured).
      if (blob.pathname.startsWith('autoprovoz-backups/')) continue;
      if (files.has(blob.pathname)) continue;
      files.set(blob.pathname, blob);
      if (files.size > maxFiles) throw new Error('Source exceeds maximum backup file count');
    }
    const next = page.hasMore ? page.cursor : undefined;
    if (page.hasMore && (!next || visited.has(next))) {
      throw new Error('Source listing pagination failed');
    }
    cursor = next;
    if (cursor) visited.add(cursor);
  } while (cursor);

  if (files.size === 0) throw new Error('Source store is empty; refusing an empty backup');
  const objects = [];

  // Sequential copying bounds memory. We never publish a manifest if any
  // individual object fails to copy/verify.
  for (const [pathname, sourceMetadata] of files) {
    const result = await readSource(pathname);
    if (!result || !result.body) throw new Error('Could not read source object');
    const body = Buffer.isBuffer(result.body) ? result.body : Buffer.from(result.body);
    const destination = base + '/objects/' + encodeURIComponent(pathname);
    const digest = createHash('sha256').update(body).digest('hex');
    await writeBackup(destination, body, result.contentType || 'application/octet-stream');
    const stored = await inspectBackup(destination);
    if (!stored || Number(stored.size) !== body.length) {
      throw new Error('Backup object verification failed for ' + pathname);
    }
    objects.push({
      pathname,
      backupPath: destination,
      bytes: body.length,
      sha256: digest,
      contentType: result.contentType || 'application/octet-stream',
      sourceUploadedAt: sourceMetadata.uploadedAt || null,
    });
  }

  const manifest = {
    format: 'autoprovoz-blob-backup-v1',
    day,
    startedAt: now.toISOString(),
    completedAt: new Date().toISOString(),
    consistency: 'per-object-copy-not-transactional',
    objectCount: objects.length,
    totalBytes: objects.reduce((sum, obj) => sum + obj.bytes, 0),
    objects,
  };
  const manifestPath = base + '/manifest.json';
  await writeBackup(manifestPath, Buffer.from(JSON.stringify(manifest)), 'application/json');
  const verifyManifest = await inspectBackup(manifestPath);
  if (!verifyManifest || Number(verifyManifest.size) !== Buffer.byteLength(JSON.stringify(manifest))) {
    throw new Error('Backup manifest verification failed');
  }
  return { day, manifestPath, objectCount: manifest.objectCount, totalBytes: manifest.totalBytes };
}
