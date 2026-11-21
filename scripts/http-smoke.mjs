import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5173';
if (!process.env.ORBIT_ALINA_PASSWORD || !process.env.ORBIT_MARK_PASSWORD) {
  throw new Error('Set ORBIT_ALINA_PASSWORD and ORBIT_MARK_PASSWORD for the target server.');
}
const call=async(path,{method='GET',body,cookie}={})=>{
  const r=await fetch(base+path,{method,headers:{origin:base,'content-type':'application/json',...(cookie?{cookie}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),redirect:'manual'});
  const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}
  return {status:r.status,data,headers:r.headers,cookie:r.headers.get('set-cookie')?.split(';')[0]};
};
assert.equal((await call('/api/session')).status,401);
const a=await call('/api/login',{method:'POST',body:{login:'alina',password:process.env.ORBIT_ALINA_PASSWORD}});assert.equal(a.status,200);
const oa=await call('/api/overview',{cookie:a.cookie});assert.equal(oa.data.lessons.length,3);
const plan=await call('/api/plan',{cookie:a.cookie});assert.equal(plan.status,200);assert.equal(plan.data.total,3);
const calendar=await call('/api/schedule/export?date=2026-11-09&view=week',{cookie:a.cookie});assert.equal(calendar.status,200);assert.equal((calendar.data.match(/BEGIN:VEVENT/g)||[]).length,11);
assert.ok(calendar.data.includes('alina-lesson'));assert.ok(!calendar.data.includes('mark-lesson'));
for(const path of ['/','/schedule','/grades','/requests','/notifications','/profile']) {
  const page=await call(path,{cookie:a.cookie});assert.equal(page.status,200,`${path} signed-in`);
  const anon=await call(path);assert.ok([302,303,307,308].includes(anon.status),`${path} anonymous ${anon.status}`);
  const loginPage=new URL(anon.headers.get('location'),base);
  assert.equal(loginPage.pathname,'/login');assert.equal(loginPage.searchParams.get('next'),path==='/'?null:path);
}
const payload={type:'Вопрос по учёбе',message:'Вымышленный запрос: проверка сохранения прототипа.',idempotencyKey:'0199b67d-282e-4bd0-a954-282862d41081'};
const parallel=await Promise.all([call('/api/requests',{method:'POST',body:payload,cookie:a.cookie}),call('/api/requests',{method:'POST',body:payload,cookie:a.cookie})]);
assert.ok(parallel.every(x=>[200,201].includes(x.status)));const id=parallel[0].data.request.id;assert.equal(parallel[1].data.request.id,id);assert.equal(parallel[0].data.request.history.length,1);
await call('/api/notifications/alina-notice-0/read',{method:'POST',cookie:a.cookie});
assert.equal((await call('/api/notifications',{cookie:a.cookie})).data.notifications.find(x=>x.id==='alina-notice-0').read,true);
await call('/api/logout',{method:'POST',cookie:a.cookie});assert.equal((await call('/api/session',{cookie:a.cookie})).status,401);
const b=await call('/api/login',{method:'POST',body:{login:'mark',password:process.env.ORBIT_MARK_PASSWORD}});assert.equal(b.data.student.firstName,'Марк');
assert.equal((await call('/api/requests/'+id,{cookie:b.cookie})).status,404);
assert.equal((await call('/api/notifications/alina-notice-0/read',{method:'POST',cookie:b.cookie})).status,404);
assert.equal((await call('/api/plan/mark',{method:'POST',cookie:b.cookie,body:{key:plan.data.items[0].key,done:true}})).status,404);
await call('/api/logout',{method:'POST',cookie:b.cookie});
const again=await call('/api/login',{method:'POST',body:{login:'alina',password:process.env.ORBIT_ALINA_PASSWORD}});
assert.equal((await call('/api/requests/'+id,{cookie:again.cookie})).status,200);
await call('/api/logout',{method:'POST',cookie:again.cookie});
console.log(JSON.stringify({base,passed:true,checks:['server pages & redirect','both accounts',process.env.TEST_STORAGE_LABEL||(new URL(base).hostname.endsWith('chatgpt.site')?'hosted D1':'local D1'),'parallel idempotency','notification persistence','logout invalidation','owner isolation','relogin persistence','personal plan ownership','scoped calendar export'],requestId:id}));
