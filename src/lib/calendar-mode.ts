export type CalendarMode = 'month' | 'week';

const MODE_KEY = 'calendar.mode';

export function readCalendarMode(storage: Storage = localStorage): CalendarMode {
  try {
    return storage.getItem(MODE_KEY) === 'week' ? 'week' : 'month';
  } catch {
    return 'month';
  }
}

export function saveCalendarMode(mode: CalendarMode, storage: Storage = localStorage) {
  try {
    storage.setItem(MODE_KEY, mode);
  } catch {
    /* storage unavailable */
  }
}
