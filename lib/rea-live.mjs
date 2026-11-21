// Anonymous export used by the public timetable at rasp.rea.ru.
const origin = 'https://rasp.rea.ru';
const dateOnly = value => value.toISOString().slice(0, 10);
const dayMs = 86_400_000;
const cache = new Map();
const pending = new Map();
const freshFor = 15 * 60_000;

export function officialGroupUrl(group) {
  return origin + '/?q=' + encodeURIComponent(group.toLocaleLowerCase('ru'));
}

export function academicWeek(monday) {
  const date = new Date(monday + 'T00:00:00Z');
  if (!/^\d{4}-\d\d-\d\d$/.test(monday) || !Number.isFinite(+date) ||
      dateOnly(date) !== monday || date.getUTCDay() !== 1) {
    throw new Error('Начало недели должно быть понедельником.');
  }
  // The week containing 1 September is number 1, even when it begins in August.
  let start = Date.UTC(date.getUTCFullYear(), 8, 1);
  const weekStart = day => day - ((new Date(day).getUTCDay() + 6) % 7) * dayMs;
  if (weekStart(start) > +date) start = Date.UTC(date.getUTCFullYear() - 1, 8, 1);
  return 1 + Math.floor((+date - weekStart(start)) / (7 * dayMs));
}

export async function fetchTimetablePage(path, query, options = {}) {
  if (!['ScheduleCard', 'ExportCalendar', 'GetFile', 'GetDetails'].includes(path)) {
    throw new Error('Неизвестный адрес расписания.');
  }
  const url = new URL('/Schedule/' + path, origin);
  url.search = new URLSearchParams(query).toString();
  const headers = {
    'User-Agent': 'Orbita/1.0 (public university timetable)',
    'X-Requested-With': 'XMLHttpRequest',
    Referer: origin + '/',
    Accept: '*/*'
  };
  if (options.session) headers.Cookie = options.session;
  const response = await fetch(url, {
    // Cloudflare Workers не поддерживают redirect: 'error'. 'manual' держит ту же
    // границу: ответ 3xx не ok и дальше не идёт, переход на чужой адрес исключён.
    headers, redirect: 'manual', signal: options.signal || AbortSignal.timeout(12_000)
  });
  if (!response.ok || !response.body) {
    const error = new Error('Расписание РЭУ временно недоступно (HTTP ' + response.status + ').');
    const retry = response.headers.get('Retry-After');
    error.retryAfterMs = /^\d+$/.test(retry || '') ? Number(retry) * 1000 : Math.max(0, Date.parse(retry) - Date.now()) || 0;
    throw error;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '', size = 0;
  while (true) {
    const {value, done} = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1_000_000) {
      await reader.cancel();
      throw new Error('Ответ расписания превышает допустимый размер.');
    }
    text += decoder.decode(value, {stream: true});
  }
  return {text: text + decoder.decode(), headers: response.headers};
}

function calendarText(text) {
  return text.replace(/\\([nN,;\\])/g, (_, value) => value.toLowerCase() === 'n' ? '\n' : value);
}

function timestamp(value) {
  const match = /^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)$/.exec(value);
  if (!match) throw new Error('Изменился формат времени расписания.');
  return {date: match[1] + '-' + match[2] + '-' + match[3], time: match[4] + ':' + match[5]};
}

async function lessonId(group, lesson, occurrence) {
  // REU gives each ICS export new UUIDs. A repeat export should retain Orbit links.
  const identity = [group, lesson.date, lesson.start, lesson.end, lesson.subject, lesson.subgroup, lesson.room, lesson.kind, occurrence];
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(identity)));
  return 'reu-' + Array.from(new Uint8Array(bytes).slice(0, 12), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function calendarLessons(calendar, group, from, to) {
  const unfolded = calendar.replace(/\r?\n[ \t]/g, '').trim();
  if (!unfolded.startsWith('BEGIN:VCALENDAR') || !unfolded.endsWith('END:VCALENDAR')) {
    throw new Error('Университет не вернул файл календаря.');
  }
  const lessons = [];
  const duplicates = new Map();
  for (const event of unfolded.matchAll(/BEGIN:VEVENT\r?\n([\s\S]*?)\r?\nEND:VEVENT/g)) {
    const fields = {};
    for (const line of event[1].split(/\r?\n/)) {
      const colon = line.indexOf(':');
      if (colon < 1) continue;
      const key = line.slice(0, colon);
      fields[key] = calendarText(line.slice(colon + 1));
    }
    const start = timestamp(fields.DTSTART), end = timestamp(fields.DTEND);
    if (start.date < from || start.date > to || start.date !== end.date || start.time >= end.time) {
      throw new Error('Даты в календаре РЭУ не совпали с выбранной неделей.');
    }
    const summary = (fields.SUMMARY || '').match(/^(.+?)\s+-\s+(.+)$/u);
    const prefix = summary?.[1].match(/^(.+?)(?:\s*\(подгр\.\s*(.+?)\))?$/iu);
    if (!prefix || prefix[1].trim().toLocaleLowerCase('ru') !== group.toLocaleLowerCase('ru')) {
      throw new Error('Не удалось подтвердить группу в файле расписания.');
    }
    const description = (fields.DESCRIPTION || '').split('\n');
    const category = description.at(-1) || '';
    const separator = category.indexOf(', ');
    const subgroup = prefix[2] || '';
    const lesson = {
      date: start.date, start: start.time, end: end.time, subject: summary[2].trim(),
      room: fields.LOCATION || '', teacher: '', kind: separator >= 0 ? category.slice(separator + 2) : '',
      status: fields.STATUS === 'CANCELLED' ? 'Отменено' : 'Обычное',
      subgroup, note: subgroup ? 'Подгруппа ' + subgroup : ''
    };
    const key = JSON.stringify(lesson);
    const occurrence = duplicates.get(key) || 0;
    duplicates.set(key, occurrence + 1);
    lessons.push({...lesson, id: await lessonId(group, lesson, occurrence)});
  }
  return lessons.sort((a,b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) ||
    a.subgroup.localeCompare(b.subgroup, 'ru', {numeric:true}) || a.subject.localeCompare(b.subject, 'ru'));
}

async function exportedLessons(group, from, to, mode) {
  const week = academicWeek(from);
  const key = group.toLocaleLowerCase('ru');
  const signal = AbortSignal.timeout(12_000);
  const ticket = await fetchTimetablePage('ExportCalendar', {key, week, mode, mask:0}, {signal});
  const {fileId} = JSON.parse(ticket.text);
  if (!/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(fileId)) throw new Error('РЭУ не подготовил экспорт.');
  const cookies = ticket.headers.getSetCookie?.() || [ticket.headers.get('Set-Cookie') || ''];
  // Only pass the university's own short-lived anonymous file session to the same origin.
  const session = cookies.join('; ').match(/(?:^|[,;]\s*)(ASP\.NET_SessionId=[a-z\d]+)/i)?.[1];
  const file = await fetchTimetablePage('GetFile', {id:fileId}, {session, signal});
  return calendarLessons(file.text, group, from, to);
}

// Bulk importer groups weeks into one official calendar export to conserve the source's quota.
export async function readOfficialMonth(group, from) {
  const latest = dateOnly(new Date(Date.parse(from + 'T00:00:00Z') + 42 * dayMs));
  return exportedLessons(group, from, latest, 'month');
}

async function downloadWeek(group, from) {
  const week = academicWeek(from);
  const to = dateOnly(new Date(Date.parse(from + 'T00:00:00Z') + 6 * dayMs));
  const lessons = await exportedLessons(group, from, to, 'week');
  if (!lessons.length) {
    const key = group.toLocaleLowerCase('ru');
    const header = await fetchTimetablePage('ScheduleCard', {selection:key, weekNum:week, catfilter:0});
    const displayDate = from.split('-').reverse().join('.');
    if (!header.text.includes('value="' + key + '"') || !header.text.includes(displayDate) ||
        /class=['"]task['"]/.test(header.text)) {
      throw new Error('Пустую неделю не удалось подтвердить в расписании РЭУ.');
    }
  }
  return {group, sourceUrl:officialGroupUrl(group), from, to, capturedAt:new Date().toISOString(), lessons};
}

// Callers restrict group to the public catalogue and date to their browsing window.
export async function readOfficialWeek(group, monday) {
  if (typeof group !== 'string' || !group.trim() || group.length > 100) throw new Error('Неверный номер группы.');
  academicWeek(monday);
  const key = group + '\u0000' + monday;
  const saved = cache.get(key);
  if (saved && Date.now() - saved.time < freshFor) return saved.result;
  if (pending.has(key)) return pending.get(key);
  if (pending.size >= 4) throw new Error('Сервис расписания занят. Попробуйте ещё раз.');
  const request = downloadWeek(group, monday).then(result => {
    cache.delete(key);
    if (cache.size >= 64) cache.delete(cache.keys().next().value);
    cache.set(key, {time:Date.now(), result});
    return result;
  }).finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}
