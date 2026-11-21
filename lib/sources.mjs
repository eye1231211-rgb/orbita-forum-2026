/* Источники данных «Орбиты».
   Расписание уже живое: его отдаёт публичный экспорт rasp.rea.ru.
   Вход и баллы устроены как адаптеры с двумя режимами. По умолчанию работает
   демонстрационный режим (учебные записи в базе «Орбиты»), а когда университет
   выдаст доступ, те же маршруты переключаются на единый вход РЭУ (OpenID
   Connect) и на служебный API ведомости. Режим задают переменные окружения —
   код приложения при подключении не меняется.
   Контракт для ИТ-службы РЭУ описан в docs/ПОДКЛЮЧЕНИЕ-РЭУ.md. */

const text = (env, name, fallback = '') => {
  const value = env?.[name];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
};

export const IDENTITY_MODES = ['demo', 'oidc'];
export const GRADES_MODES = ['demo', 'university'];

// Служебный адрес университета: только http(s), без логина, пароля и фрагмента.
function serviceUrl(value) {
  if (!value) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) return null;
  return url;
}

function demoIdentity(problem = '') {
  return {
    mode: 'demo', ready: true, problem,
    label: 'Демонстрационные учётные записи',
    detail: 'Логины Алины и Марка хранятся в базе «Орбиты». Пароли студентов РЭУ здесь не используются.'
  };
}

function identitySource(env) {
  const mode = text(env, 'ORBIT_IDENTITY', 'demo').toLowerCase();
  if (!IDENTITY_MODES.includes(mode)) {
    return demoIdentity('Неизвестное значение ORBIT_IDENTITY: вход остался демонстрационным.');
  }
  if (mode === 'demo') return demoIdentity();
  const issuer = serviceUrl(text(env, 'OIDC_ISSUER'));
  const clientId = text(env, 'OIDC_CLIENT_ID');
  const clientSecret = text(env, 'OIDC_CLIENT_SECRET');
  const signing = text(env, 'ORBIT_AUTH_SECRET');
  const missing = [
    !issuer && 'OIDC_ISSUER', !clientId && 'OIDC_CLIENT_ID',
    !clientSecret && 'OIDC_CLIENT_SECRET', signing.length < 32 && 'ORBIT_AUTH_SECRET (не короче 32 символов)'
  ].filter(Boolean);
  return {
    mode: 'oidc', ready: !missing.length,
    problem: missing.length ? 'Единый вход РЭУ не настроен: ' + missing.join(', ') + '.' : '',
    label: 'Единый вход РЭУ',
    detail: 'Студент входит учётной записью университета; «Орбита» не видит и не хранит его пароль.',
    issuer: issuer ? issuer.href.replace(/\/$/, '') : '',
    clientId, clientSecret, signing,
    scopes: text(env, 'OIDC_SCOPES', 'openid profile'),
    claims: {
      login: text(env, 'OIDC_LOGIN_CLAIM', 'preferred_username'),
      group: text(env, 'OIDC_GROUP_CLAIM', 'group'),
      institute: text(env, 'OIDC_INSTITUTE_CLAIM', 'institute'),
      program: text(env, 'OIDC_PROGRAM_CLAIM', 'program'),
      course: text(env, 'OIDC_COURSE_CLAIM', 'course'),
      semester: text(env, 'OIDC_SEMESTER_CLAIM', 'semester')
    }
  };
}

function gradesSource(env) {
  const mode = text(env, 'ORBIT_GRADES', 'demo').toLowerCase();
  const demo = problem => ({
    mode: 'demo', ready: true, problem,
    label: 'Демонстрационные баллы',
    detail: 'Рейтинг рассчитан по Положению РЭУ о рейтинговой системе на учебных данных. Настоящие баллы появятся после подключения ведомости университета.'
  });
  if (!GRADES_MODES.includes(mode)) return demo('Неизвестное значение ORBIT_GRADES: баллы остались демонстрационными.');
  if (mode === 'demo') return demo('');
  const url = serviceUrl(text(env, 'UNIVERSITY_GRADES_URL'));
  const token = text(env, 'UNIVERSITY_GRADES_TOKEN');
  const missing = [!url && 'UNIVERSITY_GRADES_URL', !token && 'UNIVERSITY_GRADES_TOKEN'].filter(Boolean);
  return {
    mode: 'university', ready: !missing.length,
    problem: missing.length ? 'Ведомость РЭУ не настроена: ' + missing.join(', ') + '.' : '',
    label: 'Ведомость РЭУ',
    detail: 'Баллы приходят из учебной системы университета по служебному доступу.',
    url: url ? url.href : '', token
  };
}

export function readSources(env = {}) {
  return {
    identity: identitySource(env),
    grades: gradesSource(env),
    schedule: {
      mode: 'official', ready: true, problem: '',
      label: 'Расписание РЭУ',
      detail: 'Публичный экспорт rasp.rea.ru: неделя запрашивается у университета при открытии.'
    }
  };
}

// Публичная часть: интерфейс показывает её на экране входа и в разделах данных.
export function describeSources(sources) {
  const open = ({mode, label, detail, ready, problem}) => ({mode, label, detail, ready, problem: problem || ''});
  return {identity: open(sources.identity), grades: open(sources.grades), schedule: open(sources.schedule)};
}

const digits = value => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 12 ? Math.trunc(number) : 0;
};
const line = (value, limit = 200) => (typeof value === 'string' ? value.trim().slice(0, limit) : '');

/* Профиль студента из утверждений единого входа. Идентификатор выводится из
   sub, поэтому повторный вход того же студента находит свою же запись, а новых
   таблиц для этого не требуется. */
export async function studentFromClaims(source, claims) {
  const subject = line(claims?.sub, 200);
  if (!subject) throw new Error('Университет не передал идентификатор студента.');
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('orbit-sso\u0000' + source.issuer + '\u0000' + subject));
  const fingerprint = Array.from(new Uint8Array(bytes).slice(0, 10), byte => byte.toString(16).padStart(2, '0')).join('');
  const map = source.claims;
  const full = line(claims.name).split(/\s+/);
  return {
    id: 'sso-' + fingerprint,
    login: (line(claims[map.login], 80) || 'sso-' + fingerprint.slice(0, 10)).toLowerCase(),
    firstName: line(claims.given_name, 80) || full[1] || '',
    lastName: line(claims.family_name, 80) || full[0] || '',
    middleName: line(claims.middle_name, 80) || full[2] || '',
    institute: line(claims[map.institute], 200),
    program: line(claims[map.program], 200),
    course: digits(claims[map.course]),
    group: line(claims[map.group], 100),
    semester: digits(claims[map.semester])
  };
}

/* Ведомость университета. Контракт ответа задан «Орбитой» и описан в
   спецификации для ИТ РЭУ: {"grades":[{...}]}. Любое отклонение — ошибка,
   молчаливой подмены демонстрационными баллами здесь нет. */
export async function fetchUniversityGrades(source, student, fetchImpl = fetch) {
  if (!source.ready) throw new Error(source.problem);
  const url = new URL(source.url);
  url.searchParams.set('login', student.login);
  const response = await fetchImpl(url, {
    headers: {Authorization: 'Bearer ' + source.token, Accept: 'application/json'},
    // 'manual' вместо 'error': в Cloudflare Workers второго варианта нет,
    // а ответ 3xx всё равно не ok и дальше не проходит.
    redirect: 'manual', signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error('Ведомость РЭУ не ответила (HTTP ' + response.status + ').');
  const payload = await response.json();
  const rows = payload?.grades;
  if (!Array.isArray(rows)) throw new Error('Ведомость РЭУ вернула неизвестный формат.');
  return rows.slice(0, 200).map((row, index) => {
    const subject = line(row?.subject, 200);
    if (!subject) throw new Error('В ведомости РЭУ нет названия дисциплины.');
    return {
      id: line(row?.id, 80) || 'reu-grade-' + index,
      subject, credits: digits(row?.credits),
      result: line(row?.result, 40) || null,
      status: line(row?.status, 80) || 'Нет данных',
      updatedAt: line(row?.updatedAt, 40) || null,
      nextDate: /^\d{4}-\d\d-\d\d$/.test(row?.nextDate || '') ? row.nextDate : null,
      nextKind: line(row?.nextKind, 80) || null,
      rating: universityRating(row?.rating)
    };
  });
}

function universityRating(rating) {
  if (!rating || typeof rating !== 'object') return null;
  const parts = ['participation', 'control', 'creative', 'assessment'].map(key => {
    const value = Number(rating[key]);
    if (!Number.isFinite(value) || value < 0 || value > (key === 'assessment' ? 40 : 20)) {
      throw new Error('Ведомость РЭУ вернула балл вне шкалы.');
    }
    return Math.round(value);
  });
  const [participation, control, creative, assessment] = parts;
  return {participation, control, creative, assessment, total: parts.reduce((sum, value) => sum + value, 0)};
}
