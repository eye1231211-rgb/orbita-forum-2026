"use client";

import {useEffect, useState} from "react";
import {ArrowLeft, ArrowRight, ArrowUpRight, Search, UsersRound} from "lucide-react";
import {services, lksSource, deanSource} from "../../lib/reu-services.mjs";

const timetable = "https://rasp.rea.ru/";
const lks = "https://student.rea.ru/";
const regulation = "https://www.rea.ru/~file/234076/Положение+о+рейтинговой+системе+оценки+успеваемости.pdf";

function External({href, children}: {href:string; children:React.ReactNode}) {
  return <a className="reu-external" href={href} target="_blank" rel="noopener noreferrer">
    {children}<ArrowUpRight size={15} aria-hidden="true"/>
  </a>;
}

export function CampusBackLink({href, children}: {href:string; children:React.ReactNode}) {
  return <a className="back-link" href={href}><ArrowLeft size={17} aria-hidden="true"/>{children}</a>;
}

type GroupSection = {school:string; course:string; level:string; groups:string[]};
type GroupSnapshot = {checkedAt:string; sections:GroupSection[]};
let groupData:GroupSnapshot|null=null;
let groupRequest:Promise<GroupSnapshot>|null=null;
export function preloadGroups() {
  if(groupData) return Promise.resolve(groupData);
  if(!groupRequest) groupRequest=fetch("/reu-groups.json").then(async response=>{
    if(!response.ok) throw Error("Справочник недоступен");
    const result:GroupSnapshot=await response.json();
    if(!result.sections?.length) throw Error("Пустой справочник");
    groupData=result;
    return result;
  }).finally(()=>{groupRequest=null;});
  return groupRequest;
}
const normalise = (value:string) => value.toLocaleLowerCase("ru").replace(/\s+/g,"").replace(/[–—]/g,"-");
/* Названия подразделений приходят с сайта РЭУ с прямыми кавычками
   ("Новые материалы и технологии") и иногда вложенными без закрывающей
   ("Плехановская школа бизнеса "Интеграл"): в русском тексте это выглядит как
   недоделанный импорт. Сам справочник не правим — выравниваем при показе.
   Кавычка считается открывающей по символу перед ней, вложенная ставится
   лапками, а незакрытый уровень закрывается в конце строки. */
const quotes = (value:string) => {
  let depth = 0;
  let out = value.replace(/"/g, (_match, index:number) => {
    const before = value[index - 1];
    if (!before || before === " " || before === "(") { depth += 1; return depth > 1 ? "„" : "«"; }
    const closing = depth > 1 ? "“" : "»";
    depth = Math.max(0, depth - 1);
    return closing;
  });
  while (depth > 0) { out += depth > 1 ? "“" : "»"; depth -= 1; }
  return out;
};
const shortSchool = (value:string) => quotes(value.replace(/\s*\(факультет\)$/i,""));
const dateLabel = (iso:string) => new Date(iso+"T12:00:00Z").toLocaleDateString("ru-RU",{day:"numeric",month:"long",year:"numeric",timeZone:"Europe/Moscow"});

export function GroupDirectory() {
  const [snapshot,setSnapshot] = useState<GroupSnapshot|null>(groupData);
  const [error,setError] = useState(false);
  const [attempt,setAttempt] = useState(0);
  const [school,setSchool] = useState(() => new URLSearchParams(location.search).get("school") || "");
  const [course,setCourse] = useState(() => new URLSearchParams(location.search).get("course") || "");
  const [query,setQuery] = useState(() => (new URLSearchParams(location.search).get("group") || "").slice(0,60));
  const [limit,setLimit] = useState(12);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    preloadGroups().then(data=>{
      if(controller.signal.aborted) return;
      const initial = new URLSearchParams(location.search);
      const validSchool = data.sections.some(s=>s.school===initial.get("school")) ? initial.get("school") || "" : "";
      setSchool(validSchool);
      const validCourse = data.sections.some(s=>(!validSchool || s.school===validSchool) && s.course===initial.get("course"));
      setCourse(validCourse ? initial.get("course") || "" : "");
      setSnapshot(data);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    if (!snapshot) return;
    const params = new URLSearchParams({tab:"groups"});
    if (query) params.set("group",query);
    if (school) params.set("school",school);
    if (course) params.set("course",course);
    const next = "?" + params.toString();
    if (location.search !== next) history.replaceState(history.state,"",location.pathname + next);
  }, [snapshot,query,school,course]);
  if (error) return <div className="card"><p role="alert">Не удалось загрузить справочник групп.</p><button className="button secondary" onClick={()=>setAttempt(attempt+1)}>Повторить</button> <External href={timetable}>Расписание РЭУ</External></div>;
  if (!snapshot) return <p role="status" className="card">Загружаем справочник…</p>;
  const schools = [...new Set(snapshot.sections.map(s=>s.school))];
  const available = snapshot.sections.filter(s=>!school || school===s.school);
  const courses = [...new Set(available.map(s=>s.course))].sort((a,b)=>a.localeCompare(b,"ru",{numeric:true}));
  const needle = normalise(query);
  const rows = available.filter(s=>!course || course===s.course).flatMap(s=>s.groups.filter(g=>normalise(g).includes(needle)).map(code=>({...s,code})));
  return <section className="card reu-directory" aria-label="Поиск по справочнику групп">
    <div className="reu-filters">
      <label>Номер группы<span className="reu-search"><Search size={16}/><input type="search" maxLength={60} value={query} placeholder="Например, БИ01/25" onChange={e=>{setQuery(e.target.value);setLimit(12);}}/></span></label>
      <label>Подразделение<select value={school} onChange={e=>{setSchool(e.target.value);setCourse("");setLimit(12);}}><option value="">Все подразделения</option>{schools.map(s=><option key={s} value={s}>{shortSchool(s)}</option>)}</select></label>
      <label>Курс<select value={course} onChange={e=>{setCourse(e.target.value);setLimit(12);}}><option value="">Все курсы</option>{courses.map(c=><option key={c}>{c}</option>)}</select></label>
    </div>
    <div className="reu-list-meta"><strong aria-live="polite">Найдено групп: {rows.length.toLocaleString("ru-RU")}</strong><span>Данные на {dateLabel(snapshot.checkedAt)}</span></div>
    <ul className="reu-groups">{rows.slice(0,limit).map(row=><li key={[row.school,row.course,row.level,row.code].join("|")}>
      <a href={"/timetable?group="+encodeURIComponent(row.code)}>
        <div><strong>{row.code}</strong><small>{shortSchool(row.school)}</small></div><span>{row.course} · {row.level}</span><ArrowRight size={18} aria-label="Открыть расписание группы"/>
      </a>
    </li>)}</ul>
    {!rows.length && <p>Группа не найдена. Попробуйте часть номера или сбросьте фильтры.</p>}
    <div className="reu-directory-actions">
      {rows.length>limit && <button className="button secondary" onClick={()=>setLimit(limit+24)}>Показать ещё группы</button>}
      {(school||course||query) && <button className="text-button" onClick={()=>{setQuery("");setSchool("");setCourse("");setLimit(12);}}>Сбросить фильтры</button>}
      <External href={timetable}>Официальное расписание</External>
    </div>
  </section>;
}

export type Rating = {exam?:{parts:{label:string;max:number}[];page:number;source:string};participation:number; control:number; creative:number; assessment:number; total:number};
export const ratingParts = [
  ["participation","Работа на занятиях",20], ["control","Текущий контроль",20],
  ["creative","Творческий рейтинг",20], ["assessment","Промежуточная аттестация",40],
] as const;

export function RatingGuide() {
  return <details className="card reu-guide"><summary>Как в РЭУ считают баллы</summary>
    <p>По дисциплине можно набрать 60 баллов за работу в семестре и 40 за промежуточную аттестацию. Конкретные задания определяет рабочая программа дисциплины. Для курсовых работ действует отдельный порядок.</p>
    <dl className="reu-scale">{[["85–100","Отлично"],["70–84","Хорошо"],["50–69","Удовлетворительно"],["0–49","Неудовлетворительно"]].map(([range,title])=><div key={range}><dt>{range}</dt><dd>{title}</dd></div>)}</dl>
    <p>Для зачёта порог составляет 50 баллов.</p>
    <External href={regulation+"#page=10"}>Положение РЭУ, пп. 3.5, 3.18–3.19 (PDF)</External>
  </details>;
}

export function ServiceCatalogue() {
  const [channel,setChannel] = useState("ЛКС");
  const options = services.filter(s=>s.channel===channel);
  return <section className="card reu-catalogue"><h2>Справки и заявления РЭУ</h2>
    <div className="reu-tabs" role="group" aria-label="Виды услуг">{["ЛКС","Деканат"].map(c=><button key={c} aria-pressed={c===channel} onClick={()=>setChannel(c)}>{c==="ЛКС"?"Справки и копии":"Заявления в деканат"}</button>)}</div>
    <div className="reu-services">{options.map(s=><a key={s.name} href={"/requests/new?type="+encodeURIComponent(s.name)}><span>{s.name}</span><ArrowRight size={16}/></a>)}</div>
    <p>{channel==="ЛКС"?"В РЭУ эти документы заказывают в личном кабинете студента.":"Заявления принимает Единый электронный деканат. Адрес, часы приёма и контакты указаны на странице подразделения."} <External href={channel==="ЛКС"?lksSource:deanSource}>Источник РЭУ</External></p>
  </section>;
}

export function RequestGuidance({name}: {name:string}) {
  const service = services.find(s=>s.name===name);
  if (!service) return null;
  return <div className="reu-form-help"><p>{service.hint}</p>
    {service.channel==="ЛКС" && <External href={lks}>Заказать настоящий документ в ЛКС РЭУ</External>}
    {service.channel==="Деканат" && <External href={deanSource}>Порядок подачи в деканате РЭУ</External>}
  </div>;
}

/* Объявления университета лежат отдельным файлом public/reu-news.json
   с датой проверки: их обновляют без пересборки приложения, и в интерфейсе
   честно видно, когда подборку сверяли с сайтом РЭУ. */
type Announcement = {when:string; kind:string; title:string; body:string; href:string};
type NewsFeed = {checkedAt:string; source:string; items:Announcement[]};

export function UniversityNews() {
  const [feed,setFeed] = useState<NewsFeed|null>(null);
  const [failed,setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    fetch("/reu-news.json")
      .then(response => response.ok ? response.json() as Promise<NewsFeed> : Promise.reject(new Error("нет подборки")))
      .then(data => { if (active && data.items?.length) setFeed(data); else if (active) setFailed(true); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);
  return <><figure className="campus-archive"><img src="/images/reu-campus-life.webp" alt="Зал первого корпуса РЭУ перед конференцией"/><figcaption>Зал I корпуса перед Вики-конференцией, 2014 год · Фото: <a href="https://commons.wikimedia.org/wiki/File:Moscow_Wiki-Conference_2014_(photos_by_Mikhail_Fedin;_2014-09-13)_01.jpg" target="_blank" rel="noopener noreferrer">Михаил Федин</a>, <a href="https://creativecommons.org/licenses/by-sa/3.0/deed.ru" target="_blank" rel="noopener noreferrer">CC BY-SA 3.0</a>, уменьшено</figcaption></figure>
    {failed ? <section className="card"><h2>Объявления не загрузились</h2><p>Подборка новостей РЭУ временно недоступна. <External href="https://rea.ru/ru/news">Новости на сайте университета</External></p></section>
      : !feed ? <p role="status" className="card">Загружаем объявления…</p>
      : <section className="card reu-news" aria-label="Подборка объявлений университета">
          {feed.items.map(item => <article key={item.href}><div className="reu-news-date"><strong>{item.when}</strong><small>{item.kind}</small></div>
            <div><h2>{item.title}</h2><p>{item.body}</p><External href={item.href}>Подробнее на сайте РЭУ</External></div></article>)}
          <p className="reu-list-meta"><span>Подборка сверена с сайтом РЭУ {dateLabel(feed.checkedAt)}</span></p>
        </section>}
  </>;
}

export function CampusContacts() {
  return <section className="card reu-contacts"><h2>Куда обратиться</h2>
    <h3>Единый электронный деканат</h3><p>Стремянный пер., 36, корпус 3, каб. 116<br/><a href="mailto:dekanat@rea.ru">dekanat@rea.ru</a> · +7 (495) 800-12-00, доб. 2450</p>
    <External href={deanSource}>Часы приёма и контакты</External>
  </section>;
}
