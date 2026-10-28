import { liveQuery } from 'dexie';

export function live<A, T>(deps: () => A, query: (args: A) => Promise<T>, initial: T) {
  let value = $state.raw(initial);
  $effect(() => {
    const args = deps();
    value = initial;
    const subscription = liveQuery(() => query(args)).subscribe({
      next: (v) => (value = v),
      error: (e) => console.error(e),
    });
    return () => subscription.unsubscribe();
  });
  return {
    get current() {
      return value;
    },
  };
}
