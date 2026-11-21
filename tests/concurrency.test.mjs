import {prepareTestAccounts, testCredentials} from './test-accounts.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {sqliteAdapter} from '../scripts/sqlite-adapter.mjs';
import {handleApi} from '../lib/api.mjs';

function harness() {
  const native=sqliteAdapter();
  for(const file of readdirSync('drizzle').filter(name=>name.endsWith('.sql')).sort())native.sqlite.exec(readFileSync('drizzle/'+file,'utf8'));
  let gate;
  const db={...native,prepare(sql){
    const statement=native.prepare(sql);
    if(sql==='SELECT id,type,message FROM requests WHERE student_id=? AND idempotency_key=?') {
      const first=statement.first;
      statement.first=async()=>{
        const value=await first();
        const current=gate;
        if(current&&!value) {
          if(++current.arrived===current.count)current.release();
          await current.promise;
        }
        return value;
      };
    }
    return statement;
  }};
  const call=async(path,{cookie,body}={})=>{
    const response=await handleApi(new Request('https://orbit.test/api'+path,{
      method:body===undefined?'GET':'POST',
      headers:{origin:'https://orbit.test','content-type':'application/json',...(cookie?{cookie}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})
    }),db);
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  };
  return {db,call,async login(login='alina'){await prepareTestAccounts(db);return call('/login',{body:testCredentials(login)});},
    synchronizeMisses(count){let release;const promise=new Promise(resolve=>release=resolve);gate={count,arrived:0,promise,release};},
    releaseGate(){gate=undefined;}};
}
const payload=()=>({type:'Вопрос по учёбе',message:'Вымышленный вопрос для конкурентной проверки.',idempotencyKey:crypto.randomUUID()});

test('six simultaneous same-key retries create one request and consume one creation slot',async()=>{
  const h=harness();
  try {
    const account=await h.login(),body=payload();
    h.synchronizeMisses(6);
    const responses=await Promise.all(Array.from({length:6},()=>h.call('/requests',{cookie:account.cookie,body})));
    h.releaseGate();
    assert.equal(responses.filter(response=>response.status===201).length,1);
    assert.ok(responses.every(response=>[200,201].includes(response.status)));
    const ids=new Set(responses.map(response=>response.data.request.id));assert.equal(ids.size,1);
    assert.equal(h.db.sqlite.prepare('SELECT count(*) AS n FROM request_history WHERE request_id=?').get([...ids][0]).n,1);
    for(let i=0;i<4;i++)assert.equal((await h.call('/requests',{cookie:account.cookie,body:payload()})).status,201);
    assert.equal((await h.call('/requests',{cookie:account.cookie,body:payload()})).status,429);
    assert.equal((await h.call('/requests',{cookie:account.cookie,body})).status,200);
  } finally {h.db.sqlite.close();}
});

test('concurrent distinct requests at 99 records stop at 100 with one complete history',async()=>{
  const h=harness();
  try {
    const account=await h.login(),other=await h.login('mark');
    const insert=h.db.sqlite.prepare('INSERT INTO requests (id,student_id,type,message,status,created_at,idempotency_key) VALUES (?,?,?,?,?,?,?)');
    for(let i=0;i<98;i++)insert.run('boundary-'+i,'student-alina','Вопрос по учёбе','Вымышленная старая заявка.','Принята','2026-01-01T00:00:00.000Z','boundary-'+i);
    h.synchronizeMisses(3);
    const responses=await Promise.all(Array.from({length:3},()=>h.call('/requests',{cookie:account.cookie,body:payload()})));
    h.releaseGate();
    assert.equal(responses.filter(response=>response.status===201).length,1);
    assert.equal(responses.filter(response=>response.status===429).length,2);
    assert.equal(h.db.sqlite.prepare('SELECT count(*) AS n FROM requests WHERE student_id=?').get('student-alina').n,100);
    const created=responses.find(response=>response.status===201).data.request;
    assert.equal(created.history.length,1);
    assert.equal(h.db.sqlite.prepare('SELECT count(*) AS n FROM request_history WHERE request_id=?').get(created.id).n,1);
    assert.equal((await h.call('/requests',{cookie:other.cookie,body:payload()})).status,201);
  } finally {h.db.sqlite.close();}
});

test('a SQLite batch exposes either all writes or none when a later statement fails',async()=>{
  const db=sqliteAdapter();
  try {
    db.sqlite.exec('CREATE TABLE atomic_probe (id INTEGER PRIMARY KEY)');
    const batch=db.batch([db.prepare('INSERT INTO atomic_probe VALUES (1)'),db.prepare('INSERT INTO atomic_probe VALUES (2)')]);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM atomic_probe').first()).n,2);
    await batch;
    await assert.rejects(db.batch([db.prepare('INSERT INTO atomic_probe VALUES (3)'),db.prepare('INSERT INTO atomic_probe VALUES (1)')]));
    assert.equal((await db.prepare('SELECT count(*) AS n FROM atomic_probe').first()).n,2);
  } finally {db.sqlite.close();}
});
