import { parsePrincipal, type Principal } from '../dav/parsers';
import { PRINCIPAL_PROPFIND } from '../dav/requests';

export interface PrincipalDav {
  propfind(href: string, body: string, depth?: 0 | 1): Promise<string>;
}

export const isComplete = (p: Principal) => !!p.calendarHome && !!p.addressbookHome;

export async function discoverPrincipal(dav: PrincipalDav): Promise<Principal> {
  const root = parsePrincipal(await dav.propfind('/remote.php/dav/', PRINCIPAL_PROPFIND, 0));
  const principal = isComplete(root) ? root : parsePrincipal(await dav.propfind(root.href, PRINCIPAL_PROPFIND, 0));
  if (!isComplete(principal)) throw new Error(`principal ${principal.href} exposes no calendar/addressbook home`);
  return principal;
}
