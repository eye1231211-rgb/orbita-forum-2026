// Страницы портала, которые открываются без входа: экран входа и открытое
// расписание любой группы РЭУ.
export const publicRoutes = ['/login', '/timetable'];

const sections = new Map([
  ['/', ['task','lesson','date','subject']],
  ['/schedule', ['tab', 'view', 'date', 'lesson', 'group', 'school', 'course']],
  ['/notifications', ['tab']],
  ['/vibe', []],
  ['/timetable', ['group', 'date', 'view']],
  ['/requests/new', ['type', 'subject']],
  ['/requests', []], ['/profile', []], ['/grades', []],
]);

// Only named portal pages and their public navigation parameters survive sign-in.
export function returnPath(value) {
  if (typeof value !== 'string' || value.length > 4096 || !value.startsWith('/') || value.startsWith('//')) return '/';
  let url;
  try { url = new URL(value, 'https://orbita.invalid'); } catch { return '/'; }
  if (url.origin !== 'https://orbita.invalid') return '/';
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const allowed = sections.get(path);
  if (!allowed && !/^\/requests\/(?:demo-request-(?:alina|mark)|[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i.test(path)) return '/';
  const query = new URLSearchParams();
  for (const key of allowed || []) {
    const entry = url.searchParams.get(key);
    if (entry && entry.length <= 240) query.set(key, entry);
  }
  const hash = path === '/schedule' && /^#lesson-[\w-]{1,80}$/.test(url.hash) ? url.hash : '';
  return path + (query.size ? '?' + query.toString() : '') + hash;
}

export function loginPath(destination) {
  const target = returnPath(destination);
  return target === '/' ? '/login' : '/login?' + new URLSearchParams({next:target}).toString();
}
