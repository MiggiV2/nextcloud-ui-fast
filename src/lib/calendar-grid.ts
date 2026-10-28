const DAY_MS = 86_400_000;

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function startOfWeek(d: Date) {
  return addDays(startOfDay(d), -((d.getDay() + 6) % 7));
}

export function weekDays(d: Date) {
  const monday = startOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function monthGrid(d: Date) {
  const first = startOfWeek(new Date(d.getFullYear(), d.getMonth(), 1));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

export function shiftDate(d: Date, mode: 'month' | 'week', delta: number) {
  return mode === 'month' ? new Date(d.getFullYear(), d.getMonth() + delta, 1) : addDays(d, 7 * delta);
}

export function visibleRange(d: Date, mode: 'month' | 'week'): [Date, Date] {
  const days = mode === 'month' ? monthGrid(d) : weekDays(d);
  return [days[0], addDays(days[days.length - 1], 1)];
}

export interface Timed {
  start: Date;
  end: Date;
}

export interface Placed<T> {
  item: T;
  top: number;
  height: number;
  column: number;
  columns: number;
}

export function layoutDay<T extends Timed>(items: T[], day: Date): Placed<T>[] {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = addDays(day, 1).getTime();
  const sorted = items
    .map((item) => ({
      item,
      from: Math.max(item.start.getTime(), dayStart),
      to: Math.min(Math.max(item.end.getTime(), item.start.getTime() + 15 * 60_000), dayEnd),
    }))
    .filter((e) => e.to > dayStart && e.from < dayEnd)
    .sort((a, b) => a.from - b.from || b.to - a.to);

  const placed: Placed<T>[] = [];
  let cluster: Placed<T>[] = [];
  let columnEnds: number[] = [];
  let clusterEnd = -Infinity;

  const closeCluster = () => {
    cluster.forEach((p) => (p.columns = columnEnds.length));
    cluster = [];
    columnEnds = [];
  };

  for (const e of sorted) {
    if (e.from >= clusterEnd) closeCluster();
    let column = columnEnds.findIndex((end) => end <= e.from);
    if (column === -1) column = columnEnds.push(e.to) - 1;
    else columnEnds[column] = e.to;
    const p = { item: e.item, top: (e.from - dayStart) / DAY_MS, height: (e.to - e.from) / DAY_MS, column, columns: 1 };
    cluster.push(p);
    placed.push(p);
    clusterEnd = Math.max(clusterEnd, e.to);
  }
  closeCluster();
  return placed;
}
