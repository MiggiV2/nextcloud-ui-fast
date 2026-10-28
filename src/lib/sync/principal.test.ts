import { describe, expect, it } from 'vitest';
import { fixture } from '../../../test/fixtures';
import { discoverPrincipal, isComplete, type PrincipalDav } from './principal';

const rootResponse = `<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:" xmlns:cal="urn:ietf:params:xml:ns:caldav" xmlns:card="urn:ietf:params:xml:ns:carddav"><d:response><d:href>/remote.php/dav/</d:href><d:propstat><d:prop><d:current-user-principal><d:href>/remote.php/dav/principals/users/demo/</d:href></d:current-user-principal></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat><d:propstat><d:prop><d:displayname/><cal:calendar-home-set/><card:addressbook-home-set/></d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat></d:response></d:multistatus>`;

function fakeDav(responses: string[]) {
  const requested: string[] = [];
  const dav: PrincipalDav = {
    async propfind(href) {
      requested.push(href);
      const next = responses.shift();
      if (next === undefined) throw new Error('unexpected propfind');
      return next;
    },
  };
  return { dav, requested };
}

describe('discoverPrincipal', () => {
  it('follows current-user-principal because the DAV root does not expose the home sets', async () => {
    // given
    const { dav, requested } = fakeDav([rootResponse, fixture('principal.xml')]);

    // when
    const principal = await discoverPrincipal(dav);

    // then
    expect(requested).toEqual(['/remote.php/dav/', '/remote.php/dav/principals/users/demo/']);
    expect(principal).toMatchObject({
      user: 'demo',
      calendarHome: '/remote.php/dav/calendars/demo/',
      addressbookHome: '/remote.php/dav/addressbooks/users/demo/',
    });
  });

  it('fails instead of returning empty home sets', async () => {
    // given
    const { dav } = fakeDav([
      rootResponse,
      rootResponse.replace(
        '<d:href>/remote.php/dav/</d:href>',
        '<d:href>/remote.php/dav/principals/users/demo/</d:href>',
      ),
    ]);

    // when
    const error = await discoverPrincipal(dav).catch((e) => e);

    // then
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toMatch(/home/);
  });
});

describe('isComplete', () => {
  it('rejects cached principals from the broken discovery that lack home sets', () => {
    expect(isComplete({ href: '/p/', user: 'demo', displayName: 'demo', calendarHome: '', addressbookHome: '' })).toBe(
      false,
    );
    expect(
      isComplete({ href: '/p/', user: 'demo', displayName: 'demo', calendarHome: '/c/', addressbookHome: '/a/' }),
    ).toBe(true);
  });
});
