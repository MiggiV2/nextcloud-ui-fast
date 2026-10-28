import type { DavClient } from '../dav/client';

export const CHUNK_SIZE = 10 * 1024 * 1024;

export async function uploadFile(
  client: DavClient,
  user: string,
  targetHref: string,
  file: Blob,
  onProgress: (sent: number) => void = () => {},
) {
  if (file.size <= CHUNK_SIZE) {
    await client.request('PUT', targetHref, {
      body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
    });
    onProgress(file.size);
    return;
  }
  const destination = new URL(targetHref, globalThis.location?.origin).toString();
  const uploadDir = `/remote.php/dav/uploads/${encodeURIComponent(user)}/web-${crypto.randomUUID()}`;
  await client.request('MKCOL', uploadDir, { headers: { Destination: destination } });
  try {
    for (let offset = 0, n = 1; offset < file.size; offset += CHUNK_SIZE, n++) {
      const chunk = file.slice(offset, offset + CHUNK_SIZE);
      await client.request('PUT', `${uploadDir}/${String(n).padStart(5, '0')}`, {
        body: chunk,
        headers: { Destination: destination, 'OC-Total-Length': String(file.size) },
      });
      onProgress(Math.min(offset + CHUNK_SIZE, file.size));
    }
    await client.request('MOVE', `${uploadDir}/.file`, {
      headers: { Destination: destination, 'OC-Total-Length': String(file.size), Overwrite: 'T' },
    });
  } catch (e) {
    await client.request('DELETE', uploadDir).catch(() => {});
    throw e;
  }
}
