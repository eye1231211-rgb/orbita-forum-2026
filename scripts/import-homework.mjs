// Import a teacher-issued assignment from a JSON file. Requires write access to the
// portal database; there is deliberately no publication permission in student sessions.
// Local: node scripts/import-homework.mjs assignment.json path/to/orbita.sqlite
// Hosted: node scripts/import-homework.mjs assignment.json --sql > homework.sql
// Apply that file using the deployment's authorized D1 administrator.
import {readFileSync,existsSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import timetable from '../public/reu-timetable.json' with {type:'json'};
const [input,destination]=process.argv.slice(2);
if(!input||!destination)throw Error('Provide assignment JSON and a database path or --sql.');
const data=JSON.parse(readFileSync(input,'utf8'));
const {group,lessonId,assignment,author,due='',sourceUrl=''}=data;
if(!timetable.groups[group]?.lessons.some(row=>row.id===lessonId))throw Error('Unknown lesson in group.');
if(typeof assignment!=='string'||!assignment.trim()||assignment.length>4000||
   typeof author!=='string'||!author.trim()||author.length>120)throw Error('Provide assignment text and its issuing teacher.');
if(due && (!/^\d{4}-\d\d-\d\d$/.test(due)||!Number.isFinite(Date.parse(due))||new Date(due).toISOString().slice(0,10)!==due))throw Error('Invalid deadline.');
if(sourceUrl){
  const source=new URL(sourceUrl);
  if(source.protocol!=='https:' || !(source.hostname==='rea.ru'||source.hostname.endsWith('.rea.ru')) || source.username||source.password)throw Error('Expected an HTTPS university source.');
}
const fields=[group,lessonId,assignment.trim(),due,author.trim(),sourceUrl];
const sql='INSERT INTO lesson_homework(group_name,lesson_id,assignment,due,author,source_url) VALUES (?,?,?,?,?,?) ON CONFLICT(group_name,lesson_id) DO UPDATE SET assignment=excluded.assignment,due=excluded.due,author=excluded.author,source_url=excluded.source_url';
if(destination==='--sql'){
  let index=0;
  console.log(sql.replaceAll('?',()=>"'"+fields[index++].replaceAll("'","''")+"'")+';');
}else{
  if(!existsSync(destination))throw Error('Database does not exist.');
  const db=new DatabaseSync(destination);
  try{db.prepare(sql).run(...fields);}finally{db.close();}
}
