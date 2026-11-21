"use client";
import { ArrowUpRight } from "lucide-react";
import CampusGallery from "./CampusGallery";
import { useEffect, useState } from "react";
import { LessonSlots } from "./LessonSlots";

type Stop = {id:string; date:string; start:string; end:string; subject:string; room:string; teacher:string; kind:string; status:string; oldRoom?:string; note?:string; subgroup?:string};
const minutes = (s:string) => Number(s.slice(0,2))*60+Number(s.slice(3,5));
const two = (n:number) => String(n).padStart(2,"0");
const clock = (n:number) => two(Math.floor(n/60))+":"+two(n%60);
const format = (date:string, options:Intl.DateTimeFormatOptions) => new Date(date+"T12:00:00+03:00").toLocaleDateString("ru-RU",{timeZone:"Europe/Moscow",...options});
// «77 мин» читается хуже, чем «1 ч 17 мин»: после часа длительность пишется в часах и минутах
const duration = (n:number) => n<60 ? `${n} мин` : n%60 ? `${Math.floor(n/60)} ч ${n%60} мин` : `${n/60} ч`;

export default function DayAtlas({lessons,date,now,group,name,covered,nextLesson}:{covered:boolean;nextLesson:Stop|null;lessons:Stop[];date:string;now:string;group:string;name:string}) {
  const [instant,setInstant]=useState(()=>Math.floor(Date.parse(now)/60000)*60000);
  useEffect(()=>{
    const origin=Date.now(), server=Date.parse(now);
    function tick(){setInstant(Math.floor((server+Date.now()-origin)/60000)*60000);}
    tick();
    const timer=window.setInterval(tick,5000);
    return ()=>clearInterval(timer);
  },[now]);
  const cursor=minutes(new Date(instant).toLocaleTimeString("ru-RU",{timeZone:"Europe/Moscow",hour:"2-digit",minute:"2-digit"}));
  const valid=lessons.filter(x=>x.status!=="Отменено").sort((a,b)=>a.start.localeCompare(b.start));
  const running=valid.filter(x=>minutes(x.start)<=cursor && cursor<minutes(x.end));
  const current=running[0];
  const following=valid.find(x=>minutes(x.start)>cursor);
  const focus=current||following;
  const past=valid.some(x=>minutes(x.end)<=cursor);
  const ranges = new Map<string, Stop>();
  for (const lesson of valid) {
    const key = lesson.start+"–"+lesson.end;
    if (!ranges.has(key)) ranges.set(key, lesson);
  }
  const firstStart = valid[0] ? minutes(valid[0].start) : null;
  const lastEnd = valid.length ? Math.max(...valid.map(x => minutes(x.end))) : null;
  const ended = lastEnd !== null && cursor >= lastEnd;
  const span = Math.max(1, (lastEnd ?? 0)-(firstStart ?? 0));
  const position = (n: number) => (n-(firstStart ?? 0))*100/span+"%";
  const tone = (lesson: Stop) => cursor>=minutes(lesson.end) ? "is-done" : cursor>=minutes(lesson.start) ? "is-now" : "is-next";
  const left=current?minutes(current.end)-cursor:following?minutes(following.start)-cursor:0;
  const state=current?"Идёт пара":following?(past?"Перерыв":"До первой пары"):ended?"Пары закончились":covered?"Свободный день":"Проверить расписание";
  const detail=(x:Stop)=>"/schedule?date="+date+"#lesson-"+encodeURIComponent(x.id);
  return <section className="atlas" aria-labelledby="atlas-title">
    <header className="studio-title"><h1 id="atlas-title">Мой день</h1><p>{name} <span>·</span> {group}</p></header>
    <div className="atlas-spread">
      <figure className="atlas-print"><CampusGallery start={1}/>
        <figcaption><span>{format(date,{weekday:"long"})}</span><b>{format(date,{day:"numeric",month:"long"})}</b></figcaption>
      </figure>
      <div className="atlas-dial">
        <div className="atlas-dial-head"><span>По расписанию сейчас</span><span>МСК</span></div>
        <div className="atlas-readout"><b>{clock(cursor)}</b><span>{state}{left>0&&<small>{current?"До конца":"До начала"}: {duration(left)}</small>}</span></div>
        <div className="atlas-station" key={focus?.id||"end"}><p>{focus?(current?focus.kind:"Далее · "+focus.kind):"Расписание"}</p><h2>{focus?.subject || (ended?"До следующего учебного дня":covered?(lessons.length?"Сегодня все пары отменены":"На сегодня занятий нет"):"Расписание на эту дату ещё не сохранено")}</h2>
          {focus&&<div className="atlas-address"><b>{focus.oldRoom&&<><del>{focus.oldRoom}</del> → </>}{focus.room}</b><span>{focus.teacher}{focus.subgroup && " · Подгруппа "+focus.subgroup}</span></div>}
        </div>
        {!focus && nextLesson && <a className="atlas-next next-class" href={"/schedule?date="+nextLesson.date+"#lesson-"+nextLesson.id}>Ближайшая пара · {format(nextLesson.date,{day:"numeric",month:"long"})} в {nextLesson.start} · {nextLesson.subject}<ArrowUpRight className="link-arrow" size={14} aria-hidden="true"/></a>}
        {current && following && <p className="atlas-next">Далее: {following.start} · {following.subject} · {following.room}</p>}
        {firstStart !== null && lastEnd !== null && <section className="day-line" aria-labelledby="day-line-title">
          <div className="day-line-frame">
            <h3 id="day-line-title">Учебный день</h3>
            <div className="day-line-plot" aria-hidden="true">
              <div className="day-line-rail">
                {Array.from(ranges, ([range, lesson]) => <i key={range}
                  className={"day-line-pair "+tone(lesson)}
                  style={{left:position(minutes(lesson.start)),width:(minutes(lesson.end)-minutes(lesson.start))*100/span+"%"}}/>)}
              </div>
              {cursor>=firstStart && cursor<lastEnd && <span className="day-line-now" style={{left:position(cursor)}} title={"Сейчас "+clock(cursor)}/>}
            </div>
            <div className="day-line-bounds">
              <span>Начало <time dateTime={clock(firstStart)}>{clock(firstStart)}</time></span>
              <span>Конец <time dateTime={clock(lastEnd)}>{clock(lastEnd)}</time></span>
            </div>
            {ranges.size>1 && <ul className="day-line-ranges" aria-label="Время каждой пары">
              {Array.from(ranges, ([range, lesson]) => <li key={range}><a href={detail(lesson)}
                className={"day-line-range "+tone(lesson)}
                aria-current={current?.id===lesson.id?"time":undefined}
                aria-label={range+" · "+lesson.subject} title={lesson.subject}>{range}</a></li>)}
            </ul>}
          </div>
        </section>}
      </div>
    </div>
    <section className="atlas-itinerary"><header><h2>Пары сегодня</h2><a href={"/schedule?date="+date}>Всё расписание<ArrowUpRight className="link-arrow" size={14} aria-hidden="true"/></a></header>
      <LessonSlots items={lessons} renderLesson={(lesson,shared) => {
        const status=lesson.status==="Обычное" ? "" : lesson.oldRoom ? "Смена аудитории" : lesson.status;
        const room=<>{lesson.oldRoom&&<del>{lesson.oldRoom}</del>}{lesson.room}</>;
        if (shared) return <article className="lesson-card split-lesson atlas-variant" key={lesson.id}>
          <a href={detail(lesson)}>
            <span className="badge purple">Подгруппа {lesson.subgroup}</span>
            {!shared.subject && <strong>{lesson.subject}</strong>}
            <span>{room}<ArrowUpRight className="link-arrow" size={14} aria-hidden="true"/></span>
            {(!shared.kind || status) && <small>{[!shared.kind && lesson.kind,status].filter(Boolean).join(" · ")}</small>}
          </a>
        </article>;
        return <div className={"atlas-row"+(lesson.id===focus?.id?" selected":"")} key={lesson.id}>
          <a className="lesson-jump" href={detail(lesson)}><time>{lesson.start}<small>{lesson.end}</small></time>
            <span className="atlas-subject"><b>{lesson.subject}{lesson===current?<em className="row-chip is-now">Идёт сейчас</em>:lesson===focus?<em className="row-chip">Далее</em>:null}</b>
              <small>{[lesson.kind,lesson.subgroup && "Подгруппа "+lesson.subgroup,status].filter(Boolean).join(" · ")}</small></span>
          </a>
          <a href={detail(lesson)} aria-label={"Детали: "+lesson.subject}><span>{room}</span><ArrowUpRight className="link-arrow" size={14} aria-hidden="true"/></a>
        </div>;
      }}/>
      {!lessons.length&&<p>{covered?"В расписании группы на этот день нет пар.":"Расписание на этот день ещё не загружено. Откройте раздел «Расписание»."}</p>}
    </section>
  </section>;
}
