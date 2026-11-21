import {prepareTestAccounts, testCredentials} from './test-accounts.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {sqliteAdapter} from '../scripts/sqlite-adapter.mjs';
import {handleApi} from '../lib/api.mjs';
import {createCalendar} from '../lib/calendar.mjs';

function harness(){
 const db=sqliteAdapter();for(const file of readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort())db.sqlite.exec(readFileSync('drizzle/'+file,'utf8'));
 const call=async(path,{method='GET',body,cookie}={})=>{
  const r=await handleApi(new Request('https://orbit.test/api'+path,{method,headers:{origin:'https://orbit.test','content-type':'application/json',...(cookie?{cookie}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})}),db,new Date("2026-11-09T07:15:00Z"));
  const raw=await r.text();return {status:r.status,headers:r.headers,data:r.headers.get('content-type')?.includes('json')?JSON.parse(raw):raw,cookie:r.headers.get('set-cookie')?.split(';')[0]};
 };
 return {db,call,login:async login=>{await prepareTestAccounts(db);return call('/login',{method:'POST',body:testCredentials(login)});}};
}
test('personal plan marks are durable, reversible and isolated by server session',async()=>{
 const {db,call,login}=harness();
 assert.equal((await call('/plan')).status,401);
 const a=await login('alina'),b=await login('mark');
 const plan=(await call('/plan',{cookie:a.cookie})).data;
 assert.equal(plan.total,3);assert.equal(plan.completed,0);assert.ok(plan.items.every(x=>!x.done));
 const key=plan.items[0].key;
 assert.equal((await call('/plan/mark',{method:'POST',cookie:b.cookie,body:{key,done:true,studentId:'student-alina'}})).status,404);
 assert.equal((await call('/plan/mark',{method:'POST',cookie:a.cookie,body:{key,done:'true'}})).status,422);
 const mark=await call('/plan/mark',{method:'POST',cookie:a.cookie,body:{key,done:true,studentId:'student-mark'}});
 assert.equal(mark.data.completed,1);assert.ok(mark.data.items.find(x=>x.key===key).done);
 assert.equal((await call('/plan',{cookie:b.cookie})).data.completed,0);
 await call('/logout',{method:'POST',cookie:a.cookie});const again=await login('alina');
 assert.equal((await call('/plan',{cookie:again.cookie})).data.completed,1);
 const undone=await call('/plan/mark',{method:'POST',cookie:again.cookie,body:{key,done:false}});
 assert.equal(undone.data.completed,0);assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM plan_marks').get().n,1);
 db.sqlite.close();
});
test('calendar is scoped to owner, preserves cancellation, UTC time and valid UTF-8 folding',async()=>{
 const {db,call,login}=harness();const a=await login('alina'),b=await login('mark');
 assert.equal((await call('/schedule/export')).status,401);
 const calendar=await call('/schedule/export?date=2026-11-09&view=week',{cookie:a.cookie});
 assert.equal(calendar.status,200);assert.match(calendar.headers.get('content-type'),/^text\/calendar/);assert.match(calendar.headers.get('content-disposition'),/attachment/);
 const own=(await call('/schedule?date=2026-11-09&view=week',{cookie:a.cookie})).data;
 assert.equal((calendar.data.match(/BEGIN:VEVENT/g)||[]).length,own.lessons.length);
 assert.match(calendar.data,/DTSTART:20261109T110000Z/);
 const uid=own.lessons[0].id+'@orbita.calendar';
 assert.ok(calendar.data.includes(uid));
 const second=await call('/schedule/export?date=2026-11-09&view=day',{cookie:b.cookie});assert.ok(!second.data.includes(uid));
 // Дата заведомо за границей сохранённого снимка: сам снимок расширяется
 // импортом, и привязываться к его последней неделе тест не должен.
 assert.equal((await call('/schedule/export?date=2027-06-01',{cookie:a.cookie})).status,422);
 assert.equal((await call('/schedule/export?date=invalid',{cookie:a.cookie})).status,422);
 const attack='Тест; запятая, слэш \\ перенос\nBEGIN:VEVENT\r\n'+'Длинное название '.repeat(20);
 const output=createCalendar([{id:'test',subject:attack,date:'2026-11-09',start:'09:00',end:'10:30',room:'А-1',teacher:'Тест',kind:'Семинар',status:'Отменено',note:''}]);
 assert.match(output,/STATUS:CANCELLED/);
 assert.equal((output.match(/\r\nBEGIN:VEVENT\r\n/g)||[]).length,1);
 for(const line of output.split('\r\n'))assert.ok(new TextEncoder().encode(line).length<=75);
 assert.ok(output.replaceAll('\r\n ','').includes('Тест\\; запятая\\, слэш \\\\ перенос\\nBEGIN:VEVENT\\n'));
 db.sqlite.close();
});
test('public demo request writes are bounded; replay still succeeds after limit, lists paginate',async()=>{
 const {db,call,login}=harness();const a=await login('alina'),b=await login('mark');
 const payload={type:'Вопрос по учёбе',message:'Вымышленный вопрос для проверки лимитов.',idempotencyKey:crypto.randomUUID()};
 const first=await call('/requests',{method:'POST',cookie:a.cookie,body:payload});assert.equal(first.status,201);
 for(let i=0;i<4;i++)assert.equal((await call('/requests',{method:'POST',cookie:a.cookie,body:{...payload,idempotencyKey:crypto.randomUUID()}})).status,201);
 assert.equal((await call('/requests',{method:'POST',cookie:a.cookie,body:{...payload,idempotencyKey:crypto.randomUUID()}})).status,429);
 const replay=await call('/requests',{method:'POST',cookie:a.cookie,body:payload});assert.equal(replay.status,200);assert.equal(replay.data.request.id,first.data.request.id);
 assert.equal((await call('/requests',{method:'POST',cookie:b.cookie,body:{...payload,idempotencyKey:crypto.randomUUID()}})).status,201);
 // Simulate an established demo account to verify pagination and the hard cap.
 const insert=db.sqlite.prepare('INSERT INTO requests (id,student_id,type,message,status,created_at,idempotency_key) VALUES (?,?,?,?,?,?,?)');
 for(let i=0;i<94;i++)insert.run('extra-'+i,'student-alina','Вопрос по учёбе','Тестовая запись','Принята','2026-11-01T10:00:00.000Z','extra-'+i);
 const page=await call('/requests',{cookie:a.cookie});assert.equal(page.data.total,100);assert.equal(page.data.requests.length,20);assert.equal(page.data.hasMore,true);assert.ok(page.data.requests.every(x=>x.history.length===0));
 const page2=await call('/requests?page=2',{cookie:a.cookie});assert.equal(page2.data.page,2);assert.ok(page2.data.requests.every(x=>!page.data.requests.some(y=>y.id===x.id)));
 assert.equal((await call('/requests?page=0',{cookie:a.cookie})).status,422);
 db.sqlite.exec("DELETE FROM login_limits WHERE key LIKE 'request:%'");
 assert.equal((await call('/requests',{method:'POST',cookie:a.cookie,body:{...payload,idempotencyKey:crypto.randomUUID()}})).status,429);
 assert.equal((await call('/requests',{method:'POST',cookie:a.cookie,body:payload})).status,200);
 const overview=(await call('/overview',{cookie:a.cookie})).data;assert.equal(overview.requests.length,3);
 db.sqlite.close();
});

test('personal tasks are durable, editable, deletion and homework access stay owner scoped',async()=>{
 const {db,call,login}=harness();
 const a=await login('alina'),b=await login('mark');
 const send=(input,cookie=a.cookie)=>call('/plan/task',{method:'POST',cookie,body:input});
 const overview=(await call('/overview',{cookie:a.cookie})).data;
 const lesson=overview.period.lessons[0],id=crypto.randomUUID();
 const create={action:'create',id,title:'Подготовка',details:'Решить задачи',lessonId:lesson.id,lessonDate:lesson.date,due:'2026-11-14'};
 assert.equal((await send(create)).data.personal.length,1);
 assert.equal((await send(create)).data.personal.length,1);
 assert.equal((await send({...create,title:'Другой текст'})).status,409);
 assert.equal((await send({action:'edit',id,revision:1,title:'Повторить тему',details:'',due:'2026-11-15'})).data.personal[0].revision,2);
 assert.equal((await send({action:'remove',id,revision:1})).status,409);
 assert.equal((await send({action:'remove',id,revision:2},b.cookie)).status,404);
 assert.equal((await call('/plan',{cookie:b.cookie})).data.personal.length,0);
 assert.equal((await send({action:'mark',id,revision:2,done:true})).data.personal[0].done,true);
 db.sqlite.prepare('INSERT INTO lesson_homework(group_name,lesson_id,assignment,author) VALUES (?,?,?,?)').run(overview.student.group,lesson.id,'Текст выданного задания','Учебный курс');
 assert.equal((await call('/overview',{cookie:a.cookie})).data.homework[lesson.id].assignment,'Текст выданного задания');
 assert.equal((await call('/overview',{cookie:b.cookie})).data.homework[lesson.id],undefined);
 assert.equal((await send({action:'remove',id,revision:3})).data.personal.length,0);
 db.sqlite.close();
});
