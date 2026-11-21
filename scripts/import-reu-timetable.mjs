// node scripts/import-reu-timetable.mjs [first Monday] [number of weeks]
// The public ICS contains subgroup rows; individual timetable cards add the lecturer names,
// which are replaced with invented ones before anything is written to disk.
import {readFile, writeFile, rename} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {academicWeek, fetchTimetablePage, officialGroupUrl, readOfficialWeek} from '../lib/rea-live.mjs';
import {fictionalTeachers} from '../lib/fictional-teachers.mjs';

// Настоящие ФИО преподавателей не попадают в снимок: правила конкурса
// запрещают их, а карточка занятия на сайте вуза их публикует. Замена
// происходит здесь, на границе импорта, и она устойчива между запусками.
const invented = new Set();

const groups = ['15.27Д-БИ01/25б', '15.25Д-ЭФК01/24б'];
const from = process.argv[2] || '2026-11-09';
const weeks = Number(process.argv[3] || 3);
academicWeek(from);
if (!Number.isInteger(weeks) || weeks < 1 || weeks > 4) throw new Error('Choose between one and four weeks.');
const advance = days => new Date(Date.parse(from + 'T00:00:00Z') + days * 86_400_000).toISOString().slice(0,10);
const catalogue = JSON.parse(await readFile(new URL('../public/reu-groups.json', import.meta.url), 'utf8'));
const known = new Set(catalogue.sections.flatMap(section => section.groups));

function plain(html) {
  return html.replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|emsp|ensp);/g,' ').replace(/&amp;/g,'&')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
}

async function withRetry(action) {
  for (let attempt = 0; ; attempt++) {
    try { return await action(); }
    catch (error) {
      if (attempt >= 2 || !/fetch failed|timeout|timed out|HTTP (429|500|502|503|504)/i.test(error.message)) throw error;
      const wait = Math.max(error.retryAfterMs || 0, error.message.includes('429') ? 65_000 : (attempt + 1) * 3000);
      console.log('Retrying public calendar after', Math.ceil(wait / 1000), 'seconds.');
      await delay(wait);
    }
  }
}

function detailCards(html) {
  return [...html.matchAll(/<div class="element-info-body" data-elementid="(\d+)" data-subgroup="([^"]*)">([\s\S]*?)(?=<hr\s*\/?\s*>|$)/gi)].map(match => {
    const body = match[3];
    const teachers = [...body.matchAll(/<a\b[^>]*>\s*<i\b[^>]*>school<\/i>([\s\S]*?)<\/a>/gi)].map(m => plain(m[1]));
    return {sourceId:match[1], subgroup:plain(match[2]), subject:plain(body.match(/<h5>([\s\S]*?)<\/h5>/i)?.[1] || ''),
      teacher: fictionalTeachers([...new Set(teachers)].join(', '), invented)};
  });
}

async function enrichWeek(group, week) {
  const key = group.toLocaleLowerCase('ru');
  const card = await withRetry(() => fetchTimetablePage('ScheduleCard', {selection:key,weekNum:academicWeek(week.from),catfilter:0}));
  const mondayLabel = week.from.split('-').reverse().join('.');
  if (!card.text.includes('value="' + key + '"') || !card.text.includes(mondayLabel)) {
    throw new Error('The displayed timetable does not match ' + group + ' ' + week.from);
  }
  const enriched = new Set();
  for (const row of card.text.matchAll(/<tr\b[^>]*class="slot [^"]*"[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const body = row[1].replace(/&#39;/g,"'");
    const selection = body.match(/updateTimeslotInfo\(\s*'(\d{2}\.\d{2}\.\d{4})'\s*,\s*'(\d+)'/);
    if (!selection) continue;
    const start = body.match(/<\/span>\s*<br\s*\/?\s*>\s*(\d\d:\d\d)/i)?.[1];
    if (!start) throw new Error('Unrecognized start time in ' + selection[1]);
    const date = selection[1].split('.').reverse().join('-');
    await delay(230);
    const result = await withRetry(() => fetchTimetablePage('GetDetails', {selection:key,date:selection[1],timeSlot:selection[2]}));
    const details = detailCards(result.text);
    if (!details.length) throw new Error('Empty lesson details: ' + group + ' ' + selection[1] + ' ' + selection[2]);
    for (const detail of details) {
      const candidates = week.lessons.filter(x => !enriched.has(x.id) && x.date === date && x.start === start &&
        x.subject === detail.subject && x.subgroup === detail.subgroup);
      if (candidates.length !== 1) continue;
      candidates[0].teacher = detail.teacher;
      candidates[0].sourceLessonUrl = 'https://rasp.rea.ru/?id=' + detail.sourceId;
      enriched.add(candidates[0].id);
    }
  }
  return enriched.size;
}

const target = new URL('../public/reu-timetable.json', import.meta.url);
const temporary = new URL('../public/reu-timetable.json.' + process.pid + '.tmp', import.meta.url);
const output = {source:'https://rasp.rea.ru/', timezone:'Europe/Moscow', from, to:advance(weeks*7-1), groups:{}};
const existing = await readFile(target, 'utf8').then(JSON.parse).catch(()=>null);
const patchFirst = process.argv.includes('--refresh-first');
if(patchFirst && (!existing || existing.from!==from || existing.to!==output.to)) throw Error('No matching saved date range.');
if(patchFirst) Object.assign(output,existing);
async function save() {
  output.capturedAt=new Date().toISOString();
  await writeFile(temporary,JSON.stringify(output)+'\n','utf8');
  await rename(temporary,target);
}
for (const group of groups) {
  if (!known.has(group)) throw new Error('Unknown group: ' + group);
  const stored = output.groups[group] ||= {sourceUrl:officialGroupUrl(group), lessons:[]};
  for (let index = 0; index < (patchFirst?1:weeks); index++) {
    const start=advance(index*7);
    const week=await withRetry(()=>readOfficialWeek(group,start));
    let enriched=0;
    if(!process.argv.includes('--calendar-only')){
      try{enriched=await enrichWeek(group,week);}catch{console.log('Individual lesson cards unavailable; keeping the verified calendar.');}
    }
    stored.lessons=stored.lessons.filter(x=>x.date<week.from || x.date>week.to).concat(week.lessons).sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));
    if(new Set(stored.lessons.map(x=>x.id)).size!==stored.lessons.length) throw Error('Duplicate lessons');
    if(patchFirst) await save();
    console.log(group,start,week.lessons.length,'lessons;',enriched,'matched detail cards');
  }
}
await save();
console.log('Saved',target.pathname);
