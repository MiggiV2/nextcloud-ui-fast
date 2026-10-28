import { describe, expect, it } from 'vitest';
import { fixture } from '../../../test/fixtures';
import { parseObjects } from '../dav/parsers';
import { buildVCard, parseVCard, updateVCard } from './vcard';

const cards = parseObjects(fixture('contacts-synthetic.xml'));

describe('parseVCard', () => {
  it('reads vCard 3.0 fields', () => {
    // when
    const contact = parseVCard(cards[0].data);

    // then
    expect(contact).toEqual({
      uid: '1f0c9d2e-8a4b-4c55-9e1a-3b7d6f2a9c01',
      fullName: 'Erika Mustermann',
      org: 'Beispiel GmbH',
      emails: [{ type: 'home', value: 'erika@example.org' }],
      phones: [{ type: 'cell', value: '+49 170 0000000' }],
      addresses: ['Musterstraße 1, 12345 Musterstadt, Deutschland'],
      note: 'Synthetischer Testkontakt, nicht echt',
    });
  });

  it('reads multiple values and vCard 4.0', () => {
    // when
    const contact = parseVCard(cards[1].data);

    // then
    expect(contact.emails).toEqual([
      { type: 'work', value: 'max@example.com' },
      { type: 'home', value: 'max.privat@example.com' },
    ]);
    expect(contact.phones).toEqual([{ type: 'work', value: '+49 89 0000000' }]);
  });
});

describe('updateVCard', () => {
  it('replaces edited fields and keeps unknown properties', () => {
    // when
    const updated = updateVCard(cards[0].data, {
      fullName: 'Erika Neu',
      org: '',
      note: 'Notiz',
      emails: [{ type: 'work', value: 'neu@example.org' }],
      phones: [],
    });
    const contact = parseVCard(updated);

    // then
    expect(contact.fullName).toBe('Erika Neu');
    expect(contact.org).toBe('');
    expect(contact.emails).toEqual([{ type: 'work', value: 'neu@example.org' }]);
    expect(contact.phones).toEqual([]);
    expect(contact.addresses).toHaveLength(1);
    expect(updated).toContain('PRODID:');
  });
});

describe('buildVCard', () => {
  it('creates a parsable vCard', () => {
    // when
    const contact = parseVCard(
      buildVCard('new-uid', {
        fullName: 'Neu',
        org: 'Org',
        note: '',
        emails: [],
        phones: [{ type: 'cell', value: '1' }],
      }),
    );

    // then
    expect(contact).toMatchObject({
      uid: 'new-uid',
      fullName: 'Neu',
      org: 'Org',
      phones: [{ type: 'cell', value: '1' }],
    });
  });
});
