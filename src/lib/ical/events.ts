import ICAL from 'ical.js';
import type { DavObject } from '../dav/parsers';

export interface EventFields {
  summary: string;
  location: string;
  description: string;
  start: Date;
  end: Date;
  allDay: boolean;
}

export interface Occurrence extends EventFields {
  key: string;
  href: string;
  etag: string;
  uid: string;
  recurring: boolean;
}

const MAX_ITERATIONS = 10_000;

function registerTimezones(vcalendar: ICAL.Component) {
  for (const tz of vcalendar.getAllSubcomponents('vtimezone')) {
    const tzid = String(tz.getFirstPropertyValue('tzid'));
    if (!ICAL.TimezoneService.has(tzid)) ICAL.TimezoneService.register(new ICAL.Timezone({ component: tz, tzid }));
  }
}

function fieldsOf(event: ICAL.Event, start: ICAL.Time, end: ICAL.Time): EventFields {
  return {
    summary: event.summary ?? '',
    location: event.location ?? '',
    description: event.description ?? '',
    start: start.toJSDate(),
    end: (end ?? start).toJSDate(),
    allDay: start.isDate,
  };
}

function overlaps(start: Date, end: Date, rangeStart: Date, rangeEnd: Date) {
  const effectiveEnd = end.getTime() > start.getTime() ? end : new Date(start.getTime() + 1);
  return effectiveEnd > rangeStart && start < rangeEnd;
}

function expandObject(object: DavObject, rangeStart: Date, rangeEnd: Date): Occurrence[] {
  const vcalendar = new ICAL.Component(ICAL.parse(object.data));
  registerTimezones(vcalendar);
  const events = vcalendar.getAllSubcomponents('vevent').map((c) => new ICAL.Event(c, { strictExceptions: false }));
  const masters = events.filter((e) => !e.isRecurrenceException());
  const exceptions = events.filter((e) => e.isRecurrenceException());
  const result: Occurrence[] = [];
  const base = { href: object.href, etag: object.etag };

  for (const master of masters) {
    exceptions.filter((e) => e.uid === master.uid).forEach((e) => master.relateException(e));
    if (!master.isRecurring()) {
      const fields = fieldsOf(master, master.startDate, master.endDate);
      if (overlaps(fields.start, fields.end, rangeStart, rangeEnd))
        result.push({ ...base, ...fields, key: object.href, uid: master.uid, recurring: false });
      continue;
    }
    const iterator = master.iterator();
    for (let i = 0, next = iterator.next(); next && i < MAX_ITERATIONS; i++, next = iterator.next()) {
      const details = master.getOccurrenceDetails(next);
      const fields = fieldsOf(details.item, details.startDate, details.endDate);
      if (next.toJSDate() >= rangeEnd && fields.start >= rangeEnd) break;
      if (overlaps(fields.start, fields.end, rangeStart, rangeEnd))
        result.push({
          ...base,
          ...fields,
          key: `${object.href}#${details.recurrenceId.toString()}`,
          uid: master.uid,
          recurring: true,
        });
    }
  }

  const masterUids = new Set(masters.map((m) => m.uid));
  for (const orphan of exceptions.filter((e) => !masterUids.has(e.uid))) {
    const fields = fieldsOf(orphan, orphan.startDate, orphan.endDate);
    if (overlaps(fields.start, fields.end, rangeStart, rangeEnd))
      result.push({
        ...base,
        ...fields,
        key: `${object.href}#${orphan.recurrenceId.toString()}`,
        uid: orphan.uid,
        recurring: true,
      });
  }
  return result;
}

export function expandEvents(objects: DavObject[], rangeStart: Date, rangeEnd: Date): Occurrence[] {
  const result: Occurrence[] = [];
  for (const object of objects) {
    try {
      result.push(...expandObject(object, rangeStart, rangeEnd));
    } catch (e) {
      console.warn('skipping unparsable calendar object', object.href, e);
    }
  }
  return result.sort((a, b) => a.start.getTime() - b.start.getTime());
}

function toIcalTime(date: Date, allDay: boolean): ICAL.Time {
  if (allDay)
    return ICAL.Time.fromData({
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      isDate: true,
    });
  return ICAL.Time.fromJSDate(date, true);
}

function setText(vevent: ICAL.Component, name: string, value: string) {
  vevent.removeAllProperties(name);
  if (value) vevent.addPropertyWithValue(name, value);
}

function applyFields(vevent: ICAL.Component, fields: EventFields) {
  setText(vevent, 'summary', fields.summary);
  setText(vevent, 'location', fields.location);
  setText(vevent, 'description', fields.description);
  for (const name of ['dtstart', 'dtend', 'duration']) vevent.removeAllProperties(name);
  vevent.addPropertyWithValue('dtstart', toIcalTime(fields.start, fields.allDay));
  vevent.addPropertyWithValue('dtend', toIcalTime(fields.end, fields.allDay));
  const now = ICAL.Time.fromJSDate(new Date(), true);
  vevent.updatePropertyWithValue('dtstamp', now);
  vevent.updatePropertyWithValue('last-modified', now);
}

export function buildEventIcs(fields: EventFields & { uid: string }): string {
  const vcalendar = new ICAL.Component('vcalendar');
  vcalendar.addPropertyWithValue('prodid', '-//nextcloud-ui-fast//EN');
  vcalendar.addPropertyWithValue('version', '2.0');
  vcalendar.addPropertyWithValue('calscale', 'GREGORIAN');
  const vevent = new ICAL.Component('vevent');
  vevent.addPropertyWithValue('uid', fields.uid);
  vevent.addPropertyWithValue('created', ICAL.Time.fromJSDate(new Date(), true));
  vevent.addPropertyWithValue('sequence', 0);
  applyFields(vevent, fields);
  vcalendar.addSubcomponent(vevent);
  return vcalendar.toString();
}

export function updateEventIcs(ics: string, fields: EventFields): string {
  const vcalendar = new ICAL.Component(ICAL.parse(ics));
  const master = vcalendar.getAllSubcomponents('vevent').find((c) => !c.hasProperty('recurrence-id'));
  if (!master) throw new Error('no master VEVENT');
  applyFields(master, fields);
  master.updatePropertyWithValue('sequence', Number(master.getFirstPropertyValue('sequence') ?? 0) + 1);
  return vcalendar.toString();
}
