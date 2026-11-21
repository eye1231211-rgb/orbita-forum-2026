import {prepareTestAccounts, testCredentials} from './test-accounts.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve} from 'node:path';
import {startPortableServer,applyPortableMigrations} from '../scripts/portable-server.mjs';
import {sqliteAdapter} from '../scripts/sqlite-adapter.mjs';

function fixture(t) {
  const directory=mkdtempSync(join(tmpdir(),'orbita-portable-test-'));
  t.after(()=>{
    // Only remove the explicitly created test directory, never an arbitrary path.
    assert.equal(dirname(directory),resolve(tmpdir()));
    assert.match(basename(directory),/^orbita-portable-test-/);
    rmSync(directory,{recursive:true,force:true});
  });
  const clientDir=join(directory,'client');
  mkdirSync(join(clientDir,'assets'),{recursive:true});
  writeFileSync(join(clientDir,'index.html'),'<!doctype html><html lang="ru"><title>Portable fixture</title><div id="root"></div></html>');
  writeFileSync(join(clientDir,'assets','safe.js'),'console.log("test asset");');
  writeFileSync(join(directory,'secret.txt'),'must never be served');
  return {directory,clientDir,dbPath:join(directory,'data','orbita.sqlite'),host:'127.0.0.1',port:0,publicOrigin:''};
}
function client(runtime) {
  const base=`http://127.0.0.1:${runtime.address.port}`;
  return async(path,{body,cookie,origin=runtime.origin,headers={}}={})=>{
    const response=await fetch(base+path,{redirect:'manual',method:body===undefined?'GET':'POST',headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const text=await response.text();
    return {status:response.status,headers:response.headers,data:response.headers.get('content-type')?.includes('application/json')?JSON.parse(text):text,cookie:response.headers.get('set-cookie')?.split(';')[0]};
  };
}
const credentials=login=>(testCredentials(login));

test('portable HTTP server guards HTML and APIs, isolates two accounts and persists across graceful restart',async t=>{
  const options=fixture(t);let runtime=await startPortableServer(options);
  try {
    await prepareTestAccounts(runtime.db);
    let call=client(runtime);
    assert.equal((await call('/login')).status,200);
    for(const path of ['/','/schedule','/grades','/requests','/requests/new','/notifications','/profile','/index.html','/schedule?tab=groups&group=BI01','/requests/demo-request-mark']) {
      const response=await call(path);assert.equal(response.status,303);const target=new URL(response.headers.get('location'),runtime.origin);
      assert.equal(target.pathname,'/login');assert.equal(target.searchParams.get('next'),['/','/index.html'].includes(path)?null:path);
    }
    assert.equal((await call('/api/session')).status,401);
    assert.equal((await call('/api/schedule/export?view=week')).status,401);
    assert.equal((await call('/assets/safe.js')).status,200);
    assert.equal((await call('/%2e%2e%2fsecret.txt')).status,404);
    assert.equal((await call('/%5c..%5csecret.txt')).status,404);
    assert.equal((await call('/.env')).status,404);
    const a=await call('/api/login',{body:testCredentials('alina')});assert.equal(a.status,200);
    assert.match(a.headers.get('set-cookie'),/HttpOnly; SameSite=Lax/);assert.doesNotMatch(a.headers.get('set-cookie'),/; Secure/);
    const html=await call('/profile',{cookie:a.cookie});assert.equal(html.status,200);assert.match(html.headers.get('cache-control'),/no-store/);assert.match(html.headers.get('content-security-policy'),/script-src 'self'/);
    const plan=(await call('/api/plan',{cookie:a.cookie})).data;
    await call('/api/plan/mark',{cookie:a.cookie,body:{key:plan.items[0].key,done:true,studentId:'student-mark'}});
    const notices=(await call('/api/notifications',{cookie:a.cookie})).data.notifications;
    await call('/api/notifications/'+notices[0].id+'/read',{cookie:a.cookie,body:{}});
    const body={type:'Вопрос по учёбе',message:'Вымышленный вопрос для переносимого прототипа.',idempotencyKey:crypto.randomUUID(),studentId:'student-mark'};
    const created=await call('/api/requests',{cookie:a.cookie,body});assert.equal(created.status,201);const id=created.data.request.id;
    assert.equal((await call('/api/requests/'+id,{cookie:a.cookie})).status,200);
    assert.equal((await call('/api/requests',{cookie:a.cookie,body})).data.request.id,id);
    const b=await call('/api/login',{body:testCredentials('mark')});assert.equal(b.status,200);assert.notEqual(a.data.student.institute,b.data.student.institute);
    const groupUpdate={telegramUrl:'https://t.me/+OrbitaFixtureLink',note:'Общие материалы в закрепе.'};
    assert.equal((await call('/api/group-profile',{body:groupUpdate})).status,401);
    assert.equal((await call('/api/group-profile',{cookie:a.cookie,body:{...groupUpdate,studentId:b.data.student.id}})).status,403);
    assert.equal((await call('/api/group-profile',{cookie:b.cookie,body:groupUpdate,origin:'https://other.example'})).status,403);
    const invalidChat=await call('/api/group-profile',{cookie:b.cookie,body:{...groupUpdate,telegramUrl:'https://t.me@other.example/chat'}});
    assert.equal(invalidChat.status,422);assert.ok(invalidChat.data.fields.telegramUrl);
    const groupSaved=await call('/api/group-profile',{cookie:b.cookie,body:{...groupUpdate,group:a.data.student.group}});
    assert.equal(groupSaved.status,200);assert.deepEqual(groupSaved.data,{...groupUpdate,canEdit:true});
    assert.deepEqual((await call('/api/overview',{cookie:a.cookie})).data.groupProfile,{telegramUrl:'',note:'',canEdit:false});
    const changeGroup=runtime.db.sqlite.prepare('UPDATE students SET group_name=? WHERE id=?');
    changeGroup.run(b.data.student.group,a.data.student.id);
    assert.deepEqual((await call('/api/overview',{cookie:a.cookie})).data.groupProfile,{...groupUpdate,canEdit:false});
    assert.equal((await call('/api/group-profile',{cookie:a.cookie,body:groupUpdate})).status,403);
    changeGroup.run(a.data.student.group,a.data.student.id);
    assert.equal((await call('/api/requests/'+id,{cookie:b.cookie})).status,404);
    assert.equal((await call('/api/plan',{cookie:b.cookie})).data.completed,0);
    assert.ok((await call('/api/notifications',{cookie:b.cookie})).data.notifications.every(notice=>!notice.read));
    assert.equal((await call('/api/logout',{cookie:a.cookie,body:{}})).status,200);
    assert.equal((await call('/api/session',{cookie:a.cookie})).status,401);
    assert.equal((await call('/requests/'+id,{cookie:a.cookie})).status,303);
    const migrations=runtime.db.sqlite.prepare('SELECT * FROM _portable_migrations ORDER BY name').all();assert.ok(migrations.length>=2);
    const oldAddress=`http://127.0.0.1:${runtime.address.port}`;
    await runtime.close();await assert.rejects(fetch(oldAddress+'/login'));
    runtime=await startPortableServer(options);call=client(runtime);
    assert.deepEqual(runtime.db.sqlite.prepare('SELECT * FROM _portable_migrations ORDER BY name').all(),migrations);
    assert.deepEqual((await call('/api/overview',{cookie:b.cookie})).data.groupProfile,{...groupUpdate,canEdit:true});
    const again=await call('/api/login',{body:testCredentials('alina')});assert.equal(again.status,200);
    const stored=await call('/api/requests/'+id,{cookie:again.cookie});assert.equal(stored.status,200);assert.equal(stored.data.request.message,body.message);assert.equal(stored.data.request.history.length,1);
    assert.equal((await call('/api/plan',{cookie:again.cookie})).data.completed,1);
    assert.equal((await call('/api/notifications',{cookie:again.cookie})).data.notifications.find(notice=>notice.id===notices[0].id).read,true);
    const calendar=await call('/api/schedule/export?view=week',{cookie:again.cookie});assert.equal(calendar.status,200);assert.match(calendar.data,/BEGIN:VCALENDAR/);assert.doesNotMatch(calendar.data,/mark-lesson/);
  } finally {await runtime.close();}
});

test('portable HTTPS proxy uses configured PUBLIC_ORIGIN, never Host or forwarding headers',async t=>{
  const runtime=await startPortableServer({...fixture(t),publicOrigin:'https://orbita.example'});
  try {
    await prepareTestAccounts(runtime.db);
    const call=client(runtime);
    const login=await call('/api/login',{body:testCredentials('alina'),headers:{host:'attacker.example','x-forwarded-proto':'http','cf-connecting-ip':'attacker-chosen'}});
    assert.equal(login.status,200);assert.match(login.headers.get('set-cookie'),/; Secure/);
    assert.equal((await call('/api/login',{body:testCredentials('alina'),origin:'http://attacker.example'})).status,403);
    assert.equal((await call('/api/requests',{body:{},cookie:login.cookie,origin:'http://127.0.0.1'})).status,403);
  } finally {await runtime.close();}
});

test('portable migration ledger applies once and rejects edited applied migrations',t=>{
  const {directory}=fixture(t),migrations=join(directory,'migrations');mkdirSync(migrations);
  const file=join(migrations,'0001_probe.sql');writeFileSync(file,'CREATE TABLE probe (id INTEGER PRIMARY KEY);');
  const db=sqliteAdapter();
  try {
    applyPortableMigrations(db,migrations);applyPortableMigrations(db,migrations);
    assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM _portable_migrations').get().n,1);
    writeFileSync(file,'CREATE TABLE changed (id INTEGER PRIMARY KEY);');
    assert.throws(()=>applyPortableMigrations(db,migrations),/applied migration changed/);
  } finally {db.sqlite.close();}
});
