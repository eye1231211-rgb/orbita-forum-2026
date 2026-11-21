import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sqliteAdapter} from '../scripts/sqlite-adapter.mjs';
import {applySeed} from '../lib/seed.mjs';

test('REU fixture upgrade preserves user records, authentication and academic state',async()=>{
 const db=sqliteAdapter();
 try {
  for(const file of ['0000_loving_redwing.sql','0001_famous_inertia.sql'])db.sqlite.exec(readFileSync('drizzle/'+file,'utf8'));
  await applySeed(db);
  db.sqlite.exec("UPDATE students SET institute='Институт цифровых сред', program='Проектирование цифровых продуктов', group_name='ЦП-24-1' WHERE id='student-alina'");
  db.sqlite.exec("UPDATE disciplines SET name='Архитектура цифровых продуктов' WHERE id='alina-subject-0'");
  db.sqlite.exec("UPDATE requests SET message='Existing visitor-authored demo message' WHERE id='demo-request-alina'");
  db.sqlite.exec("INSERT INTO sessions VALUES ('test-session','student-alina','2026-11-11T00:00:00Z')");
  db.sqlite.exec("INSERT INTO notification_reads VALUES ('student-alina','alina-notice-0','2026-11-10T10:00:00Z')");
  db.sqlite.exec("INSERT INTO plan_marks VALUES ('student-alina','lesson:alina-lesson-1',1,'2026-11-10T10:00:00Z')");
  const tables=['credentials','sessions','requests','request_history','notification_reads','plan_marks','lessons','results'];
  const snapshot=()=>Object.fromEntries(tables.map(table=>[table,db.sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
  const before=snapshot();
  db.sqlite.exec(readFileSync('drizzle/0002_reu_demo_context.sql','utf8'));
  assert.deepEqual(snapshot(),before);
  const alina=db.sqlite.prepare("SELECT * FROM students WHERE id='student-alina'").get();
  assert.equal(alina.institute,'Высшая школа кибертехнологий, математики и статистики');
  assert.match(alina.program,/38\.03\.05 Бизнес-информатика/);
  assert.equal(alina.group_name,'ДЕМО-БИ-25');
  assert.equal(db.sqlite.prepare("SELECT name FROM disciplines WHERE id='alina-subject-0'").get().name,'Архитектура предприятия');
  assert.equal(db.sqlite.prepare("SELECT institute FROM students WHERE id='student-mark'").get().institute,'Высшая школа финансов');
 } finally {db.sqlite.close();}
});
