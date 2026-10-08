import { head, get, put, BlobError, BlobNotFoundError, BlobPreconditionFailedError } from '@vercel/blob';

export class BlobJsonConflictError extends Error {}

export async function mutateBlobJsonArray(path, mutate, { token } = {}) {
  const auth = token ? { token } : {};
  for (let attempt = 0; attempt < 6; attempt++) {
    let metadata = null;
    try {
      metadata = await head(path, auth);
    } catch (error) {
      if (!(error instanceof BlobNotFoundError)) throw error;
    }
    // Download responses can have a weak ETag after compression. Conditional
    // writes need the storage ETag from head(), read BEFORE downloading so a
    // concurrent overwrite between the two reads still causes a safe retry.
    if (metadata && !metadata.etag) throw new Error('Blob storage did not return an ETag');
    const snapshot = metadata ? await get(path, { ...auth, access: 'private', useCache: false }) : null;
    if (metadata && snapshot?.statusCode !== 200) continue;
    const rows = snapshot ? JSON.parse(await new Response(snapshot.stream).text()) : [];
    const out = await mutate(Array.isArray(rows) ? rows : []);
    if (!out.changed) return out;
    try {
      await put(path, JSON.stringify(out.rows), {
        ...auth, access: 'private', addRandomSuffix: false, allowOverwrite: !!metadata,
        contentType: 'application/json', ...(metadata ? { ifMatch: metadata.etag } : {}),
      });
    } catch (error) {
      const createdMeanwhile = !metadata && error instanceof BlobError && error.message.startsWith('Vercel Blob: This blob already exists,');
      if (error instanceof BlobPreconditionFailedError || createdMeanwhile) continue;
      throw error;
    }
    return out;
  }
  throw new BlobJsonConflictError('Concurrent Blob updates exhausted the retry limit');
}
