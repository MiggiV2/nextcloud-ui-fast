import ICAL from 'ical.js';

export interface TypedValue {
  type: string;
  value: string;
}

export interface Contact {
  uid: string;
  fullName: string;
  org: string;
  emails: TypedValue[];
  phones: TypedValue[];
  addresses: string[];
  note: string;
}

export type ContactEdit = Pick<Contact, 'fullName' | 'org' | 'note' | 'emails' | 'phones'>;

function joined(value: unknown): string {
  if (Array.isArray(value)) return value.flat().filter(Boolean).join(', ');
  return value === undefined || value === null ? '' : String(value);
}

function typeOf(prop: ICAL.Property): string {
  const type = prop.getParameter('type');
  const first = Array.isArray(type) ? type[0] : type;
  return (first ?? 'other').toLowerCase();
}

function typed(vcard: ICAL.Component, name: string): TypedValue[] {
  return vcard
    .getAllProperties(name)
    .map((p) => ({ type: typeOf(p), value: String(p.getFirstValue() ?? '').replace(/^tel:/, '') }));
}

function formatAddress(value: unknown): string {
  const [, , street, locality, , code, country] = (Array.isArray(value) ? value : [value]).map((v) => joined(v));
  return [street, [code, locality].filter(Boolean).join(' '), country].filter(Boolean).join(', ');
}

export function parseVCard(data: string): Contact {
  const vcard = new ICAL.Component(ICAL.parse(data));
  return {
    uid: String(vcard.getFirstPropertyValue('uid') ?? ''),
    fullName: String(vcard.getFirstPropertyValue('fn') ?? ''),
    org: joined(vcard.getFirstPropertyValue('org')),
    emails: typed(vcard, 'email'),
    phones: typed(vcard, 'tel'),
    addresses: vcard.getAllProperties('adr').map((p) => formatAddress(p.getFirstValue())),
    note: String(vcard.getFirstPropertyValue('note') ?? ''),
  };
}

function replaceTyped(vcard: ICAL.Component, name: string, values: TypedValue[]) {
  vcard.removeAllProperties(name);
  for (const { type, value } of values.filter((v) => v.value.trim())) {
    const prop = new ICAL.Property(name, vcard);
    prop.setParameter('type', type);
    prop.setValue(value.trim());
    vcard.addProperty(prop);
  }
}

function applyEdit(vcard: ICAL.Component, edit: ContactEdit) {
  vcard.updatePropertyWithValue('fn', edit.fullName);
  for (const [name, value] of [
    ['org', edit.org],
    ['note', edit.note],
  ] as const) {
    vcard.removeAllProperties(name);
    if (value) vcard.addPropertyWithValue(name, value);
  }
  replaceTyped(vcard, 'email', edit.emails);
  replaceTyped(vcard, 'tel', edit.phones);
  vcard.updatePropertyWithValue('rev', ICAL.Time.fromJSDate(new Date(), true));
}

export function updateVCard(data: string, edit: ContactEdit): string {
  const vcard = new ICAL.Component(ICAL.parse(data));
  applyEdit(vcard, edit);
  return vcard.toString();
}

export function buildVCard(uid: string, edit: ContactEdit): string {
  const vcard = new ICAL.Component('vcard');
  vcard.addPropertyWithValue('version', '3.0');
  vcard.addPropertyWithValue('uid', uid);
  const parts = edit.fullName.trim().split(/\s+/);
  const family = parts.length > 1 ? parts.pop()! : '';
  vcard.addPropertyWithValue('n', [family, parts.join(' '), '', '', '']);
  applyEdit(vcard, edit);
  return vcard.toString();
}
