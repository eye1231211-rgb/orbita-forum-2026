import {prepareTestAccounts, testCredentials} from './test-accounts.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {sqliteAdapter} from '../scripts/sqlite-adapter.mjs';
import {handleApi} from '../lib/api.mjs';
import {applySeed} from '../lib/seed.mjs';

test('academic data, isolated notification state, concurrent idempotency and HTTPS',async()=>{
  const db=sqliteAdapter();
  for(const file of readdirSync('drizzle').filter(x=>x.endsWith('.sql')))db.sqlite.exec(readFileSync('drizzle/'+file,'utf8'));
  await prepareTestAccounts(db);
  const call=async(path,{method='GET',body,cookie,origin='https://orbit.test'}={})=>{
    const headers={origin,'content-type':'application/json',...(cookie?{cookie}:{})};
    const response=await handleApi(new Request('https://orbit.test/api'+path,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{})}),db,new Date("2026-11-09T07:15:00Z"));
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};
  };
  const a=await call('/login',{method:'POST',body:testCredentials('alina')});
  const b=await call('/login',{method:'POST',body:testCredentials('mark')});
  assert.match(a.headers.get('set-cookie'),/; Secure/);
  const oa=await call('/overview',{cookie:a.cookie});const ob=await call('/overview',{cookie:b.cookie});
  assert.equal(oa.status,200);assert.ok(oa.data.lessons.length>0);assert.ok(ob.data.lessons.length>0);
  assert.ok(oa.data.lessons.some(x=>x.subject==="Философия" && x.start==="14:00"));
  assert.notDeepEqual(oa.data.grades,ob.data.grades);assert.equal(oa.data.grades.length,6);
  for (const grade of [...oa.data.grades,...ob.data.grades]) {
    if (!grade.result) { assert.equal(grade.rating,null); continue; }
    const {participation,control,creative,assessment,total} = grade.rating;
    assert.ok([participation,control,creative].every(score=>score>=0 && score<=20));
    assert.ok(assessment>=0 && assessment<=40);
    assert.equal(total,participation+control+creative+assessment);
    assert.ok(grade.result==='Зачёт' ? total>=50 : grade.result==='5' ? total>=85 : total>=70 && total<85);
  }
  const leave = await call('/requests',{method:'POST',cookie:a.cookie,body:{
    type:'Академический отпуск',message:'Учебный пример заявления на один семестр.',idempotencyKey:crypto.randomUUID()
  }});
  assert.equal(leave.status,201);
  assert.equal((await call('/requests/'+leave.data.request.id,{cookie:b.cookie})).status,404);
  const week=await call('/schedule?date=2026-11-11&view=week',{cookie:a.cookie});
  assert.equal(week.data.weekStart,'2026-11-09');assert.equal(week.data.weekEnd,'2026-11-15');
  assert.equal(week.data.group,'15.27Д-БИ01/25б');assert.equal(week.data.covered,true);
  assert.ok(week.data.lessons.every(x=>x.date>=week.data.weekStart && x.date<=week.data.weekEnd));
  assert.ok(week.data.lessons.some(x=>x.subgroup));
  assert.equal((await call('/schedule?date=2027-01-01&view=week',{cookie:a.cookie})).data.covered,false);
  assert.equal((await call('/schedule?date=2026-02-30&view=week',{cookie:a.cookie})).status,422);
  const notice=oa.data.notifications[0].id;
  assert.equal((await call('/notifications/'+notice+'/read',{method:'POST',cookie:b.cookie})).status,404);
  assert.equal((await call('/notifications/'+notice+'/read',{method:'POST',cookie:a.cookie})).status,200);
  assert.equal((await call('/notifications',{cookie:a.cookie})).data.notifications.find(x=>x.id===notice).read,true);
  assert.ok((await call('/notifications',{cookie:b.cookie})).data.notifications.every(x=>!x.read));
  await applySeed(db);assert.equal((await call('/notifications',{cookie:a.cookie})).data.notifications.find(x=>x.id===notice).read,true);
  assert.equal((await call('/notifications/read-all',{method:'POST',cookie:a.cookie})).status,200);
  assert.ok((await call('/notifications',{cookie:a.cookie})).data.notifications.every(x=>x.read));
  const payload={type:'Вопрос по учёбе',message:'Вымышленная параллельная проверка заявки.',idempotencyKey:crypto.randomUUID()};
  const parallel=await Promise.all(Array.from({length:4},()=>call('/requests',{method:'POST',body:payload,cookie:a.cookie})));
  assert.ok(parallel.every(x=>[200,201].includes(x.status)));assert.equal(new Set(parallel.map(x=>x.data.request.id)).size,1);
  assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM request_history WHERE request_id=?').get(parallel[0].data.request.id).n,1);
  assert.equal((await call('/requests',{method:'POST',body:{...payload,message:'Другое содержание для того же ключа.'},cookie:a.cookie})).status,409);
  const rotated=await call('/login',{method:'POST',cookie:a.cookie,body:testCredentials('alina')});
  assert.equal((await call('/session',{cookie:a.cookie})).status,401);
  assert.equal((await call('/session',{cookie:rotated.cookie})).status,200);
  assert.equal((await call('/session',{cookie:b.cookie})).status,200);
  for(const route of ['/requests','/profile','/grades','/schedule','/overview','/notifications'])assert.equal((await call(route)).status,401);
  assert.equal(oa.headers.get('cache-control'),'no-store');
  db.sqlite.close();
});
