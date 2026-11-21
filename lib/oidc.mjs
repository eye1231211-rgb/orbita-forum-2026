/* Клиент единого входа (OpenID Connect, authorization code + PKCE).
   Написан на WebCrypto без внешних зависимостей, потому что «Орбита»
   работает и в Cloudflare Worker, и в переносимом Node-сервере.
   Что делает: находит точки входа по /.well-known/openid-configuration,
   отправляет студента на страницу университета, обменивает код на токены,
   проверяет подпись id_token по JWKS и возвращает утверждения о студенте.
   Пароль студента в «Орбиту» не попадает. */

const encoder = new TextEncoder();
const toBase64Url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')), ch => ch.charCodeAt(0));
const randomUrlSafe = size => toBase64Url(crypto.getRandomValues(new Uint8Array(size)));

async function signature(signing, value) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(signing), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  return toBase64Url(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

/* Состояние перелёта (state, nonce, PKCE-проверка, куда вернуть студента)
   живёт в подписанной cookie: сервер остаётся без общего хранилища, а подмену
   значения видно по подписи. */
export async function sealState(signing, payload) {
  const value = toBase64Url(encoder.encode(JSON.stringify(payload)));
  return value + '.' + await signature(signing, value);
}
export async function openState(signing, sealed, maxAgeMs = 600_000, now = Date.now()) {
  const [value, mac] = String(sealed || '').split('.');
  if (!value || !mac) return null;
  const expected = await signature(signing, value);
  let difference = expected.length ^ mac.length;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ (mac.charCodeAt(i) || 0);
  if (difference !== 0) return null;
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(fromBase64Url(value))); } catch { return null; }
  if (!payload?.issued || now - payload.issued > maxAgeMs || payload.issued > now + 60_000) return null;
  return payload;
}

export const STATE_COOKIE = 'orbit_sso';
export function stateCookie(value, secure, clear = false) {
  return `${STATE_COOKIE}=${value}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=${clear ? 0 : 600}${secure ? '; Secure' : ''}`;
}
export function readStateCookie(cookie = '') {
  return cookie.split(';').map(part => part.trim()).find(part => part.startsWith(STATE_COOKIE + '='))?.slice(STATE_COOKIE.length + 1) || '';
}

const discovered = new Map();
async function load(url, options, fetchImpl) {
  // Cloudflare Workers не поддерживают redirect: 'error'. 'manual' даёт тот же
  // запрет на переход: ответ 3xx не ok, и запрос заканчивается ошибкой.
  const response = await fetchImpl(url, {redirect: 'manual', signal: AbortSignal.timeout(10_000), ...options});
  if (!response.ok) throw new Error('Единый вход РЭУ не ответил (HTTP ' + response.status + ').');
  return response.json();
}
const httpsPoint = (value, issuer) => {
  const url = new URL(String(value));
  if (url.protocol !== 'https:' && new URL(issuer).protocol === 'https:') throw new Error('Единый вход РЭУ вернул небезопасный адрес.');
  return url.href;
};

export async function discover(issuer, fetchImpl = fetch, now = Date.now()) {
  const saved = discovered.get(issuer);
  if (saved && now - saved.time < 3_600_000) return saved.value;
  const document = await load(issuer + '/.well-known/openid-configuration', {headers: {Accept: 'application/json'}}, fetchImpl);
  if (String(document.issuer || '').replace(/\/$/, '') !== issuer) throw new Error('Единый вход РЭУ представился другим адресом.');
  const value = {
    issuer,
    authorization: httpsPoint(document.authorization_endpoint, issuer),
    token: httpsPoint(document.token_endpoint, issuer),
    jwks: httpsPoint(document.jwks_uri, issuer)
  };
  if (discovered.size >= 8) discovered.delete(discovered.keys().next().value);
  discovered.set(issuer, {time: now, value});
  return value;
}

/* Часы приходят снаружи: одно и то же время подписывает состояние перелёта и
   проверяет срок удостоверения, поэтому проверки воспроизводимы в тестах. */
export async function startLogin(source, {redirectUri, destination = '/', now = Date.now()}, fetchImpl = fetch) {
  const points = await discover(source.issuer, fetchImpl);
  const verifier = randomUrlSafe(32);
  const challenge = toBase64Url(await crypto.subtle.digest('SHA-256', encoder.encode(verifier)));
  const state = randomUrlSafe(16), nonce = randomUrlSafe(16);
  const url = new URL(points.authorization);
  for (const [name, value] of Object.entries({
    response_type: 'code', client_id: source.clientId, redirect_uri: redirectUri,
    scope: source.scopes, state, nonce, code_challenge: challenge, code_challenge_method: 'S256'
  })) url.searchParams.set(name, value);
  return {url: url.href, state: await sealState(source.signing, {state, nonce, verifier, destination, issued: now})};
}

export async function completeLogin(source, {query, sealed, redirectUri, now = Date.now()}, fetchImpl = fetch) {
  const opened = await openState(source.signing, sealed, 600_000, now);
  if (!opened) throw new Error('Вход занял слишком много времени. Начните заново.');
  if (query.get('error')) throw new Error('Университет отказал во входе.');
  const code = query.get('code') || '';
  if (!code || code.length > 2048) throw new Error('Университет не передал код входа.');
  if (query.get('state') !== opened.state) throw new Error('Ответ единого входа не совпал с запросом.');
  const points = await discover(source.issuer, fetchImpl);
  const form = new URLSearchParams({
    grant_type: 'authorization_code', code, redirect_uri: redirectUri,
    client_id: source.clientId, code_verifier: opened.verifier
  });
  form.set('client_secret', source.clientSecret);
  const tokens = await load(points.token, {
    method: 'POST', body: form,
    headers: {'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json'}
  }, fetchImpl);
  if (!tokens.id_token) throw new Error('Единый вход РЭУ не выдал удостоверение студента.');
  const claims = await verifyIdToken(tokens.id_token, {
    jwks: await load(points.jwks, {headers: {Accept: 'application/json'}}, fetchImpl),
    clientId: source.clientId, issuer: source.issuer, nonce: opened.nonce, now
  });
  return {claims, destination: typeof opened.destination === 'string' ? opened.destination : '/'};
}

const ALGORITHMS = {
  RS256: {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256', verify: {name: 'RSASSA-PKCS1-v1_5'}},
  ES256: {name: 'ECDSA', namedCurve: 'P-256', verify: {name: 'ECDSA', hash: 'SHA-256'}}
};

export async function verifyIdToken(token, {jwks, clientId, issuer, nonce, now = Date.now()}) {
  const parts = String(token).split('.');
  if (parts.length !== 3) throw new Error('Удостоверение студента повреждено.');
  const header = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[0])));
  const algorithm = ALGORITHMS[header.alg];
  if (!algorithm) throw new Error('Единый вход РЭУ подписал удостоверение неизвестным алгоритмом.');
  const candidates = (jwks?.keys || []).filter(key => (!header.kid || !key.kid || key.kid === header.kid) && (!key.alg || key.alg === header.alg));
  if (!candidates.length) throw new Error('Не найден ключ проверки подписи единого входа.');
  const data = encoder.encode(parts[0] + '.' + parts[1]);
  const mac = fromBase64Url(parts[2]);
  let verified = false;
  for (const jwk of candidates) {
    const key = await crypto.subtle.importKey('jwk', {...jwk, ext: true, key_ops: ['verify']}, algorithm, false, ['verify']);
    if (await crypto.subtle.verify(algorithm.verify, key, mac, data)) { verified = true; break; }
  }
  if (!verified) throw new Error('Подпись удостоверения студента не подтвердилась.');
  const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[1])));
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const seconds = Math.floor(now / 1000);
  if (String(claims.iss || '').replace(/\/$/, '') !== issuer) throw new Error('Удостоверение выдано другим сервисом.');
  if (!audience.includes(clientId)) throw new Error('Удостоверение выдано другому приложению.');
  if (!(Number(claims.exp) > seconds - 60)) throw new Error('Удостоверение студента истекло. Войдите заново.');
  if (Number(claims.iat) > seconds + 300) throw new Error('Время выдачи удостоверения в будущем.');
  if (nonce && claims.nonce !== nonce) throw new Error('Удостоверение не относится к этому входу.');
  return claims;
}
