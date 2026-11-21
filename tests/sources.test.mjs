import {prepareTestAccounts, testCredentials} from './test-accounts.mjs';
/* Проверки подключения к университету: конфигурация источников, открытое
   расписание любой группы, единый вход (OpenID Connect) и ведомость РЭУ.
   Сеть здесь не используется — ответы университета подменяются заглушками,
   поэтому тесты не зависят от доступности rasp.rea.ru. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {sqliteAdapter} from '../scripts/sqlite-adapter.mjs';
import {handleApi} from '../lib/api.mjs';
import {readSources, describeSources} from '../lib/sources.mjs';
import {demoAccounts} from '../lib/demo-accounts.mjs';

const NOW = new Date('2026-11-16T07:15:00Z');
const GROUP = '15.28Д-ТА01/25с';
const demoAccount = testCredentials('alina');
const secretValue = prefix => prefix + '-' + crypto.randomUUID() + crypto.randomUUID();

async function database() {
  const db = sqliteAdapter();
  for (const file of readdirSync('drizzle').filter(name => name.endsWith('.sql'))) db.sqlite.exec(readFileSync('drizzle/' + file, 'utf8'));
  await prepareTestAccounts(db);
  return db;
}
const caller = (db, env) => async (path, {method = 'GET', body, cookie, origin = 'https://orbit.test'} = {}) => {
  const headers = {origin, 'content-type': 'application/json', ...(cookie ? {cookie} : {})};
  const response = await handleApi(new Request('https://orbit.test/api' + path, {
    method, headers, ...(body === undefined ? {} : {body: JSON.stringify(body)})
  }), db, NOW, env);
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return {status: response.status, data, text, headers: response.headers, cookies: response.headers.getSetCookie()};
};
const cookieOf = (list, name) => list.map(line => line.split(';')[0]).find(pair => pair.startsWith(name + '='));
const openState = flight => JSON.parse(new TextDecoder().decode(
  Uint8Array.from(atob(flight.slice('orbit_sso='.length).split('.')[0].replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0))));

test('конфигурация источников: демонстрация по умолчанию, недостающие настройки названы, ключи наружу не уходят', () => {
  const fallback = readSources({});
  assert.equal(fallback.identity.mode, 'demo');
  assert.equal(fallback.grades.mode, 'demo');
  assert.equal(fallback.schedule.mode, 'official');
  assert.ok(fallback.identity.ready && fallback.grades.ready && fallback.schedule.ready);

  const half = readSources({ORBIT_IDENTITY: 'oidc', ORBIT_GRADES: 'university'});
  assert.equal(half.identity.ready, false);
  for (const name of ['OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'ORBIT_AUTH_SECRET']) assert.match(half.identity.problem, new RegExp(name));
  assert.equal(half.grades.ready, false);
  assert.match(half.grades.problem, /UNIVERSITY_GRADES_URL/);

  // Неизвестный режим не ломает портал и не выдаёт себя за подключение к вузу.
  assert.equal(readSources({ORBIT_IDENTITY: 'рэу'}).identity.mode, 'demo');
  assert.equal(readSources({ORBIT_GRADES: 'рэу'}).grades.mode, 'demo');
  // Адрес ведомости обязан быть http(s) без логина и пароля в ссылке.
  assert.equal(readSources({ORBIT_GRADES: 'university', UNIVERSITY_GRADES_URL: 'ftp://rea.test/x', UNIVERSITY_GRADES_TOKEN: 'a'}).grades.ready, false);

  const clientKey = secretValue('client'), signing = secretValue('signing'), service = secretValue('service');
  const open = describeSources(readSources({
    ORBIT_IDENTITY: 'oidc', OIDC_ISSUER: 'https://sso.rea.test', OIDC_CLIENT_ID: 'orbita',
    OIDC_CLIENT_SECRET: clientKey, ORBIT_AUTH_SECRET: signing,
    ORBIT_GRADES: 'university', UNIVERSITY_GRADES_URL: 'https://api.rea.test/grades', UNIVERSITY_GRADES_TOKEN: service
  }));
  assert.equal(open.identity.ready, true);
  assert.equal(open.grades.ready, true);
  const published = JSON.stringify(open);
  for (const value of [clientKey, signing, service]) assert.equal(published.includes(value), false);
});

test('открытое расписание: группа из справочника, живые занятия, чужая группа и лимит запросов', async t => {
  const db = await database();
  const call = caller(db, {});
  const original = globalThis.fetch;
  let downloads = 0;
  globalThis.fetch = async request => {
    const url = new URL(request instanceof Request ? request.url : request);
    if (url.pathname === '/Schedule/ExportCalendar') {
      downloads++;
      return new Response(JSON.stringify({fileId: '11111111-2222-3333-4444-555555555555'}),
        {headers: {'Set-Cookie': 'ASP.NET_SessionId=abc123; path=/'}});
    }
    if (url.pathname === '/Schedule/GetFile') {
      return new Response(['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'DTSTART:20261116T083000', 'DTEND:20261116T100500',
        'SUMMARY:' + GROUP + ' - Иностранный язык (второй)', 'LOCATION:3 корпус - 212',
        'DESCRIPTION:Преподаватель\\n3 корпус, Практическое занятие', 'STATUS:CONFIRMED',
        'END:VEVENT', 'END:VCALENDAR'].join('\r\n'));
    }
    throw new Error('Неожиданный запрос: ' + url.href);
  };
  t.after(() => { globalThis.fetch = original; db.sqlite.close(); });

  const week = await call('/public/schedule?group=' + encodeURIComponent(GROUP) + '&date=2026-11-16&view=week');
  assert.equal(week.status, 200);
  assert.equal(week.data.group, GROUP);
  assert.equal(week.data.covered, true);
  assert.equal(week.data.source, 'official');
  assert.equal(week.data.lessons.length, 1);
  assert.deepEqual(
    {start: week.data.lessons[0].start, kind: week.data.lessons[0].kind, room: week.data.lessons[0].room},
    {start: '08:30', kind: 'Практическое занятие', room: '3 корпус - 212'});
  assert.match(week.data.sourceUrl, /^https:\/\/rasp\.rea\.ru\//);
  assert.equal(week.data.sources.schedule.mode, 'official');
  assert.equal(downloads, 1, 'повторные открытия недели берутся из кеша источника');

  // Вход на открытую страницу не нужен, а личные разделы по-прежнему закрыты.
  assert.equal((await call('/sources')).status, 200);
  assert.equal((await call('/overview')).status, 401);
  // Произвольная строка вместо номера группы к университету не уходит.
  for (const bad of ['', 'ГРУППА-КОТОРОЙ-НЕТ', '<script>', 'x'.repeat(200)]) {
    assert.equal((await call('/public/schedule?group=' + encodeURIComponent(bad) + '&date=2026-11-16')).status, 422);
  }
  assert.equal((await call('/public/schedule?group=' + encodeURIComponent(GROUP) + '&date=2027-11-16')).status, 422);
  assert.equal((await call('/public/schedule?group=' + encodeURIComponent(GROUP) + '&date=2026-02-30')).status, 422);

  const used = db.sqlite.prepare("SELECT count FROM login_limits WHERE key LIKE 'timetable:%'").get().count;
  for (let attempt = 0; attempt < 30 - used; attempt++) {
    assert.equal((await call('/public/schedule?group=' + encodeURIComponent(GROUP) + '&date=2026-11-17')).status, 200);
  }
  const blocked = await call('/public/schedule?group=' + encodeURIComponent(GROUP) + '&date=2026-11-18');
  assert.equal(blocked.status, 429);
  assert.match(blocked.data.error, /Повторите через минуту/);
});

test('учебный перенос связан с личным уведомлением и отсутствует в открытом расписании', async t => {
  const db = await database();
  const call = caller(db, {});
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; db.sqlite.close(); });
  const login = await call('/login', {method:'POST', body:demoAccount});
  assert.equal(login.status, 200);
  const cookie = cookieOf(login.cookies, 'orbit_session');
  const group = login.data.student.group;
  const date = '2026-11-23';
  const schedule = '/schedule?date=' + date;
  const notice = (await call('/notifications', {cookie})).data.notifications.find(item => item.id === 'alina-notice-room-change');
  const snapshot = (await call(schedule, {cookie})).data.lessons.find(item => item.status === 'Перенесено');
  assert.equal(snapshot.oldRoom, '3 корпус - 525');
  assert.match(snapshot.room, /527/);
  assert.equal(notice.href, schedule + '#lesson-' + snapshot.id);
  assert.match(snapshot.note, /Учебный пример/);

  globalThis.fetch = async request => {
    const url = new URL(request instanceof Request ? request.url : request);
    if (url.pathname === '/Schedule/ExportCalendar') {
      return new Response(JSON.stringify({fileId: '55555555-4444-3333-2222-111111111111'}));
    }
    assert.equal(url.pathname, '/Schedule/GetFile');
    return new Response([
      'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'DTSTART:20261123T140000', 'DTEND:20261123T153000',
      'SUMMARY:' + group + ' - Философия', 'LOCATION:' + snapshot.room,
      'STATUS:CONFIRMED', 'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n'));
  };

  const live = (await call(schedule + '&live=1', {cookie})).data.lessons[0];
  assert.equal(live.id, snapshot.id);
  assert.equal(live.status, snapshot.status);
  assert.equal(live.teacher, snapshot.teacher);
  assert.equal(live.oldRoom, snapshot.oldRoom);
  const open = (await call('/public/schedule?date=' + date + '&group=' + encodeURIComponent(group))).data.lessons[0];
  assert.equal(open.status, 'Обычное');
  assert.equal(open.oldRoom, undefined);
  const mark = await call('/login', {method:'POST', body:testCredentials('mark')});
  const markNotices = (await call('/notifications',{cookie:cookieOf(mark.cookies,'orbit_session')})).data.notifications;
  assert.ok(markNotices.some(item => item.id === 'mark-notice-room-change'));
  assert.ok(!markNotices.some(item => item.id === notice.id));
});

test('единый вход РЭУ: перелёт с PKCE, проверка подписи, профиль студента и отказ подделкам', async t => {
  const issuer = 'https://sso.rea.test';
  const clientId = 'orbita-portal';
  const env = {
    ORBIT_IDENTITY: 'oidc', OIDC_ISSUER: issuer, OIDC_CLIENT_ID: clientId,
    OIDC_CLIENT_SECRET: secretValue('client'), ORBIT_AUTH_SECRET: secretValue('signing'),
    OIDC_SCOPES: 'openid profile', OIDC_GROUP_CLAIM: 'group'
  };
  const db = await database();
  const call = caller(db, env);
  const algorithm = {name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'};
  const keys = await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify']);
  const jwk = {...await crypto.subtle.exportKey('jwk', keys.publicKey), kid: 'rea-1', alg: 'RS256', use: 'sig'};
  const base64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const part = value => base64url(new TextEncoder().encode(JSON.stringify(value)));
  const sign = async (payload, key = keys.privateKey) => {
    const body = part({alg: 'RS256', kid: 'rea-1'}) + '.' + part(payload);
    return body + '.' + base64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(body)));
  };

  let issued = null, exchanges = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async (request, options = {}) => {
    const url = new URL(request instanceof Request ? request.url : request);
    if (url.pathname === '/.well-known/openid-configuration') {
      return Response.json({issuer, authorization_endpoint: issuer + '/authorize', token_endpoint: issuer + '/token', jwks_uri: issuer + '/jwks'});
    }
    if (url.pathname === '/jwks') return Response.json({keys: [jwk]});
    if (url.pathname === '/token') {
      exchanges++;
      const form = new URLSearchParams(options.body);
      assert.equal(form.get('grant_type'), 'authorization_code');
      assert.equal(form.get('client_id'), clientId);
      assert.equal(form.get('client_secret'), env.OIDC_CLIENT_SECRET);
      assert.equal(form.get('redirect_uri'), 'https://orbit.test/api/auth/oidc/callback');
      // Проверка PKCE на стороне «университета»: code_verifier обязан дать тот
      // же вызов S256, который ушёл в адрес авторизации.
      const check = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(form.get('code_verifier'))));
      assert.equal(check, issued.challenge);
      return Response.json({token_type: 'Bearer', id_token: issued.token});
    }
    throw new Error('Неожиданный запрос: ' + url.href);
  };
  t.after(() => { globalThis.fetch = original; db.sqlite.close(); });

  const start = await call('/auth/oidc/start?next=' + encodeURIComponent('/grades'));
  assert.equal(start.status, 303);
  const authorize = new URL(start.headers.get('location'));
  assert.equal(authorize.origin + authorize.pathname, issuer + '/authorize');
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(authorize.searchParams.get('client_id'), clientId);
  assert.equal(authorize.searchParams.get('redirect_uri'), 'https://orbit.test/api/auth/oidc/callback');
  const flight = cookieOf(start.cookies, 'orbit_sso');
  assert.ok(flight, 'состояние перелёта ставится отдельной cookie');
  const state = openState(flight);
  assert.equal(state.destination, '/grades');
  assert.equal(authorize.searchParams.get('state'), state.state);
  assert.equal(authorize.searchParams.get('nonce'), state.nonce);

  const seconds = Math.floor(NOW.getTime() / 1000);
  const claims = {
    iss: issuer, aud: clientId, sub: 'reu-student-4821', exp: seconds + 600, iat: seconds, nonce: state.nonce,
    preferred_username: 'Ivanov.II', given_name: 'Иван', family_name: 'Иванов', middle_name: 'Ильич',
    group: GROUP, institute: 'Институт цифровой экономики', program: 'Таможенное дело', course: 2, semester: 3
  };
  issued = {challenge: authorize.searchParams.get('code_challenge'), token: await sign(claims)};

  // Чужое состояние и подпись чужим ключом не проходят.
  assert.equal((await call('/auth/oidc/callback?code=abc&state=' + state.state)).status, 401);
  assert.equal((await call('/auth/oidc/callback?code=abc&state=подделка', {cookie: flight})).status, 401);
  const stranger = await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify']);
  issued.token = await sign(claims, stranger.privateKey);
  const forged = await call('/auth/oidc/callback?code=abc&state=' + state.state, {cookie: flight});
  assert.equal(forged.status, 401);
  assert.match(forged.data.error, /одпись/);
  // Удостоверение, выписанное другому приложению, тоже отклоняется.
  issued.token = await sign({...claims, aud: 'другое-приложение'});
  assert.equal((await call('/auth/oidc/callback?code=abc&state=' + state.state, {cookie: flight})).status, 401);

  issued.token = await sign(claims);
  const done = await call('/auth/oidc/callback?code=abc&state=' + state.state, {cookie: flight});
  assert.equal(done.status, 303);
  assert.equal(done.headers.get('location'), '/grades');
  assert.equal(exchanges > 0, true);
  const session = cookieOf(done.cookies, 'orbit_session');
  assert.ok(session && session !== 'orbit_session=');
  assert.ok(done.cookies.some(line => line.startsWith('orbit_sso=;')), 'состояние перелёта гасится');

  const profile = await call('/session', {cookie: session});
  assert.equal(profile.status, 200);
  assert.deepEqual({
    lastName: profile.data.student.lastName, firstName: profile.data.student.firstName,
    group: profile.data.student.group, course: profile.data.student.course, login: profile.data.student.login
  }, {lastName: 'Иванов', firstName: 'Иван', group: GROUP, course: 2, login: 'ivanov.ii'});
  assert.match(profile.data.student.id, /^sso-[0-9a-f]{20}$/);
  // Вход по паролю в режиме единого входа выключен, а не ослаблен.
  assert.equal((await call('/login', {method: 'POST', body: demoAccount})).status, 409);
  assert.equal((await call('/sources')).data.sources.identity.mode, 'oidc');

  // Повторный вход того же студента обновляет его запись, а не создаёт вторую.
  const again = await call('/auth/oidc/start');
  const flightAgain = cookieOf(again.cookies, 'orbit_sso');
  const stateAgain = openState(flightAgain);
  issued = {challenge: new URL(again.headers.get('location')).searchParams.get('code_challenge'),
    token: await sign({...claims, nonce: stateAgain.nonce, course: 3})};
  const repeat = await call('/auth/oidc/callback?code=abc&state=' + stateAgain.state, {cookie: flightAgain});
  assert.equal(repeat.status, 303);
  assert.equal(db.sqlite.prepare("SELECT count(*) AS n FROM students WHERE id LIKE 'sso-%'").get().n, 1);
  assert.equal((await call('/session', {cookie: cookieOf(repeat.cookies, 'orbit_session')})).data.student.course, 3);
});

test('ведомость РЭУ: баллы из университета, строгая проверка формата и честная ошибка', async t => {
  const env = {ORBIT_GRADES: 'university', UNIVERSITY_GRADES_URL: 'https://api.rea.test/grades', UNIVERSITY_GRADES_TOKEN: secretValue('service')};
  const db = await database();
  const call = caller(db, env);
  let answer = {grades: [{
    id: 'reu-1', subject: 'Экономическая теория', credits: 4, result: '5', status: 'Зачтено',
    updatedAt: '2026-11-10', nextDate: '2026-12-18', nextKind: 'Экзамен',
    rating: {participation: 18, control: 19, creative: 16, assessment: 38}
  }, {id: 'reu-2', subject: 'Статистика', credits: 3, status: 'Ожидает'}]};
  const original = globalThis.fetch;
  let authorized = '';
  globalThis.fetch = async (request, options = {}) => {
    const url = new URL(request instanceof Request ? request.url : request);
    assert.equal(url.origin + url.pathname, env.UNIVERSITY_GRADES_URL);
    assert.equal(url.searchParams.get('login'), demoAccount.login);
    authorized = (options.headers || {}).Authorization || '';
    if (answer === 'отказ') return new Response('no', {status: 503});
    return Response.json(answer);
  };
  t.after(() => { globalThis.fetch = original; db.sqlite.close(); });

  const entry = await call('/login', {method: 'POST', body: demoAccount});
  assert.equal(entry.status, 200);
  const cookie = cookieOf(entry.cookies, 'orbit_session');

  const sheet = await call('/grades', {cookie});
  assert.equal(sheet.status, 200);
  assert.equal(sheet.data.grades.length, 2);
  assert.equal(sheet.data.grades[0].subject, 'Экономическая теория');
  assert.equal(sheet.data.grades[0].rating.total, 91);
  assert.equal(sheet.data.grades[1].rating, null);
  assert.equal(sheet.data.sources.grades.mode, 'university');
  assert.equal(authorized, 'Bearer ' + env.UNIVERSITY_GRADES_TOKEN);
  assert.equal(sheet.text.includes(env.UNIVERSITY_GRADES_TOKEN), false, 'служебный ключ не уходит в браузер');

  // Балл вне шкалы Положения РЭУ — ошибка, а не тихая подстановка демо-данных.
  answer = {grades: [{subject: 'Статистика', rating: {participation: 99, control: 1, creative: 1, assessment: 1}}]};
  assert.equal((await call('/grades', {cookie})).status, 503);
  answer = {items: []};
  const broken = await call('/grades', {cookie});
  assert.equal(broken.status, 503);
  assert.match(broken.data.error, /формат/);
  answer = 'отказ';
  assert.match((await call('/grades', {cookie})).data.error, /РЭУ/);
});

test('список профилей доступен без паролей и соответствует базе', () => {
  const seed = JSON.parse(readFileSync('db/demo-data.json', 'utf8'));
  assert.deepEqual(demoAccounts.map(account => account.login).sort(), seed.students.map(student => student.login).sort());
  for (const account of demoAccounts) {
    assert.ok(account.name && account.field && account.initials);
    assert.equal(Object.hasOwn(account, 'password'), false);
    const student = seed.students.find(row => row.login === account.login);
    const stored = seed.credentials.find(row => row.student_id === student.id);
    assert.match(stored?.password_hash ?? '', /^pbkdf2\$\d+\$[\da-f]+\$[\da-f]{64}$/);
  }
});
