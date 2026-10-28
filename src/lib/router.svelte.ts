import { parseHash } from './route';

export const router = $state({ route: parseHash(location.hash) });

addEventListener('hashchange', () => (router.route = parseHash(location.hash)));
