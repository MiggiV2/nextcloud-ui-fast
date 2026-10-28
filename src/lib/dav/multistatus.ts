import { XMLParser } from 'fast-xml-parser';

export type Props = Record<string, unknown>;

export interface DavResponse {
  href: string;
  status: number;
  props: Props;
}

export interface Multistatus {
  responses: DavResponse[];
  syncToken?: string;
}

const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => ['response', 'propstat', 'comp', 'href'].includes(name),
});

export function parseXml(xml: string): Record<string, any> {
  return parser.parse(xml);
}

function statusCode(status: unknown): number {
  const match = /HTTP\/[\d.]+\s+(\d{3})/.exec(String(status ?? ''));
  return match ? Number(match[1]) : 0;
}

export function text(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'object') {
    const t = (value as Record<string, unknown>)['#text'];
    return t === undefined ? undefined : String(t);
  }
  const s = String(value);
  return s === '' ? undefined : s;
}

export function firstHref(value: unknown): string | undefined {
  const hrefs = (value as { href?: string[] } | undefined)?.href;
  return hrefs?.[0];
}

export function hasType(resourcetype: unknown, type: string): boolean {
  return typeof resourcetype === 'object' && resourcetype !== null && type in resourcetype;
}

export function parseMultistatus(xml: string): Multistatus {
  const root = parseXml(xml).multistatus;
  if (root === undefined) throw new Error('not a multistatus response');
  const responses: DavResponse[] = (root?.response ?? []).map((r: any) => {
    const props: Props = {};
    let status = statusCode(r.status);
    for (const ps of r.propstat ?? []) {
      const code = statusCode(ps.status);
      if (code >= 200 && code < 300) {
        Object.assign(props, ps.prop ?? {});
        status = status || code;
      }
    }
    if (!status && r.propstat?.length) status = statusCode(r.propstat[0].status);
    return { href: r.href[0], status, props };
  });
  return { responses, syncToken: text(root?.['sync-token']) };
}
