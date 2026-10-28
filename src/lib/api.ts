import type { Reply, Request, WorkerApi } from './worker/protocol';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

type Progress = { href: string; sent: number; total: number };

const worker = new Worker(new URL('./worker/dav.worker.ts', import.meta.url), { type: 'module' });
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
const progressListeners = new Set<(p: Progress) => void>();
let nextId = 1;

worker.onmessage = (event: MessageEvent<Reply>) => {
  const reply = event.data;
  if ('progress' in reply) {
    progressListeners.forEach((l) => l(reply.progress));
    return;
  }
  const entry = pending.get(reply.id);
  if (!entry) return;
  pending.delete(reply.id);
  if (reply.ok) entry.resolve(reply.value);
  else entry.reject(new ApiError(reply.error, reply.status));
};

export const api = new Proxy({} as WorkerApi, {
  get:
    (_, method: keyof WorkerApi) =>
    (...args: unknown[]) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, method, args } satisfies Request);
      }),
});

export function onUploadProgress(listener: (p: Progress) => void) {
  progressListeners.add(listener);
  return () => progressListeners.delete(listener);
}
