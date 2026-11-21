"use client";

/* Открытое расписание: любая группа РЭУ без входа в кабинет.
   Страница работает на живых данных — «Орбита» спрашивает неделю у публичного
   экспорта rasp.rea.ru через /api/public/schedule, а номер группы проверяет по
   справочнику университета. Это тот самый режим, который делает портал
   настоящим ещё до того, как вуз выдаст доступ к учётным записям и ведомости. */

import {useEffect, useMemo, useState} from "react";
import {ArrowRight, ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, MapPin, Search, UserRound} from "lucide-react";
import {OrbitMark} from "./Brand";
import {api} from "./portal-client";
import {preloadGroups} from "./ReuCampus";
import {LessonSlots, type SharedLesson} from "./LessonSlots";

type Lesson = {id:string; date:string; start:string; end:string; subject:string; room:string; teacher:string; kind:string; status:string; note?:string; subgroup?:string};
type Sheet = {group:string; date:string; view:"day"|"week"; weekStart:string; weekEnd:string; from:string; to:string;
  lessons:Lesson[]; covered:boolean; sourceUrl:string; capturedAt:string;
  sources?:{schedule:{label:string; detail:string}}};

const GROUP_KEY = "orbita-public-group";
const fmt = (value:string, opts:Intl.DateTimeFormatOptions = {day:"numeric", month:"long"}) =>
  new Date(value.length === 10 ? value + "T12:00:00+03:00" : value).toLocaleDateString("ru-RU", {timeZone:"Europe/Moscow", ...opts});
const shift = (value:string, offset:number) => { const day = new Date(value+"T12:00:00Z"); day.setUTCDate(day.getUTCDate()+offset); return day.toISOString().slice(0,10); };
const monday = (value:string) => { const day = new Date(value+"T12:00:00Z"); return shift(value, -((day.getUTCDay()+6)%7)); };
const today = () => new Date().toLocaleDateString("sv-SE", {timeZone:"Europe/Moscow"});
const normalise = (value:string) => value.toLocaleLowerCase("ru").replace(/\s+/g,"").replace(/[–—]/g,"-");
const plural = (count:number, one:string, few:string, many:string) =>
  count % 100 >= 11 && count % 100 <= 14 ? many : count % 10 === 1 ? one : count % 10 >= 2 && count % 10 <= 4 ? few : many;

function PublicLesson({item,shared}:{item:Lesson;shared?:SharedLesson}) {
  return <article className={`lesson-card ${shared ? "split-lesson" : ""} ${item.status === "Отменено" ? "cancelled" : ""}`}>
    {!shared && <div className="lesson-time"><strong>{item.start}</strong><span>{item.end}</span></div>}
    <div className="lesson-content">
      <div className="lesson-top">
        {item.subgroup && <span className="badge purple">Подгруппа {item.subgroup}</span>}
        {item.kind && !shared?.kind && <span className="lesson-kind">{item.kind}</span>}
        {item.status !== "Обычное" && <span className="badge orange">{item.status}</span>}
      </div>
      {!shared?.subject && <h3>{item.subject}</h3>}
      <div className="lesson-meta">
        {item.room && <span><MapPin size={13} aria-hidden="true"/><span>{item.room}</span></span>}
        <span><UserRound size={13} aria-hidden="true"/><span>{item.teacher || "Преподаватель не указан в календаре РЭУ"}</span></span>
      </div>
    </div>
  </article>;
}
const renderLesson = (item:Lesson,shared?:SharedLesson) => <PublicLesson key={item.id} item={item} shared={shared}/>;

export default function PublicTimetable() {
  /* Сервер и браузер рисуют первый кадр одинаково: адрес страницы, дату
     «сегодня» и запомненную группу читаем уже после подключения к DOM,
     иначе разметка сервера не совпала бы с клиентской. */
  const [group, setGroup] = useState("");
  const [query, setQuery] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [view, setView] = useState<"day"|"week">("day");
  const [sheet, setSheet] = useState<Sheet|null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const asked = params.get("date") || "";
    setDate(/^\d{4}-\d\d-\d\d$/.test(asked) ? asked : today());
    if (params.get("view") === "week") setView("week");
    const asksGroup = params.get("group") || "";
    if (asksGroup) setGroup(asksGroup);
    else { try { setGroup(localStorage.getItem(GROUP_KEY) || ""); } catch { /* Приватный режим — просто спросим группу. */ } }
  }, []);

  // Справочник групп тот же, что в разделе «Группы РЭУ»: один файл на всё приложение.
  useEffect(() => {
    let active = true;
    preloadGroups()
      .then(data => { if (active) setCodes(data.sections.flatMap(section => section.groups)); })
      .catch(() => { if (active) setError("Не удалось загрузить справочник групп РЭУ."); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!date) return;
    const next = new URLSearchParams();
    if (group) next.set("group", group);
    next.set("date", date); next.set("view", view);
    if (location.pathname === "/timetable") history.replaceState(history.state, "", "/timetable?" + next.toString());
    if (group) { try { localStorage.setItem(GROUP_KEY, group); } catch { /* Запоминание группы необязательно. */ } }
  }, [group, date, view]);

  useEffect(() => {
    if (!group || !date) return;
    let active = true;
    setLoading(true); setError("");
    api<Sheet>("/api/public/schedule?group=" + encodeURIComponent(group) + "&date=" + date + "&view=" + view)
      .then(result => { if (active) setSheet(result); })
      .catch(failure => { if (active) { setSheet(null); setError((failure as Error).message); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [group, date, view]);

  const needle = normalise(query);
  const matches = useMemo(() => needle.length < 2 ? [] : codes.filter(code => normalise(code).includes(needle)).slice(0, 8), [codes, needle]);
  const week = date ? Array.from({length:7}, (_, index) => shift(monday(date), index)) : [];
  const lessons = (sheet?.lessons || []).slice().sort((a, b) => (a.date+a.start).localeCompare(b.date+b.start));

  return <div className="public-page">
    <header className="public-head">
      <a className="orbit-brand" href="/" aria-label="Орбита — цифровой деканат РЭУ">
        <OrbitMark/><span><b>Орбита</b><small>Цифровой деканат РЭУ</small></span>
      </a>
      <a className="button secondary" href="/">Личный кабинет<ArrowRight size={17} aria-hidden="true"/></a>
    </header>
    <main className="public-main">
      <div className="page-title edition-title"><div className="title-copy">
        <span className="eyebrow">Открытый доступ</span>
        <h1>Расписание любой группы</h1>
        <p>Выберите группу — «Орбита» запросит её неделю в расписании РЭУ. Вход для этого не нужен.</p>
      </div></div>

      <section className="card public-picker">
        <label htmlFor="group-search">Номер группы
          <span className="reu-search"><Search size={16} aria-hidden="true"/>
            <input id="group-search" type="search" maxLength={60} value={query} placeholder="Например, БИ01/25"
              autoComplete="off" onChange={event => setQuery(event.target.value)}/>
          </span>
        </label>
        {matches.length > 0 && <ul className="group-suggest">{matches.map(code =>
          <li key={code}><button type="button" onClick={() => { setGroup(code); setQuery(""); }}>{code}</button></li>
        )}</ul>}
        {query.length >= 2 && !matches.length && <p className="muted tiny">В справочнике РЭУ такой группы нет. Попробуйте часть номера.</p>}
        {group && <p className="public-chosen"><span className="source-group">{group}</span>
          <button type="button" className="text-button" onClick={() => { setGroup(""); setSheet(null); }}>Выбрать другую группу</button></p>}
        {group && <p className="schedule-source">
          <span>{sheet ? "Данные РЭУ от " + fmt(sheet.capturedAt, {day:"numeric", month:"long", hour:"2-digit", minute:"2-digit"}) : loading ? "Спрашиваем расписание РЭУ…" : "Расписание РЭУ"}</span>
          {sheet?.sourceUrl && <a href={sheet.sourceUrl} target="_blank" rel="noopener noreferrer">Оригинал<ArrowUpRight size={13} aria-hidden="true"/></a>}
        </p>}
      </section>

      {group && date && <>
        <div className="schedule-toolbar">
          <div className="segmented" aria-label="Вид расписания">
            <button className={view === "day" ? "selected" : ""} onClick={() => setView("day")} aria-pressed={view === "day"}>День</button>
            <button className={view === "week" ? "selected" : ""} onClick={() => setView("week")} aria-pressed={view === "week"}>Неделя</button>
          </div>
          <div className="date-nav" role="group" aria-label="Выбор даты">
            <button type="button" onClick={() => setDate(shift(date, view === "day" ? -1 : -7))} aria-label={view === "day" ? "Предыдущий день" : "Предыдущая неделя"}><ChevronLeft size={18}/></button>
            <label className="date-field" onClick={event=>{const picker=event.currentTarget.querySelector("input");try{picker?.showPicker?.();}catch{/* rationale: showPicker запрещён без жеста пользователя и есть не во всех браузерах — тогда дату правят с клавиатуры */}}}><span className="visually-hidden">Выбрать дату</span>
              <CalendarDays size={16} aria-hidden="true"/>
              <input type="date" value={date} onChange={event => { if (event.target.value) setDate(event.target.value); }}/>
            </label>
            <button type="button" onClick={() => setDate(shift(date, view === "day" ? 1 : 7))} aria-label={view === "day" ? "Следующий день" : "Следующая неделя"}><ChevronRight size={18}/></button>
          </div>
          <button className="button secondary today-button" onClick={() => setDate(today())} disabled={date === today()}>Сегодня</button>
        </div>
        {error ? <section className="card"><h2>Расписание не загрузилось</h2><p role="alert">{error}</p></section>
          : loading && !sheet ? <div className="loading" role="status"><span className="spinner"/>Загрузка расписания…</div>
          : view === "day"
            ? <section className="card day-card schedule-reveal" key={date}>
                <div className="section-heading"><h2>{fmt(date, {weekday:"long", day:"numeric", month:"long"})}</h2>
                  <span className="muted tiny">{lessons.length} {plural(lessons.length, "занятие", "занятия", "занятий")}</span></div>
                {lessons.length ? <LessonSlots items={lessons} renderLesson={renderLesson}/>
                  : <div className="empty"><span className="empty-sign"><CalendarDays size={24} aria-hidden="true"/></span>
                      <h3>День без занятий</h3><p>В расписании РЭУ на этот день у группы занятий нет.</p></div>}
              </section>
            : <div className="week-lessons schedule-reveal" key={monday(date)}>{week.map(day =>
                <section className="card day-card week-day" key={day}>
                  <div className="section-heading"><h2>{fmt(day, {weekday:"long", day:"numeric", month:"long"})}</h2>
                    {day === today() && <span className="badge green">Сегодня</span>}</div>
                  {lessons.some(item => item.date === day)
                    ? <LessonSlots items={lessons.filter(item => item.date===day)} renderLesson={renderLesson}/>
                    : <p className="free-day">Занятий нет.</p>}
                </section>)}</div>}
      </>}

      {!group && <section className="card"><h2>Как это работает</h2>
        <p>«Орбита» не хранит чужое расписание: номер группы проверяется по справочнику РЭУ, а неделя запрашивается у университета в момент открытия страницы. Личный кабинет добавляет к этому баллы, заявки и уведомления.</p>
      </section>}

      <p className="concept-note">Источник расписания — публичный экспорт <a href="https://rasp.rea.ru/" target="_blank" rel="noopener noreferrer">rasp.rea.ru<ArrowUpRight className="link-arrow" size={14} aria-hidden="true"/></a>. Баллы и заявки доступны после входа в кабинет.</p>
    </main>
  </div>;
}
