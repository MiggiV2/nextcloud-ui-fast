import { parseHash } from './route';

export const router = $state({ route: parseHash(location.hash) });

let leaveGuard: (() => boolean) | null = null;
let currentHash = location.hash;

addEventListener('hashchange', () => {
  if (leaveGuard && !leaveGuard()) {
    history.replaceState(null, '', currentHash || '#/');
    return;
  }
  currentHash = location.hash;
  router.route = parseHash(location.hash);
});

export function setLeaveGuard(guard: () => boolean) {
  leaveGuard = guard;
  return () => {
    if (leaveGuard === guard) leaveGuard = null;
  };
}
