import {personalTasks,changeTask,issuedHomework} from './student-tasks.mjs';
import {seedDatabase} from './seed.mjs';
import {digest,verifyPassword,cookieToken,sessionCookie} from './security.mjs';
import {createCalendar} from './calendar.mjs';
import {requestTypes} from './reu-services.mjs';
import {demoRating} from './demo-ratings.mjs';

import timetable from '../public/reu-timetable.json' with {type:'json'};
import catalogue from '../public/reu-groups.json' with {type:'json'};
import {readOfficialWeek} from './rea-live.mjs';
import {readSources,describeSources,studentFromClaims,fetchUniversityGrades} from './sources.mjs';
import {startLogin,completeLogin,stateCookie,readStateCookie} from './oidc.mjs';

// Справочник групп РЭУ: по нему проверяется любой номер группы, который
// приходит из браузера, прежде чем «Орбита» обратится к расписанию университета.
const officialGroups=new Map(catalogue.sections.flatMap(section=>section.groups.map(code=>[code.toLocaleLowerCase('ru'),code])));
const officialGroup=value=>typeof value==='string'&&value.trim().length&&value.length<=100?officialGroups.get(value.trim().toLocaleLowerCase('ru'))||null:null;

function moscowClock(now) {
  const today = new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  return {today, now:now.toISOString(), timezone:'Europe/Moscow'};
}
export {requestTypes};
const studentSelect='SELECT id,login,first_name AS firstName,last_name AS lastName,middle_name AS middleName,institute,program,course,group_name AS "group",semester FROM students';
class ApiError extends Error { constructor(status,message,fields) {super(message);this.status=status;this.fields=fields;} }
const fail=(status,message,fields)=>{throw new ApiError(status,message,fields);};
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const all=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
const first=async(db,sql,...args)=>db.prepare(sql).bind(...args).first();

const demoGroupLeader = student => student.id === 'student-mark';
const groupFields = 'telegram_url AS telegramUrl, note';

async function readGroupProfile(db, student) {
  const saved = await first(db, `SELECT ${groupFields} FROM group_profiles WHERE group_name=?`, student.group);
  const canEdit = demoGroupLeader(student);
  return {telegramUrl: '', note: '', ...saved, canEdit};
}

async function saveGroupProfile(db, student, input) {
  const telegramUrl = typeof input.telegramUrl === 'string' ? input.telegramUrl.trim() : null;
  const note = typeof input.note === 'string' ? input.note.trim() : null;
  const fields = {};
  // Only direct Telegram chat/usernames and invitation links are supported.
  if (telegramUrl === null || (telegramUrl && !/^https:\/\/t\.me\/(?:[a-z][a-z0-9_]{3,31}|(?:\+|joinchat\/)[a-z0-9_-]{5,128})$/i.test(telegramUrl))) {
    fields.telegramUrl = 'Вставьте ссылку на чат вида https://t.me/имя или ссылку-приглашение.';
  }
  if (note === null || note.length > 400) fields.note = 'Введите не более 400 символов.';
  if (Object.keys(fields).length) fail(422, 'Проверьте данные группы.', fields);
  const saved = await first(db, `INSERT INTO group_profiles (group_name, telegram_url, note) VALUES (?,?,?)
    ON CONFLICT(group_name) DO UPDATE SET telegram_url=excluded.telegram_url, note=excluded.note RETURNING ${groupFields}`,
    student.group, telegramUrl, note);
  return {...saved, canEdit: true};
}

export async function getStudent(db,cookie) {
  const token=cookieToken(cookie);
  if(!/^[0-9a-f]{64}$/.test(token)) return null;
  return first(db,`${studentSelect} WHERE id=(SELECT student_id FROM sessions WHERE token_hash=? AND expires_at>?)`,await digest(token),new Date().toISOString());
}
async function body(request) {
  if(!request.headers.get('content-type')?.startsWith('application/json')) fail(415,'Отправьте данные в формате JSON.');
  if(Number(request.headers.get('content-length')||0)>16384) fail(413,'Слишком большой запрос.');
  const raw=await request.text();
  if(raw.length>16384) fail(413,'Слишком большой запрос.');
  let value;try{value=JSON.parse(raw);}catch{fail(400,'Не удалось прочитать форму. Повторите отправку.');}
  if(!value||typeof value!=='object'||Array.isArray(value)) fail(400,'Некорректная форма.');
  return value;
}
function checkOrigin(request) {
  const origin=request.headers.get('origin');
  if(origin!==new URL(request.url).origin || request.headers.get('sec-fetch-site')==='cross-site') fail(403,'Обновите страницу и повторите действие.');
}
async function readRequests(db,studentId,id,limit=20,offset=0) {
  const rows=await all(db,'SELECT id,type,message,status,created_at AS createdAt FROM requests WHERE student_id=?'+(id?' AND id=?':'')+' ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?',studentId,...(id?[id]:[]),id?1:limit,offset);
  if(!id||!rows.length)return rows.map(row=>({...row,history:[]}));
  const history=await all(db,'SELECT status,at,note FROM request_history WHERE student_id=? AND request_id=? ORDER BY at,id',studentId,id);
  return [{...rows[0],history}];
}
const practiceChanges = new Map([
  ['student-alina', {id:'reu-ff7b3b1d916673caaba2ae05', oldRoom:'3 корпус - 525'}],
  ['student-mark', {id:'reu-f1dc93e46ad572fde60f4e2c', oldRoom:'2 корпус - 129'}]
]);

function storedLessons(student) {
  const change = practiceChanges.get(student.id);
  return (timetable.groups[student.group]?.lessons || []).map(lesson => lesson.id === change?.id
    ? {...lesson, oldRoom:change.oldRoom, status:'Перенесено', note:'Учебный пример переноса аудитории. Официальное расписание РЭУ не менялось.'}
    : lesson);
}

function mergeLiveLessons(liveLessons, snapshot) {
  return liveLessons.map(lesson => {
    const candidates = snapshot.filter(stored => stored.date === lesson.date && stored.start === lesson.start &&
      stored.subject === lesson.subject && (stored.subgroup || '') === (lesson.subgroup || ''));
    const match = candidates.find(stored => stored.id === lesson.id) || (candidates.length === 1 ? candidates[0] : null);
    if (!match) return lesson;
    const result = {...lesson, id:match.id, teacher:lesson.teacher || match.teacher};
    if (match.oldRoom && result.room === match.room && result.status === 'Обычное') {
      return {...result, oldRoom:match.oldRoom, status:match.status, note:match.note};
    }
    return result;
  });
}

function schoolWeek(student, date, from, to, snapshot = storedLessons(student)) {
  const {group} = student;
  const selected = timetable.groups[group];
  const covered = Boolean(selected) && from >= timetable.from && to <= timetable.to;
  const lessons = snapshot.filter(lesson => lesson.date >= from && lesson.date <= to);
  return {group, date, lessons, covered, sourceUrl:selected?.sourceUrl || 'https://rasp.rea.ru/', capturedAt:timetable.capturedAt, from:timetable.from, to:timetable.to};
}
async function readGrades(db,studentId) {
  const grades = await all(db,'SELECT r.id,d.name AS subject,d.credits,r.result,r.status,r.updated_at AS updatedAt,r.next_date AS nextDate,r.next_kind AS nextKind FROM results r JOIN disciplines d ON d.id=r.discipline_id WHERE r.student_id=? ORDER BY d.id',studentId);
  return grades.map(grade => ({...grade, rating:demoRating(grade)}));
}
/* Баллы приходят из того источника, который включён в окружении: из учебной
   базы «Орбиты» или из ведомости университета. Подмены одного другим нет —
   если ведомость РЭУ недоступна, об этом говорится прямо. */
async function loadGrades(db,student,sources) {
  if(sources.grades.mode!=='university') return readGrades(db,student.id);
  try { return await fetchUniversityGrades(sources.grades,student); }
  catch(error) {
    const message=error instanceof Error?error.message:'';
    fail(503,/РЭУ/.test(message)?message:'Ведомость РЭУ сейчас недоступна. Повторите попытку позже.');
  }
}
// Одна и та же минутная корзина обслуживает вход и публичное расписание.
async function rateLimit(db,key,limit,at,message) {
  await db.prepare('DELETE FROM login_limits WHERE expires_at<?').bind(new Date(at).toISOString()).run();
  await db.prepare('INSERT INTO login_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').bind(key,new Date(at+60000).toISOString()).run();
  const used=await first(db,'SELECT count FROM login_limits WHERE key=?',key);
  if(used.count>limit) fail(429,message);
}
// Живая неделя группы прямо из публичного экспорта РЭУ.
async function officialWeek(group,weekStart,weekEnd,from,to) {
  try {
    const live=await readOfficialWeek(group,weekStart);
    return {group,lessons:live.lessons.filter(lesson=>lesson.date>=from&&lesson.date<=to),covered:true,
      sourceUrl:live.sourceUrl,capturedAt:live.capturedAt||new Date().toISOString(),from:weekStart,to:weekEnd,source:'official'};
  } catch(error) {
    // Причина нужна в логах сервера: студенту её знать незачем, а отладка
    // живого источника без неё превращается в гадание.
    console.error('orbit_live_schedule_failed',error?.name||'Error',error?.message||'');
    fail(503,'РЭУ сейчас не ответил. Повторите попытку через минуту.');
  }
}
async function readEvents(db,studentId) {
  return all(db,'SELECT e.id,e.title,e.date,e.time,e.note,d.name AS subject FROM events e LEFT JOIN disciplines d ON d.id=e.discipline_id WHERE e.student_id=? ORDER BY e.date,e.time',studentId);
}
async function readNotifications(db,studentId) {
  const rows=await all(db,'SELECT n.id,n.title,n.text,n.category,n.date,n.href,CASE WHEN r.notification_id IS NULL THEN 0 ELSE 1 END AS read FROM notifications n LEFT JOIN notification_reads r ON r.notification_id=n.id AND r.student_id=? WHERE n.student_id=? ORDER BY n.date DESC,n.id',studentId,studentId);
  return rows.map(x=>({...x,read:!!x.read}));
}
function scheduleRange(url, demo) {
  const date=url.searchParams.get('date')||demo.today,view=url.searchParams.get('view')||'day';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date||!['day','week'].includes(view))fail(422,'Выберите корректную дату и вид расписания.');
  const day=new Date(date+'T12:00:00Z');day.setUTCDate(day.getUTCDate()-((day.getUTCDay()+6)%7));const weekStart=day.toISOString().slice(0,10);day.setUTCDate(day.getUTCDate()+6);const weekEnd=day.toISOString().slice(0,10);
  return {date,view,weekStart,weekEnd,from:view==='day'?date:weekStart,to:view==='day'?date:weekEnd};
}
async function readPlan(db,student,demo,sources) {
  const [events,grades,marks]=await Promise.all([readEvents(db,student.id),loadGrades(db,student,sources),all(db,'SELECT key,done FROM plan_marks WHERE student_id=?',student.id)]);
  const done=new Map(marks.map(x=>[x.key,!!x.done]));const items=[];
  const firstLesson = storedLessons(student).find(x=>x.date>=demo.today);
  if(firstLesson) items.push({key:'lesson:'+firstLesson.id,title:'Посмотреть расписание группы',description:firstLesson.subject+' · '+firstLesson.start+' · '+firstLesson.room,date:firstLesson.date,href:'/schedule?date='+firstLesson.date+'#lesson-'+firstLesson.id,kind:'schedule'});
  const event=events.find(x=>x.date>=demo.today);
  if(event)items.push({key:`event:${event.id}`,title:`Подготовиться: ${event.title}`,description:event.note,date:event.date,href:'/grades',kind:'event'});
  const grade=grades.filter(x=>x.nextDate&&x.nextDate>=demo.today&&x.subject!==event?.subject).sort((a,b)=>a.nextDate.localeCompare(b.nextDate))[0];
  if(grade)items.push({key:`assessment:${grade.id}`,title:`Подготовиться: ${grade.nextKind||'контроль'}`,description:grade.subject,date:grade.nextDate,href:'/grades',kind:'assessment'});
  const result=items.map(x=>({...x,done:done.get(x.key)||false}));return {items:result,total:result.length,completed:result.filter(x=>x.done).length,personal:await personalTasks(db,student.id)};
}
export async function handleApi(request,db,now = new Date(),env = {}) {
  const demo = moscowClock(now);
  const sources = readSources(env);
  try {
    const url=new URL(request.url);const path=url.pathname.replace(/\/$/,'');const method=request.method;
    if(!['GET','POST'].includes(method)) fail(405,'Метод не поддерживается.');
    if(method==='POST') checkOrigin(request);
    await seedDatabase(db);
    const secure=url.protocol==='https:';
    const visitor=async prefix=>prefix+await digest(request.headers.get('cf-connecting-ip')||'local-preview');
    // Открытая часть портала: какие источники подключены и расписание любой
    // группы РЭУ без входа. Личных данных здесь нет.
    if(path==='/api/sources' && method==='GET') return json({sources:describeSources(sources),demo});
    if(path==='/api/public/schedule' && method==='GET') {
      const group=officialGroup(url.searchParams.get('group'));
      if(!group) fail(422,'Выберите группу из справочника РЭУ.');
      const {date,view,weekStart,weekEnd,from,to}=scheduleRange(url,demo);
      if(Math.abs(Date.parse(weekStart)-Date.parse(demo.today))/86400000>120) fail(422,'Откройте эту дату в расписании РЭУ.');
      await rateLimit(db,await visitor('timetable:'),30,Date.now(),'Слишком много запросов расписания. Повторите через минуту.');
      const week=await officialWeek(group,weekStart,weekEnd,from,to);
      return json({...week,date,view,weekStart,weekEnd,sources:describeSources(sources)});
    }
    if(path==='/api/auth/oidc/start' && method==='GET') {
      if(sources.identity.mode!=='oidc') fail(404,'Единый вход РЭУ не подключён.');
      if(!sources.identity.ready) fail(503,sources.identity.problem);
      const destination=url.searchParams.get('next');
      const start=await startLogin(sources.identity,{
        redirectUri:url.origin+'/api/auth/oidc/callback',now:now.getTime(),
        destination:destination&&destination.startsWith('/')&&!destination.startsWith('//')?destination:'/'
      });
      return new Response(null,{status:303,headers:{Location:start.url,'Cache-Control':'no-store','Set-Cookie':stateCookie(start.state,secure)}});
    }
    if(path==='/api/auth/oidc/callback' && method==='GET') {
      if(sources.identity.mode!=='oidc') fail(404,'Единый вход РЭУ не подключён.');
      await rateLimit(db,await visitor('sso:'),20,Date.now(),'Слишком много попыток входа. Повторите через минуту.');
      let session;
      try {
        session=await completeLogin(sources.identity,{
          query:url.searchParams,sealed:readStateCookie(request.headers.get('cookie')||''),
          redirectUri:url.origin+'/api/auth/oidc/callback',now:now.getTime()
        });
      } catch(error) {fail(401,error instanceof Error?error.message:'Не удалось завершить вход через РЭУ.');}
      const profile=await studentFromClaims(sources.identity,session.claims);
      const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,'0')).join('');
      const at=Date.now();
      await db.batch([
        db.prepare('INSERT INTO students (id,login,first_name,last_name,middle_name,institute,program,course,group_name,semester) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET login=excluded.login,first_name=excluded.first_name,last_name=excluded.last_name,middle_name=excluded.middle_name,institute=excluded.institute,program=excluded.program,course=excluded.course,group_name=excluded.group_name,semester=excluded.semester')
          .bind(profile.id,profile.login,profile.firstName,profile.lastName,profile.middleName,profile.institute,profile.program,profile.course,profile.group,profile.semester),
        db.prepare('DELETE FROM sessions WHERE expires_at<?').bind(new Date(at).toISOString()),
        db.prepare('INSERT INTO sessions (token_hash,student_id,expires_at) VALUES (?,?,?)').bind(await digest(token),profile.id,new Date(at+43200000).toISOString())
      ]);
      // Две cookie сразу: сессия студента ставится, перелётное состояние гасится.
      const headers=new Headers({Location:session.destination,'Cache-Control':'no-store'});
      headers.append('Set-Cookie',sessionCookie(token,secure));
      headers.append('Set-Cookie',stateCookie('',secure,true));
      return new Response(null,{status:303,headers});
    }
    if(path==='/api/login' && method==='POST') {
      if(sources.identity.mode!=='demo') fail(409,'Вход по паролю выключен: университет подключён через единый вход РЭУ.');
      const input=await body(request);const fields={};
      if(typeof input.login!=='string'||!input.login.trim()||input.login.length>80) fields.login='Укажите логин, не более 80 символов.';
      if(typeof input.password!=='string'||!input.password||input.password.length>256) fields.password='Укажите пароль, не более 256 символов.';
      if(Object.keys(fields).length) fail(422,'Проверьте поля.',fields);
      const login=input.login.trim().toLowerCase();
      const now=Date.now();
      await rateLimit(db,await visitor('login:'),20,now,'Слишком много попыток. Повторите через минуту.');
      const credentials=await first(db,'SELECT c.password_hash FROM credentials c JOIN students s ON s.id=c.student_id WHERE s.login=?',login);
      const fallback=credentials||await first(db,'SELECT password_hash FROM credentials LIMIT 1');
      const valid=await verifyPassword(input.password,fallback.password_hash);
      if(!credentials||!valid) fail(401,'Не удалось войти. Проверьте логин и пароль.');
      const student=await first(db,`${studentSelect} WHERE login=?`,login);
      const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
      const existing=cookieToken(request.headers.get('cookie')||'');
      const statements=[db.prepare('DELETE FROM sessions WHERE expires_at<?').bind(new Date(now).toISOString()),db.prepare('INSERT INTO sessions (token_hash,student_id,expires_at) VALUES (?,?,?)').bind(await digest(token),student.id,new Date(now+43200000).toISOString())];
      if(existing) statements.push(db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(existing)));
      await db.batch(statements);
      return json({student,demo},200,{'Set-Cookie':sessionCookie(token,secure)});
    }
    const student=await getStudent(db,request.headers.get('cookie')||'');
    if(!student) fail(401,'Войдите в личный кабинет.');
    if(path==='/api/logout' && method==='POST') {
      await db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(cookieToken(request.headers.get('cookie')||''))).run();
      return json({ok:true},200,{'Set-Cookie':sessionCookie('',secure,true)});
    }
    if(['/api/session','/api/profile'].includes(path)&&method==='GET') return json({student,demo});
    if(path==='/api/group-profile' && method==='POST') {
      if(sources.identity.mode!=='demo' || !demoGroupLeader(student)) fail(403,'Изменять данные группы может только её староста.');
      return json(await saveGroupProfile(db,student,await body(request)));
    }
    if(path==='/api/overview'&&method==='GET') {
      const snapshot=storedLessons(student);
      const sheet=schoolWeek(student,demo.today,demo.today,demo.today,snapshot);
      const [grades,requests,notifications,events,groupProfile]=await Promise.all([loadGrades(db,student,sources),readRequests(db,student.id,null,3),readNotifications(db,student.id),readEvents(db,student.id),sources.identity.mode==='demo'?readGroupProfile(db,student):null]);
      const nextLesson=snapshot.find(lesson=>lesson.date>demo.today && lesson.status!=='Отменено') || null;
      const period={...sheet,covered:Boolean(timetable.groups[student.group]),lessons:snapshot};
      return json({student,demo,lessons:sheet.lessons,grades,requests,notifications,events,groupProfile,scheduleCovered:sheet.covered,nextLesson,period,sources:describeSources(sources),homework:await issuedHomework(db,student.group)});
    }
    if(['/api/schedule','/api/schedule/export'].includes(path)&&method==='GET') {
      const {date,view,weekStart,weekEnd,from,to}=scheduleRange(url,demo);
      let sheet=schoolWeek(student,date,from,to);
      if(url.searchParams.get('live')==='1') {
        // Живую неделю «Орбита» спрашивает для любой группы из справочника РЭУ,
        // а не только для двух групп сохранённого снимка.
        const daysApart=Math.abs(Date.parse(weekStart)-Date.parse(demo.today))/86400000;
        const group=officialGroup(student.group)||(timetable.groups[student.group]?student.group:null);
        if(daysApart>120 || !group) fail(422,'Откройте эту дату в расписании РЭУ.');
        const live=await officialWeek(group,weekStart,weekEnd,from,to);
        sheet={...sheet,...live,lessons:mergeLiveLessons(live.lessons,sheet.lessons)};
      }
      const lessons=sheet.lessons;
      if(path.endsWith('/export')) {
        if(!lessons.length)fail(422,'На выбранный период нет занятий для экспорта.');
        return new Response(createCalendar(lessons),{headers:{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':`attachment; filename="orbita-${view}-${date}.ics"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
      }
      return json({...sheet,date,view,weekStart,weekEnd,sources:describeSources(sources)});
    }
    if(path==='/api/plan'&&method==='GET')return json(await readPlan(db,student,demo,sources));
    if(path==='/api/plan/task'&&method==='POST'){
      await changeTask(db,student.id,await body(request),fail);
      return json(await readPlan(db,student,demo,sources));
    }
    if(path==='/api/plan/mark'&&method==='POST') {
      const input=await body(request);
      if(typeof input.key!=='string'||typeof input.done!=='boolean')fail(422,'Укажите действие и состояние отметки.');
      const plan=await readPlan(db,student,demo,sources);
      if(!plan.items.some(x=>x.key===input.key))fail(404,'Действие не найдено или недоступно.');
      await db.prepare('INSERT INTO plan_marks (student_id,key,done,updated_at) VALUES (?,?,?,?) ON CONFLICT(student_id,key) DO UPDATE SET done=excluded.done,updated_at=excluded.updated_at').bind(student.id,input.key,input.done?1:0,new Date().toISOString()).run();
      return json(await readPlan(db,student,demo,sources));
    }
    if(path==='/api/grades'&&method==='GET') return json({grades:await loadGrades(db,student,sources),events:await readEvents(db,student.id),sources:describeSources(sources)});
    if(path==='/api/notifications'&&method==='GET') return json({notifications:await readNotifications(db,student.id)});
    if(path==='/api/notifications/read-all'&&method==='POST') {
      await db.prepare('INSERT OR IGNORE INTO notification_reads (student_id,notification_id,read_at) SELECT student_id,id,? FROM notifications WHERE student_id=?').bind(new Date().toISOString(),student.id).run();
      return json({ok:true});
    }
    const read=path.match(/^\/api\/notifications\/([^/]+)\/read$/);
    if(read&&method==='POST') {
      const notice=await first(db,'SELECT id FROM notifications WHERE id=? AND student_id=?',read[1],student.id);
      if(!notice) fail(404,'Уведомление не найдено или недоступно.');
      await db.prepare('INSERT OR IGNORE INTO notification_reads (student_id,notification_id,read_at) VALUES (?,?,?)').bind(student.id,notice.id,new Date().toISOString()).run();
      return json({ok:true});
    }
    if(path==='/api/requests'&&method==='GET') {
      const page=Number(url.searchParams.get('page')||1),pageSize=20;
      if(!Number.isInteger(page)||page<1||page>100)fail(422,'Выберите корректную страницу заявок.');
      const {total}=await first(db,'SELECT count(*) AS total FROM requests WHERE student_id=?',student.id);
      return json({requests:await readRequests(db,student.id,null,pageSize,(page-1)*pageSize),page,pageSize,total,hasMore:page*pageSize<total});
    }
    if(path==='/api/requests'&&method==='POST') {
      const input=await body(request);const fields={};
      if(!requestTypes.includes(input.type)) fields.type='Выберите тип обращения.';
      if(typeof input.message!=='string'||input.message.trim().length<10||input.message.trim().length>2000) fields.message='Добавьте от 10 до 2000 символов. Без персональных данных.';
      if(typeof input.idempotencyKey!=='string'||!/^[0-9a-f-]{36}$/i.test(input.idempotencyKey)) fields.idempotencyKey='Обновите форму и повторите отправку.';
      if(Object.keys(fields).length) fail(422,'Проверьте поля заявки.',fields);
      const previous=await first(db,'SELECT id,type,message FROM requests WHERE student_id=? AND idempotency_key=?',student.id,input.idempotencyKey);
      if(previous&&(previous.type!==input.type||previous.message!==input.message.trim())) fail(409,'Эта форма уже отправлена. Откройте новую заявку.');
      if(previous)return json({request:(await readRequests(db,student.id,previous.id))[0],replayed:true});
      const now=Date.now(),id=crypto.randomUUID(),at=new Date(now).toISOString(),since=new Date(now-60000).toISOString();
      await db.batch([
        // Count only committed records, in the same atomic write batch. Concurrent
        // retries of one key never consume additional creation quota.
        db.prepare('INSERT OR IGNORE INTO requests (id,student_id,type,message,status,created_at,idempotency_key) SELECT ?,?,?,?,?,?,? WHERE (SELECT count(*) FROM requests WHERE student_id=?)<100 AND (SELECT count(*) FROM requests WHERE student_id=? AND created_at>=?)<5').bind(id,student.id,input.type,input.message.trim(),'Принята',at,input.idempotencyKey,student.id,student.id,since),
        db.prepare('INSERT OR IGNORE INTO request_history (id,request_id,student_id,status,at,note) SELECT ?,id,student_id,?,?,? FROM requests WHERE id=? AND student_id=?').bind(id+'-accepted','Принята',at,'Обращение сохранено в «Орбите». В ЛКС РЭУ не отправлялось.',id,student.id)
      ]);
      const stored=await first(db,'SELECT id,type,message FROM requests WHERE student_id=? AND idempotency_key=?',student.id,input.idempotencyKey);
      if(!stored) {
        const {total}=await first(db,'SELECT count(*) AS total FROM requests WHERE student_id=?',student.id);
        fail(429,total>=100?'В общем профиле уже 100 заявок. Существующие обращения доступны для просмотра.':'Для общего профиля доступно 5 новых заявок в минуту. Подождите немного; сохранённая заявка не потеряется.');
      }
      if(stored.type!==input.type||stored.message!==input.message.trim()) fail(409,'Эта форма уже отправлена. Откройте новую заявку.');
      return json({request:(await readRequests(db,student.id,stored.id))[0],replayed:stored.id!==id},stored.id===id?201:200);
    }
    const detail=path.match(/^\/api\/requests\/([^/]+)$/);
    if(detail&&method==='GET') {
      const rows=await readRequests(db,student.id,detail[1]);
      if(!rows.length) fail(404,'Заявка не найдена или недоступна.');
      return json({request:rows[0]});
    }
    fail(404,'Раздел не найден.');
  } catch(error) {
    if(error instanceof ApiError) return json({error:error.message,...(error.fields?{fields:error.fields}:{})},error.status);
    // Deliberately omit personal data, request bodies, database details and tokens.
    console.error('orbit_api_failed',error?.name||'Error');
    return json({error:'Не удалось загрузить данные. Повторите попытку.'},503);
  }
}
