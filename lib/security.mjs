const encoder = new TextEncoder();
export const SESSION_COOKIE = 'orbit_session';
export const ITERATIONS = 100000;
export function hex(buffer) { return Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, '0')).join(''); }
export async function digest(value) { return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value))); }
export async function hashPassword(password, salt = hex(crypto.getRandomValues(new Uint8Array(16)))) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(salt),iterations:ITERATIONS,hash:'SHA-256'},key,256);
  return `pbkdf2$${ITERATIONS}$${salt}$${hex(bits)}`;
}
export async function verifyPassword(password, stored) {
  const [algorithm, count, salt] = stored.split('$');
  if (algorithm !== 'pbkdf2' || Number(count) !== ITERATIONS || !salt) return false;
  const computed = await hashPassword(password,salt);
  let difference = computed.length ^ stored.length;
  for (let i=0;i<computed.length;i++) difference |= computed.charCodeAt(i) ^ (stored.charCodeAt(i) || 0);
  return difference === 0;
}
export function cookieToken(cookie = '') {
  return cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith(SESSION_COOKIE+'='))?.slice(SESSION_COOKIE.length+1) || '';
}
export function sessionCookie(token,secure,clear=false) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${clear?0:43200}${secure?'; Secure':''}`;
}
