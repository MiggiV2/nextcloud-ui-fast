export class DavHttpError extends Error {
  constructor(
    readonly status: number,
    readonly method: string,
    readonly href: string,
    readonly body: string,
  ) {
    super(`${method} ${href} failed with ${status}`);
  }
}

export interface DavClientOptions {
  fetch?: typeof fetch;
  origin?: string;
}

type Depth = 0 | 1 | 'infinity';

const quote = (etag: string) => (etag.startsWith('"') ? etag : `"${etag}"`);

export class DavClient {
  private readonly fetchFn: typeof fetch;
  private readonly origin: string;
  private token: Promise<string> | null = null;

  constructor(options: DavClientOptions = {}) {
    this.fetchFn = options.fetch ?? fetch.bind(globalThis);
    this.origin = options.origin ?? globalThis.location?.origin ?? 'https://cloud.example.org';
  }

  private fetchToken(): Promise<string> {
    this.token ??= this.fetchFn('/index.php/csrftoken', { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) throw new DavHttpError(r.status, 'GET', '/index.php/csrftoken', await r.text());
        return ((await r.json()) as { token: string }).token;
      })
      .catch((e) => {
        this.token = null;
        throw e;
      });
    return this.token;
  }

  async request(method: string, href: string, init: { body?: BodyInit; headers?: Record<string, string> } = {}) {
    if (!href) throw new Error(`${method} without href`);
    for (let attempt = 0; ; attempt++) {
      const headers = new Headers(init.headers);
      headers.set('requesttoken', await this.fetchToken());
      headers.set('X-Requested-With', 'XMLHttpRequest');
      const response = await this.fetchFn(href, { method, body: init.body, headers, credentials: 'include' });
      if (response.status === 401 && attempt === 0) {
        this.token = null;
        continue;
      }
      if (!response.ok && response.status !== 207) {
        throw new DavHttpError(response.status, method, href, await response.text());
      }
      return response;
    }
  }

  private xml(method: string, href: string, body: string, depth?: Depth) {
    const headers: Record<string, string> = { 'Content-Type': 'application/xml; charset=utf-8' };
    if (depth !== undefined) headers.Depth = String(depth);
    return this.request(method, href, { body, headers }).then((r) => r.text());
  }

  propfind(href: string, body: string, depth: Depth = 1) {
    return this.xml('PROPFIND', href, body, depth);
  }

  report(href: string, body: string, depth?: Depth) {
    return this.xml('REPORT', href, body, depth);
  }

  async get(href: string): Promise<Response> {
    return this.request('GET', href);
  }

  async getText(href: string): Promise<{ text: string; etag: string }> {
    const response = await this.request('GET', href);
    const etag = response.headers.get('ETag') ?? response.headers.get('OC-ETag') ?? '';
    return { text: await response.text(), etag: etag.replace(/^W\//, '').replace(/"/g, '') };
  }

  async put(href: string, body: BodyInit, contentType: string, etag: string | null): Promise<string | null> {
    const headers: Record<string, string> = {
      'Content-Type':
        contentType.includes('charset') || !contentType.startsWith('text/')
          ? contentType
          : `${contentType}; charset=utf-8`,
    };
    if (etag) headers['If-Match'] = quote(etag);
    else headers['If-None-Match'] = '*';
    const response = await this.request('PUT', href, { body, headers });
    const newEtag = response.headers.get('ETag') ?? response.headers.get('OC-ETag');
    return newEtag ? newEtag.replace(/^W\//, '').replace(/"/g, '') : null;
  }

  async delete(href: string, etag?: string) {
    await this.request('DELETE', href, { headers: etag ? { 'If-Match': quote(etag) } : {} });
  }

  async move(from: string, to: string, overwrite = false) {
    await this.request('MOVE', from, { headers: { Destination: this.absolute(to), Overwrite: overwrite ? 'T' : 'F' } });
  }

  async copy(from: string, to: string, overwrite = false) {
    await this.request('COPY', from, { headers: { Destination: this.absolute(to), Overwrite: overwrite ? 'T' : 'F' } });
  }

  async mkcol(href: string) {
    await this.request('MKCOL', href);
  }

  private absolute(href: string) {
    return new URL(href, this.origin).toString();
  }
}
