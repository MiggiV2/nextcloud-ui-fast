import { describe, expect, it, vi } from 'vitest';
import { DavClient, DavHttpError } from './client';

function fakeFetch(responses: Array<Response | (() => Response)>) {
  const calls: Request[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(new Request(new URL(String(input), 'https://cloud.example.org'), init));
    const next = responses.shift();
    if (!next) throw new Error('unexpected request');
    return typeof next === 'function' ? next() : next;
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const token = () => new Response(JSON.stringify({ token: 'csrf-1' }), { status: 200 });

describe('DavClient', () => {
  it('sends the CSRF requesttoken fetched once from /index.php/csrftoken', async () => {
    // given
    const { fn, calls } = fakeFetch([
      token(),
      new Response('<x/>', { status: 207 }),
      new Response('<y/>', { status: 207 }),
    ]);
    const client = new DavClient({ fetch: fn });

    // when
    await client.propfind('/remote.php/dav/files/demo/', '<p/>', 1);
    await client.propfind('/remote.php/dav/files/demo/a/', '<p/>', 1);

    // then
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual([
      '/index.php/csrftoken',
      '/remote.php/dav/files/demo/',
      '/remote.php/dav/files/demo/a/',
    ]);
    expect(calls[1].method).toBe('PROPFIND');
    expect(calls[1].headers.get('requesttoken')).toBe('csrf-1');
    expect(calls[1].headers.get('Depth')).toBe('1');
    expect(calls[1].credentials).toBe('include');
  });

  it('uses If-Match for updates and returns the new etag', async () => {
    // given
    const { fn, calls } = fakeFetch([token(), new Response(null, { status: 204, headers: { ETag: '"new-etag"' } })]);
    const client = new DavClient({ fetch: fn });

    // when
    const etag = await client.put('/c/e.ics', 'BEGIN:VCALENDAR', 'text/calendar', 'old-etag');

    // then
    expect(etag).toBe('new-etag');
    expect(calls[1].headers.get('If-Match')).toBe('"old-etag"');
    expect(calls[1].headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
  });

  it('uses If-None-Match for creates', async () => {
    // given
    const { fn, calls } = fakeFetch([token(), new Response(null, { status: 201 })]);
    const client = new DavClient({ fetch: fn });

    // when
    const etag = await client.put('/c/n.ics', 'x', 'text/calendar', null);

    // then
    expect(etag).toBeNull();
    expect(calls[1].headers.get('If-None-Match')).toBe('*');
  });

  it('sends absolute Destination for MOVE', async () => {
    // given
    const { fn, calls } = fakeFetch([token(), new Response(null, { status: 201 })]);
    const client = new DavClient({ fetch: fn });

    // when
    await client.move('/remote.php/dav/files/demo/a.txt', '/remote.php/dav/files/demo/b c.txt');

    // then
    expect(calls[1].method).toBe('MOVE');
    expect(calls[1].headers.get('Destination')).toBe('https://cloud.example.org/remote.php/dav/files/demo/b%20c.txt');
    expect(calls[1].headers.get('Overwrite')).toBe('F');
  });

  it('keeps already percent-encoded reserved characters in Destination unchanged', async () => {
    // given
    const { fn, calls } = fakeFetch([token(), new Response(null, { status: 201 })]);
    const client = new DavClient({ fetch: fn });

    // when
    await client.move('/remote.php/dav/files/demo/a.txt', '/remote.php/dav/files/demo/Q%26A%23%2B.txt');

    // then
    expect(calls[1].headers.get('Destination')).toBe(
      'https://cloud.example.org/remote.php/dav/files/demo/Q%26A%23%2B.txt',
    );
  });

  it('throws DavHttpError with status on failure', async () => {
    // given
    const { fn } = fakeFetch([token(), new Response('nope', { status: 412 })]);
    const client = new DavClient({ fetch: fn });

    // when
    const error = await client.delete('/x', 'e').catch((e) => e);

    // then
    expect(error).toBeInstanceOf(DavHttpError);
    expect(error.status).toBe(412);
  });

  it('refreshes the token once when the server rejects it with 401', async () => {
    // given
    const { fn, calls } = fakeFetch([
      token(),
      new Response('', { status: 401 }),
      new Response(JSON.stringify({ token: 'csrf-2' })),
      new Response('<ok/>', { status: 207 }),
    ]);
    const client = new DavClient({ fetch: fn });

    // when
    const body = await client.report('/c/', '<r/>', 1);

    // then
    expect(body).toBe('<ok/>');
    expect(calls[3].headers.get('requesttoken')).toBe('csrf-2');
  });
});
