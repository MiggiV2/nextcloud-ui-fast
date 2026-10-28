import type { Occurrence, EventFields } from '../ical/events';
import type { Contact, ContactEdit } from '../ical/vcard';
import type { Principal } from '../dav/parsers';
import type { DocumentRow } from '../db';

export interface ContactEntry extends Contact {
  href: string;
  etag: string;
  collection: string;
}

export interface CalendarOccurrence extends Occurrence {
  collection: string;
}

export interface WorkerApi {
  bootstrap(): Promise<Principal>;
  syncFolder(href: string): Promise<{ changed: boolean; staleSubfolders: string[] }>;
  prefetchFolder(href: string): Promise<void>;
  syncCalendars(): Promise<void>;
  syncAddressbooks(): Promise<void>;
  expand(collections: string[], start: number, end: number): Promise<CalendarOccurrence[]>;
  contacts(): Promise<ContactEntry[]>;
  move(from: string, to: string): Promise<void>;
  remove(href: string): Promise<void>;
  mkdir(href: string): Promise<void>;
  upload(targetHref: string, file: File): Promise<void>;
  saveEvent(collection: string, href: string | null, fields: EventFields): Promise<void>;
  deleteEvent(href: string): Promise<void>;
  saveContact(collection: string, href: string | null, edit: ContactEdit): Promise<void>;
  deleteContact(href: string): Promise<void>;
  openDocument(href: string, force?: boolean): Promise<DocumentRow>;
  saveDocument(href: string, text: string, etag: string): Promise<DocumentRow>;
  createDocument(href: string, text: string): Promise<void>;
}

export type Request = { id: number; method: keyof WorkerApi; args: unknown[] };
export type Reply =
  | { id: number; ok: true; value: unknown }
  | { id: number; ok: false; error: string; status?: number }
  | { id: -1; progress: { href: string; sent: number; total: number } };
