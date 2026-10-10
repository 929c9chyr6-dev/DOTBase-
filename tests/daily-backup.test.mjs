import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { runDailyBackup } from '../lib/daily-backup.js';

function fixture(paths = ['config.json', 'records/a.rec']) {
  const backup = new Map();
  const payloads = new Map(paths.map((path) => [path, Buffer.from('content:' + path)]));
  return {
    backup,
    listSource: async (cursor) => cursor
      ? { blobs: paths.slice(1).map((pathname) => ({ pathname })), hasMore: false }
      : { blobs: paths.slice(0, 1).map((pathname) => ({ pathname })), hasMore: paths.length > 1, cursor: 'next' },
    readSource: async (path) => ({
      body: payloads.get(path),
      contentType: path.endsWith('.json') ? 'application/json' : 'application/octet-stream',
    }),
    writeBackup: async (path, bytes, type) => {
      if (backup.has(path)) throw new Error('Immutable backup already exists');
      backup.set(path, { bytes: Buffer.from(bytes), contentType: type });
    },
    inspectBackup: async (path) => backup.has(path) ? { size: backup.get(path).bytes.length } : null,
  };
}

test('daily backup copies all private objects and writes verifiable manifest LAST', async () => {
  const io = fixture();
  const result = await runDailyBackup({
    ...io,
    now: new Date('2026-10-10T02:00:00Z'),
    snapshotId: 'testing',
  });
  assert.equal(result.day, '2026-10-10');
  assert.equal(result.objectCount, 2);
  assert.equal(io.backup.size, 3);
  const manifest = JSON.parse(io.backup.get(result.manifestPath).bytes.toString());
  assert.equal(manifest.objectCount, 2);
  assert.equal(manifest.consistency, 'per-object-copy-not-transactional');
  for (const file of manifest.objects) {
    assert.ok(io.backup.has(file.backupPath));
    const backupBody = io.backup.get(file.backupPath).bytes;
    assert.equal(file.sha256, createHash('sha256').update(backupBody).digest('hex'));
  }
});

test('no published manifest when a copy fails', async () => {
  const io = fixture();
  const original = io.writeBackup;
  io.writeBackup = async (pathname, ...args) => {
    if (pathname.includes('records%2Fa.rec')) throw new Error('storage down');
    return original(pathname, ...args);
  };
  await assert.rejects(runDailyBackup({ ...io, snapshotId: 'failed' }), /storage down/);
  assert.equal([...io.backup.keys()].filter((path) => path.endsWith('/manifest.json')).length, 0);
});

test('no published manifest when source store is empty', async () => {
  const io = fixture([]);
  await assert.rejects(runDailyBackup({ ...io, snapshotId: 'empty' }), /empty/);
  assert.equal(io.backup.size, 0);
});

test('source pagination and maximum file count fail closed', async () => {
  const io = fixture();
  await assert.rejects(runDailyBackup({ ...io, snapshotId: 'oversize', maxFiles: 1 }), /maximum backup file count/);
  assert.equal(io.backup.size, 0);
});

test('never backs up a backup prefix', async () => {
  const io = fixture(['config.json', 'autoprovoz-backups/old/manifest.json']);
  const result = await runDailyBackup({ ...io, snapshotId: 'skip-backups' });
  assert.equal(result.objectCount, 1);
});
