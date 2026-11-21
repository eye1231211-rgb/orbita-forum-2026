"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode, type CSSProperties } from "react";
import WeekPlan from "./WeekPlan";
import DayAtlas from "./DayAtlas";
import CampusGallery from "./CampusGallery";
import Gradebook, { type Grade } from "./Gradebook";
import {api, cached} from "./portal-client";
import {usePortalRoute} from "./use-portal-route";
import {loginPath, returnPath} from "../../lib/return-path.mjs";
import {preloadGroups, CampusBackLink, GroupDirectory, UniversityNews, ServiceCatalogue, RequestGuidance, CampusContacts} from "./ReuCampus";
import PublicTimetable from "./PublicTimetable";
import VibeGallery from "./VibeGallery";
import {requestTypes as TYPES} from "../../lib/reu-services.mjs";
import {demoAccounts} from "../../lib/demo-accounts.mjs";
import {OrbitMark, Monogram} from "./Brand";
import {GroupPanel, type GroupProfile} from "./ProfileResources";
import CampusMap from "./CampusMap";
import MobileMenu from "./MobileMenu";
import {LessonSlots, type SharedLesson} from "./LessonSlots";
import { ArrowUpRight, Orbit, UsersRound, Newspaper, Camera, ArrowLeft, ArrowRight, Bell, BookOpen, CalendarDays, Check, CheckCheck, ChevronLeft, ChevronRight, CircleHelp, Clock3, Eye, EyeOff, FileText, GraduationCap, Home, LogOut, MapPin, Plus, RefreshCw, Inbox, UserRound, X } from "lucide-react";

type Student = { id: string; login: string; firstName: string; lastName: string; middleName: string; institute: string; program: string; course: number; group: string; semester: number };
type Demo = { today: string; now: string; timezone: string };
type RequestItem = { id: string; type: string; message: string; status: string; createdAt: string; history: {status: string; at: string; note: string}[] };
type Lesson = {id: string; date: string; start: string; end: string; subject: string; room: string; teacher: string; kind: string; status: string; note?: string; oldRoom?: string; sourceLessonUrl?:string; subgroup?: string};
type Notice = {id: string; title: string; text: string; category: string; date: string; read: boolean; href?: string};
type EventItem = {id: string; title: string; date: string; time?: string; subject?: string; note?: string};
type IssuedHomework = {assignment:string;author:string;due:string;sourceUrl:string};
type Overview = {sources?:Sources; period:TimetablePage; homework:Record<string,IssuedHomework>;scheduleCovered:boolean; nextLesson:Lesson|null;student: Student; demo: Demo; lessons: Lesson[]; grades: Grade[]; requests: RequestItem[]; notifications: Notice[]; events: EventItem[]; groupProfile?: GroupProfile | null};
type SourceNote = {mode:string; label:string; detail:string; ready:boolean; problem:string};
type Sources = {identity:SourceNote; grades:SourceNote; schedule:SourceNote};
type APIError = Error & { fields?: Record<string, string>; status?: number };

// Страницы, которые открываются без входа: экран входа и открытое расписание.
export const PUBLIC_ROUTES = ["/login", "/timetable"];
const NAV = [
  { href: "/", label: "Главная", icon: Home }, { href: "/schedule", label: "Расписание", icon: CalendarDays },
  { href: "/grades", label: "Успеваемость", icon: GraduationCap }, { href: "/requests", label: "Заявки", icon: FileText },
  { href: "/notifications", label: "Уведомления", icon: Bell },
];
const UNIVERSITY_NAV = [
  { href: "/schedule?tab=groups", label: "Группы РЭУ", icon: UsersRound },
  { href: "/notifications?tab=university", label: "Объявления РЭУ", icon: Newspaper },
  { href: "/vibe", label: "Вайб Плехановки", icon: Camera },
];
const fmtDate = (value: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" }) => new Date(value.length === 10 ? value + "T12:00:00+03:00" : value).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", ...opts });
const shiftDate = (value:string, offset:number) => { const d = new Date(value+"T12:00:00Z"); d.setUTCDate(d.getUTCDate()+offset); return d.toISOString().slice(0,10); };
const monday = (value:string) => { const d=new Date(value+"T12:00:00Z"); return shiftDate(value,-((d.getUTCDay()+6)%7)); };
const requestNumber = (id: string) => id === "demo-request-alina" ? "Д-001" : id === "demo-request-mark" ? "Д-002" : id.replaceAll("-", "").slice(0, 6).toUpperCase();
const plural = (count: number, one: string, few: string, many: string) => count % 100 >= 11 && count % 100 <= 14 ? many : count % 10 === 1 ? one : count % 10 >= 2 && count % 10 <= 4 ? few : many;
const statusClass = (status: string) => status === "Готова" || status === "Зачтено" ? "green" : status === "Нужны уточнения" || status === "Перенесено" ? "orange" : status === "Закрыта" || status === "Отменено" ? "gray" : "purple";
function Brand() {
  return <a className="orbit-brand" href="/" aria-label="Орбита — цифровой деканат РЭУ, главная">
    <OrbitMark/><span><b>Орбита</b><small>Цифровой деканат РЭУ</small></span>
  </a>;
}
function Badge({ children, tone = "purple" }: {children: ReactNode; tone?: string}) { return <span className={`badge ${tone}`}>{children}</span>; }
/* Пустое состояние: знак, заголовок, пояснение и действие —
   структура, общая для разобранных дизайн-систем. */
function Empty({title,text,action,icon:Icon=Inbox}:{title:string;text:string;action?:ReactNode;icon?:typeof Inbox}) {
  return <div className="empty"><span className="empty-sign"><Icon size={24} aria-hidden="true"/></span><h3>{title}</h3><p>{text}</p>{action}</div>;
}
function Failure({ message, retry }: {message: string; retry?: () => void}) { return <div className="error-panel" role="alert"><CircleHelp size={22}/><div><strong>Не получилось загрузить данные</strong><p>{message}</p>{retry && <button className="text-button" onClick={retry}><RefreshCw size={16}/>Повторить</button>}</div></div>; }
function Loading() { return <div className="loading" role="status"><span className="spinner"/>Загрузка данных…</div>; }
function PageTitle({ eyebrow, title, subtitle, action }: {eyebrow?: string; title: string; subtitle?: string; action?: ReactNode}) {
  return <div className="page-title edition-title"><div className="title-copy">{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action}</div>;
}

function Login() {
  const [show, setShow] = useState(false), [login,setLogin] = useState(""), [password,setPassword] = useState("");
  // Какой вход подключён, решает сервер: демонстрационные записи «Орбиты»
  // или единый вход университета. Экран подстраивается под ответ.
  const [sources, setSources] = useState<Sources | null>(null);
  useEffect(() => { let active = true; api<{sources:Sources}>("/api/sources").then(answer => { if (active) setSources(answer.sources); }).catch(() => {}); return () => { active = false; }; }, []);
  const universityLogin = sources?.identity.mode === "oidc";
  const [errors,setErrors] = useState<Record<string,string>>({}), [failure,setFailure] = useState(""), [busy,setBusy] = useState(false);
  const lock = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (lock.current) return;
    const next = { ...(!login.trim() && { login: "Введите логин" }), ...(!password && { password: "Введите пароль" }) };
    setErrors(next); setFailure(""); if (Object.keys(next).length) { document.getElementById(next.login ? "login" : "password")?.focus(); return; }
    lock.current = true; setBusy(true);
    try {
      await api("/api/login", {login:login.trim(),password});
      const destination = new URLSearchParams(location.search).get("next") || "/";
      location.replace(returnPath(destination + (!destination.includes("#") ? location.hash : "")));
    }
    catch (error) { setFailure((error as Error).message); setErrors((error as APIError).fields || {}); lock.current = false; setBusy(false); }
  }
  function selectDemo(account:{login:string}) {
    setLogin(account.login);
    setPassword("");
    setShow(false);
    setErrors({});
    setFailure("");
    document.getElementById("password")?.focus();
  }
  return <div className="login-page">
    <section className="login-story">
      <CampusGallery/>
      <Brand/>
      <div className="gate-caption"><h1>Личный кабинет <br/>студента</h1><p>Российский экономический университет<br/>имени Г. В. Плеханова</p></div>
    </section>
    <section className="login-panel">
      <div className="login-mobile-brand"><Brand/></div>
      <div className="login-form-wrap">
        {/* Официальную символику вуза использовать нельзя: правила конкурса
            прямо это запрещают, а знак может быть товарным знаком. Вместо него
            собственная подпись: название университета словами — его
            использовать можно — и прямая пометка, что это конкурсный концепт. */}
        <p className="gate-signature"><b>РЭУ им. Г. В. Плеханова</b><span>Студенческий концепт для конкурса. Не официальный сервис университета.</span></p>
        <h2>Вход в кабинет</h2>
        {universityLogin && <div className="sso-gate">
          <p>{sources?.identity.detail}</p>
          {sources?.identity.ready
            ? <a className="button primary full" href={"/api/auth/oidc/start?next=" + encodeURIComponent(new URLSearchParams(location.search).get("next") || "/")}>Войти через РЭУ<ArrowRight size={18}/></a>
            : <p className="inline-error" role="alert">{sources?.identity.problem}</p>}
        </div>}
        {!universityLogin && <div className="demo-accounts login-picker">
          <strong>Выберите профиль</strong>
          <div className="demo-account-list">
            {demoAccounts.map(account =>
              <button key={account.login} type="button" className="demo-account" aria-pressed={login===account.login}
                onClick={()=>selectDemo(account)} disabled={busy}>
                <span className={"avatar " + account.color}>{account.initials}</span>
                <span><b>{account.name} · {account.login}</b><small>{account.field}</small></span>
              </button>
            )}
          </div>
          <p className="picker-hint">Выберите профиль и введите пароль из материалов к работе.</p>
        </div>}

{!universityLogin && <form onSubmit={submit} noValidate><div className="field"><label htmlFor="login">Логин</label><input id="login" name="login" autoComplete="username" value={login} onChange={e => setLogin(e.target.value)} placeholder="Введите логин" aria-invalid={!!errors.login} aria-describedby={errors.login ? "login-error" : undefined} required disabled={busy}/>{errors.login && <span id="login-error" className="field-error">{errors.login}</span>}</div><div className="field"><label htmlFor="password">Пароль</label><div className="password-field"><input id="password" name="password" type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Введите пароль «Орбиты»" aria-invalid={!!errors.password} aria-describedby={errors.password ? "password-error" : undefined} required disabled={busy}/><button type="button" className="password-toggle" onClick={() => setShow(v => !v)} aria-label={show ? "Скрыть пароль" : "Показать пароль"}>{show ? <EyeOff size={19}/> : <Eye size={19}/>}</button></div>{errors.password && <span id="password-error" className="field-error">{errors.password}</span>}</div>{failure && <p className="inline-error" role="alert">{failure}</p>}<button className="button primary full" disabled={busy} type="submit">{busy ? <><span className="spinner small"/>Входим…</> : <>Войти в кабинет<ArrowRight size={18}/></>}</button></form>}
          {!universityLogin && <p className="shared-demo-note">Профили открыты для совместного просмотра. Не указывайте персональные данные в обращениях.</p>}
        <a className="public-entry" href="/timetable"><CalendarDays size={17} aria-hidden="true"/><span><b>Расписание своей группы без входа</b><small>Живые данные РЭУ для любой из 1074 групп</small></span><ArrowRight size={17} aria-hidden="true"/></a>
        <p className="concept-note">{sources ? sources.identity.detail : "Вход по паролю «Орбиты»."} {!universityLogin && <>Для университетской учётной записи откройте <a href="https://student.rea.ru/" target="_blank" rel="noopener noreferrer">личный кабинет РЭУ<ArrowUpRight className="link-arrow" size={14} aria-hidden="true"/></a>.</>}</p>
      </div>
    </section>
  </div>;
}

export default function Dashboard({ route: initialRoute }: {route: string}) {
  const {route, address} = usePortalRoute(initialRoute);
  // Прежний выключатель анимации снят; сохранённое значение стирается,
  // чтобы у включавших его движение не осталось выключенным навсегда.
  useEffect(()=>{try{localStorage.removeItem("orbita-calm");}catch{/* Хранилище недоступно в приватном режиме — стирать нечего. */}},[]);
  const [data,setData] = useState<Overview | null>(null), [failure,setFailure] = useState(""), [loading,setLoading] = useState(true), [logoutBusy,setLogoutBusy] = useState(false), [toast,setToast] = useState("");
  const section = NAV.find(n => n.href === "/" ? route === "/" : route.startsWith(n.href));
  const unread = data?.notifications.filter(n => !n.read).length || 0;
  async function load() { setLoading(true);setFailure(""); try {setData(await api<Overview>("/api/overview"));}catch(e){setFailure((e as Error).message);}finally{setLoading(false);} }
  async function refresh() { try {setData(await api<Overview>("/api/overview"));}catch(e){setToast((e as Error).message);} }
  useEffect(() => { if (!PUBLIC_ROUTES.includes(initialRoute)) void load(); }, [initialRoute]);
  useEffect(() => {
    if (!data) return;
    const paths = ["/api/requests?page=1", "/api/plan"];
    void Promise.allSettled(paths.map(path => api(path)));
    void preloadGroups().catch(() => {});
    for (const item of data.requests) void api("/api/requests/"+encodeURIComponent(item.id)).catch(()=>{});
  }, [data?.student.id, data?.demo.today]);
  useEffect(() => {
    if (data && !cached("/api/overview")) void refresh();
  }, [address]);
  useEffect(() => {
    if (PUBLIC_ROUTES.includes(initialRoute)) return;
    const check = () => { if (document.visibilityState==="visible" && !cached("/api/overview")) void refresh(); };
    const timer = window.setInterval(check, 65000);
    document.addEventListener("visibilitychange", check);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", check); };
  }, [initialRoute]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 7000); return () => clearTimeout(timer); }, [toast]);
  async function logout() { if (logoutBusy) return; setLogoutBusy(true); try { await api("/api/logout", {}); location.replace("/login"); } catch (e) { setToast((e as Error).message); setLogoutBusy(false); } }
  if (route === "/timetable") return <PublicTimetable/>;
  if (route === "/login") return <Login/>;
  const student=data?.student;
  const activeTab = data ? new URLSearchParams(window.location.search).get("tab") : null;
  const universityPage = route === "/vibe" || (route === "/schedule" && activeTab === "groups") || (route === "/notifications" && activeTab === "university");
  return <><a className="skip-link" href="#main">К содержимому</a><div className="app-shell"><header className="app-header">
    <Brand/>
    <nav className="desktop-nav" aria-label="Основная навигация">
      {NAV.map(({href,label,icon: Icon}) => <a key={href} href={href} aria-current={!universityPage && section?.href===href?"page":undefined}>
        <Icon size={18} aria-hidden="true"/>{label}{href==="/notifications" && unread>0 && <span>{unread}</span>}
      </a>)}
      <div className="campus-nav-group"><p>Университет</p>
        {UNIVERSITY_NAV.map(({href,label,icon:Icon})=><a key={href} href={href}
          aria-current={universityPage && address.split("#")[0]===href?"page":undefined}><Icon size={18} aria-hidden="true"/>{label}</a>)}
      </div>
    </nav>
    <div className="header-account">
      {student && <a href="/profile" className="header-profile" aria-label="Открыть профиль">
        <Monogram first={student.firstName} last={student.lastName} size="sm" onNavy/>
        <span><b>{student.firstName} {student.lastName}</b><small>{student.group}</small></span></a>}
      <button className="icon-button" onClick={logout} disabled={logoutBusy} aria-label="Выйти из кабинета"><LogOut size={17}/></button>
      <MobileMenu links={UNIVERSITY_NAV} address={address} logout={logout} busy={logoutBusy}/>
    </div>
  </header><div className="workspace">
  <main id="main" className="main-content" tabIndex={-1}>{loading ? <Loading/> : failure ? <Failure message={failure} retry={load}/> : data && <div className="route-surface" key={address}>{route === "/" ? <Today data={data}/> : route === "/schedule" ? <ScheduleArea demo={data.demo} period={data.period} homework={data.homework}/> : route === "/grades" ? <Grades data={data}/> : route === "/requests/new" ? <NewRequest student={data.student}/> : route.startsWith("/requests/") ? <RequestDetail id={route.split("/")[2]}/> : route === "/requests" ? <Requests/> : route === "/notifications" ? <NotificationArea notices={data.notifications} refresh={refresh} notify={setToast}/> : route === "/vibe" ? <><PageTitle eyebrow="Университет" title="Вайб Плехановки" subtitle="Кампус глазами студента: корпуса вечером, исторический зал, двор, праздники и люди."/><VibeGallery/></> : route === "/profile" ? <Profile student={data.student} logout={logout} busy={logoutBusy} sources={data.sources} groupProfile={data.groupProfile} onGroupSaved={groupProfile => setData(previous => previous && ({...previous, groupProfile}))}/> : <Empty icon={CircleHelp} title="Такой страницы нет" text="Возможно, ссылка изменилась. Перейдите на главную страницу." action={<a href="/" className="button primary">На главную</a>}/>}</div>}<footer className="page-footer">Орбита · Независимый студенческий портал для РЭУ им. Г. В. Плеханова.<div className="footer-links"><a href="https://www.rea.ru/" target="_blank" rel="noopener noreferrer">Официальный сайт РЭУ<ArrowUpRight className="link-arrow" size={14} aria-hidden="true"/></a><a href="https://student.rea.ru/" target="_blank" rel="noopener noreferrer">Личный кабинет РЭУ<ArrowUpRight className="link-arrow" size={14} aria-hidden="true"/></a><a href="https://rasp.rea.ru/" target="_blank" rel="noopener noreferrer">Официальное расписание<ArrowUpRight className="link-arrow" size={14} aria-hidden="true"/></a></div></footer></main></div></div><nav className="mobile-nav" aria-label="Мобильная навигация">{NAV.map(({href,label,icon: Icon}) => <a key={href} href={href} className={section?.href === href ? "active" : ""} aria-current={section?.href === href ? "page" : undefined}><span className="mobile-nav-icon"><Icon size={19} aria-hidden="true"/>{href === "/notifications" && unread>0 && <span className="mobile-nav-count" aria-label={unread+" непрочитанных"}>{unread>99?"99+":unread}</span>}</span><small>{label === "Успеваемость" ? "Учёба" : label === "Уведомления" ? "Новости" : label}</small></a>)}</nav>{toast && <div className="toast" role="status">{toast}<button onClick={() => setToast("")} aria-label="Закрыть сообщение"><X size={17}/></button></div>}</>;
}

function LessonList({items,homework,notes,target}: {items:Lesson[];homework:Record<string,IssuedHomework>;notes:import("./TaskEditor").PersonalTask[];target:string}) {
  return <LessonSlots items={items} renderLesson={(item,shared)=>
    <LessonCard key={item.id} item={item} shared={shared} homework={homework[item.id]}
      note={notes.find(entry=>entry.lessonId===item.id)} targeted={item.id===target}/>}/>;
}

function LessonCard({item, targeted, shared, homework, note}: {
  item:Lesson; targeted:boolean; shared?:SharedLesson; homework?:IssuedHomework; note?:import("./TaskEditor").PersonalTask;
}) {
  const taskUrl = "/?task=homework&lesson="+encodeURIComponent(item.id)+"&date="+item.date+"&subject="+encodeURIComponent(item.subject)+"#week-plan-title";
  return <article className={`lesson-card ${shared ? "split-lesson" : ""} ${item.status === "Отменено" ? "cancelled" : ""}`}
    id={`lesson-${item.id}`} tabIndex={targeted ? -1 : undefined}>
    {!shared && <div className="lesson-time"><strong>{item.start}</strong><span>{item.end}</span></div>}
    <div className="lesson-content">
      <div className="lesson-top">
        {item.subgroup && <Badge tone="purple">Подгруппа {item.subgroup}</Badge>}
        {!shared?.kind && <span className="lesson-kind">{item.kind}</span>}
        {item.status !== "Обычное" && <Badge tone={statusClass(item.status)}>{item.status}</Badge>}
      </div>
      {!shared?.subject && <h3>{item.subject}</h3>}
      <div className="lesson-meta">
        <span><MapPin size={13} aria-hidden="true"/><span>{item.oldRoom && <del>{item.oldRoom}</del>}{item.room}</span></span>
        <span><UserRound size={13} aria-hidden="true"/><span>{item.teacher || "Преподаватель не указан в источнике"}</span></span>
      </div>
      {item.note && item.note!=="Подгруппа "+item.subgroup && <p className="lesson-note">{item.note}</p>}
      <div className="lesson-actions">
        <details className="lesson-homework">
          <summary>Домашнее задание{homework?" · опубликовано":note?" · записано":""}</summary>
          {homework ? <><p>{homework.assignment}</p><small>{homework.author}{homework.due && " · До "+fmtDate(homework.due)}</small></>
            : <p>Задание преподавателя уточняйте в электронной среде курса.</p>}
          {note && <p><b>Моя запись</b> · {note.details||note.title}{note.due && " · До "+fmtDate(note.due)}</p>}
          <div><a href={homework?.sourceUrl || "https://study.rea.ru/"} target="_blank" rel="noopener noreferrer">Открыть курс РЭУ<ArrowUpRight className="link-arrow" size={14} aria-hidden="true"/></a>
            <a href={taskUrl}>{note?"Изменить запись":"Записать в мой план"}</a></div>
        </details>
        {item.sourceLessonUrl && <a className="lesson-source" href={item.sourceLessonUrl} target="_blank" rel="noopener noreferrer">Карточка занятия РЭУ<ArrowUpRight className="link-arrow" size={14} aria-hidden="true"/></a>}
      </div>
    </div>
  </article>;
}

function Today({ data }: {data: Overview}) {
  const {student,demo}=data;
  const today=data.lessons.filter(l=>l.date===demo.today).sort((a,b)=>a.start.localeCompare(b.start));
  const [liveDay,setLiveDay]=useState<{date:string;lessons:Lesson[]}|null>(null);
  useEffect(()=>{
    if(data.scheduleCovered) return;
    let active=true;
    api<TimetablePage>(scheduleKey(demo.today,"day")+"&live=1").then(sheet=>{
      if(active && sheet.covered) setLiveDay({date:demo.today,lessons:sheet.lessons});
    }).catch(()=>{});
    return ()=>{active=false;};
  },[demo.today,data.scheduleCovered]);
  const event=data.events.filter(e=>e.date>=demo.today).sort((a,b)=>a.date.localeCompare(b.date))[0];
  const request=data.requests[0], unread=data.notifications.filter(n=>!n.read).length;
  const links=[
    {k:"Ближайший срок",v:event?event.title:"Предстоящих событий нет",s:event?fmtDate(event.date)+(event.time?" · "+event.time:""):"Успеваемость",url:"/grades"},
    {k:"Последняя заявка",v:request?request.type:"Заявок пока нет",s:request?request.status:"Создать обращение",url:request?"/requests/"+request.id:"/requests/new"},
    {k:"Почта деканата",v:"Уведомления",s:unread?"Непрочитанных: "+unread:"Все прочитаны",url:"/notifications"},
    {k:"Жизнь университета",v:"Объявления РЭУ",s:"События и конкурсы",url:"/notifications?tab=university"}
  ];
  return <><DayAtlas covered={data.scheduleCovered || liveDay?.date===demo.today} nextLesson={data.nextLesson} lessons={liveDay?.date===demo.today?liveDay.lessons:today} date={demo.today} now={demo.now} name={student.firstName+" "+student.lastName} group={student.group}/>
    <div className="atlas-lower"><WeekPlan lessons={data.period.lessons}/><section className="atlas-index"><header><h2>В деканате</h2><a href="/requests/new">Подать заявку<ArrowUpRight className="link-arrow" size={14} aria-hidden="true"/></a></header>{links.map(x=><a className="index-line" key={x.k} href={x.url}><div><small>{x.k}</small><strong>{x.v}</strong></div><span>{x.s}<ArrowUpRight className="link-arrow" size={14} aria-hidden="true"/></span></a>)}</section></div></>;
}

type ScheduleProps={demo:Demo;period:TimetablePage;homework:Record<string,IssuedHomework>};
function ScheduleArea(props:ScheduleProps) {
  const official = new URLSearchParams(window.location.search).get("tab")==="groups";
  if (!official) return <Schedule {...props}/>;
  // Ссылка «назад» стоит над заголовком — так же, как на странице заявки
  return <><CampusBackLink href="/schedule">Мои занятия</CampusBackLink><PageTitle title="Группы РЭУ" subtitle="Выберите группу — «Орбита» покажет её живое расписание из РЭУ."/><GroupDirectory/></>;
}

function NotificationArea(props: {notices:Notice[]; refresh:()=>Promise<void>; notify:(message:string)=>void}) {
  const official = new URLSearchParams(window.location.search).get("tab")==="university";
  if (!official) return <Notifications {...props}/>;
  return <><CampusBackLink href="/notifications">Личные уведомления</CampusBackLink><PageTitle title="Объявления РЭУ" subtitle="Подборка из афиши и новостей университета на 11 ноября 2026 года."/><UniversityNews/></>;
}

type TimetablePage = {date:string; view:"day"|"week"; lessons:Lesson[]; covered:boolean; group:string; from:string; to:string; sourceUrl:string; capturedAt:string};
function scheduleKey(date:string, view:string) {
  return "/api/schedule?date=" + encodeURIComponent(date) + "&view=" + view;
}
function Schedule({demo,period,homework}:ScheduleProps) {
  const params=new URLSearchParams(location.search);
  const requested=params.get("date") || "";
  const initialDate=/^\d{4}-\d{2}-\d{2}$/.test(requested) && !Number.isNaN(Date.parse(requested)) ? requested : demo.today;
  const initialView=params.get("view")==="week" ? "week" : "day";
  const [date,setDate]=useState(initialDate),[view,setView]=useState<"day"|"week">(initialView);
  const weekStart=monday(date), weekEnd=shiftDate(weekStart,6);
  const [remote,setRemote]=useState<Record<string,TimetablePage>>({});
  const [error,setError]=useState("");
  const remoteWeek=remote[weekStart];
  const source=remoteWeek || period;
  const from=view==="day"?date:weekStart, to=view==="day"?date:weekEnd;
  const covered=source.covered && source.from<=from && source.to>=to;
  const sheet={...source,date,view,covered,lessons:source.lessons.filter(item=>item.date>=from && item.date<=to)};
  const [notes,setNotes]=useState<import("./TaskEditor").PersonalTask[]>(()=>cached<{personal:import("./TaskEditor").PersonalTask[]}>("/api/plan")?.personal || []);
  useEffect(()=>{let active=true;api<{personal:import("./TaskEditor").PersonalTask[]}>("/api/plan").then(plan=>{if(active)setNotes(plan.personal);}).catch(()=>{});return ()=>{active=false;};},[]);
  const items=sheet?.lessons;
  const [targetLesson,setTargetLesson]=useState("");
  const generation=useRef(0);
  useEffect(()=>{
    const query=new URLSearchParams(location.search),selected=query.get("date");
    if(selected===initialDate)setDate(initialDate);
    if(query.get("view")==="week")setView("week");
    let hash="";
    try {hash=location.hash.startsWith("#lesson-")?decodeURIComponent(location.hash.slice(8)):"";}catch{/* Ignore a malformed fragment while preserving schedule navigation. */}
    setTargetLesson(query.get("lesson")||hash);
  },[]);
  async function load(checkLive=true) {
    if(!checkLive)return;
    const current=++generation.current;
    setError("");
    try {
      const result=await api<TimetablePage>(scheduleKey(weekStart,"week")+"&live=1");
      if(current===generation.current)setRemote(previous=>({...previous,[weekStart]:result}));
    }catch(err){
      // Ход сверки на странице больше не показывается, поэтому отказ источника
      // уходит в консоль: страница остаётся на сохранённом снимке, а причина
      // не теряется. Молча глотать ошибку нельзя — так не отличить отказ РЭУ
      // от недели, которой просто нет в снимке.
      console.error("orbit_live_schedule_failed", (err as Error).message);
    }
  }
  useEffect(()=>{
    // Текущую неделю сверяем с РЭУ всегда, даже если она есть в снимке:
    // именно в ней случаются переносы и отмены, а ответ источника кешируется
    // на 15 минут, так что лишней нагрузки на университет это не даёт.
    const thisWeek=monday(demo.today)===weekStart;
    if((!covered || thisWeek) && Math.abs(Date.parse(date)-Date.parse(demo.today))<=120*86400000)void load();
    return ()=>{generation.current++;};
  },[weekStart,covered]);
  useEffect(()=>{
    const url=new URL(location.href);
    url.searchParams.set("date",date);url.searchParams.set("view",view);
    if(url.pathname==="/schedule") history.replaceState(history.state,"",url.pathname+url.search+url.hash);
  },[date,view]);
  useEffect(()=>{
    if(!targetLesson || !items?.some(item=>item.id===targetLesson))return;
    const element=document.getElementById(`lesson-${targetLesson}`);
    if(element){element.scrollIntoView({block:"center",behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});element.focus({preventScroll:true});}
  },[items,targetLesson]);
  const start=monday(date),days=Array.from({length:7},(_,i)=>shiftDate(start,i));
  const sorted=(items||[]).slice().sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));
  return <><PageTitle title="Расписание" subtitle={`${fmtDate(start)} — ${fmtDate(shiftDate(start,6),{day:"numeric",month:"long",year:"numeric"})} · московское время`}/><div className="schedule-toolbar"><div className="segmented" aria-label="Вид расписания"><button className={view==="day"?"selected":""} onClick={()=>setView("day")} aria-pressed={view==="day"}>День</button><button className={view==="week"?"selected":""} onClick={()=>setView("week")} aria-pressed={view==="week"}>Неделя</button></div><div className="date-nav" role="group" aria-label="Выбор даты"><button type="button" onClick={()=>setDate(shiftDate(date,view==="day"?-1:-7))} aria-label={view==="day"?"Предыдущий день":"Предыдущая неделя"}><ChevronLeft size={18}/></button><label className="date-field" onClick={event=>{const picker=event.currentTarget.querySelector("input");try{picker?.showPicker?.();}catch{/* rationale: showPicker запрещён без жеста пользователя и есть не во всех браузерах — тогда дату правят с клавиатуры */}}}><span className="visually-hidden">Выбрать дату</span><CalendarDays size={16} aria-hidden="true"/><input type="date" value={date} onInput={e=>{if(e.currentTarget.value)setDate(e.currentTarget.value);}} onChange={e=>{if(e.target.value)setDate(e.target.value);}}/></label><button type="button" onClick={()=>setDate(shiftDate(date,view==="day"?1:7))} aria-label={view==="day"?"Следующий день":"Следующая неделя"}><ChevronRight size={18}/></button></div><button className="button secondary today-button" onClick={()=>setDate(demo.today)} disabled={date===demo.today} aria-label={date===demo.today?"Открыт сегодняшний день":"Перейти к сегодняшнему дню"}>Сегодня</button></div><div className="week-strip" role="group" style={{"--chosen":days.indexOf(date)} as CSSProperties} aria-label="Дни выбранной недели">{days.map(day=><button key={day} onClick={()=>setDate(day)} className={`${day===date?"selected":""} ${day===demo.today?"is-today":""}`} aria-pressed={day===date} aria-label={fmtDate(day,{weekday:"long",day:"numeric",month:"long"})}><span>{fmtDate(day,{weekday:"short"})}</span><strong>{fmtDate(day,{day:"numeric"})}</strong>{day===demo.today&&<i/>}</button>)}</div>{error?<Failure message={error} retry={()=>void load()}/>:!items?<Loading/>:!sheet?.covered?<section className="card"><h2>За этот период нет сохранённого расписания</h2><p>Проверенный период: {sheet && fmtDate(sheet.from)} — {sheet && fmtDate(sheet.to)}. Откройте оригинал расписания на сайте РЭУ.</p></section>:view==="day"?<section className="card schedule-reveal" key={date}><div className="section-heading"><h2>{fmtDate(date,{weekday:"long",day:"numeric",month:"long"})}</h2><span className="muted tiny">{sorted.length} {plural(sorted.length,"занятие","занятия","занятий")}</span></div>{sorted.length?<LessonList items={sorted} homework={homework} notes={notes} target={targetLesson}/>:<Empty icon={CalendarDays} title="День без занятий" text="В опубликованном расписании группы на этот день занятий нет."/>}</section>:<div className="week-lessons schedule-reveal" key={start}>{days.map(day=><section className={`card week-day ${day===date?"focused-day":""}`} key={day}><div className="section-heading"><h2>{fmtDate(day,{weekday:"long",day:"numeric",month:"long"})}</h2>{day===demo.today&&<Badge tone="green">Сегодня</Badge>}</div>{sorted.some(i=>i.date===day)?<LessonList items={sorted.filter(i=>i.date===day)} homework={homework} notes={notes} target={targetLesson}/>:<p className="free-day">Занятий нет.</p>}</section>)}</div>}</>;
}

function Grades({data}: {data:Overview}) {
  const moments:EventItem[]=[...data.events];
  for(const grade of data.grades){
    if(!grade.nextDate || moments.some(event=>event.date===grade.nextDate && event.subject===grade.subject))continue;
    moments.push({id:grade.id,title:(grade.nextKind || "Контроль")+" · "+grade.subject,date:grade.nextDate,subject:grade.subject});
  }
  const currentTime=new Date(data.demo.now).toLocaleTimeString("ru-RU",{timeZone:"Europe/Moscow",hour:"2-digit",minute:"2-digit"});
  const nextEvent=moments.filter(event=>event.date>data.demo.today || (event.date===data.demo.today && (!event.time || event.time>=currentTime)))
    .sort((a,b)=>(a.date+(a.time||"")).localeCompare(b.date+(b.time||"")))[0];
  return <Gradebook grades={data.grades} semester={data.student.semester} event={nextEvent} source={data.sources?.grades}/>;
}

function Requests() {
  const [items,setItems] = useState<RequestItem[] | null>(()=>cached<{requests:RequestItem[]}>("/api/requests?page=1")?.requests ?? null),[error,setError] = useState(""),[total,setTotal]=useState(0),[page,setPage]=useState(0),[hasMore,setHasMore]=useState(false),[busy,setBusy]=useState(false);
  const lock=useRef(false),failedPage=useRef(1);
  async function load(targetPage=1) {
    if(lock.current)return;
    lock.current=true;setBusy(true);setError("");failedPage.current=targetPage;
    try {
      const data=await api<{requests:RequestItem[];page:number;pageSize:number;total:number;hasMore:boolean}>(`/api/requests?page=${targetPage}`);
      setItems(previous=>targetPage===1?data.requests:[...(previous||[]),...data.requests.filter(item=>!(previous||[]).some(existing=>existing.id===item.id))]);
      setPage(data.page||targetPage);setTotal(data.total??data.requests.length);setHasMore(!!data.hasMore);
    }catch(e){setError((e as Error).message);}finally{lock.current=false;setBusy(false);}
  }
  useEffect(() => { load(1); }, []);
  /* Порядок блоков идёт от задачи студента к справке: сначала быстрое
     создание обращения, затем собственные заявки, и только после них —
     справочник услуг РЭУ. Раньше свой список оказывался в самом низу,
     под двумя справочными блоками. */
  const create = <a href="/requests/new" className="button primary"><Plus size={18} aria-hidden="true"/>Создать заявку</a>;
  const quickActions: [string, string, typeof FileText][] = [
    ["Справка с места учёбы", "Подтвердить обучение", FileText],
    ["Заявление свободной формы", "Подать заявление", BookOpen],
    ["Вопрос по учёбе", "Задать вопрос", CircleHelp],
  ];
  return <>
    <PageTitle title="Заявки и справки" subtitle="Обращения вашей учётной записи и история их статусов." action={create}/>

    <div className="service-choices" aria-label="Быстрые действия">
      {quickActions.map(([type, label, ServiceIcon]) =>
        <a key={type} href={`/requests/new?type=${encodeURIComponent(type)}`}>
          <ServiceIcon size={20} aria-hidden="true"/><span>{label}</span><ArrowRight size={17} aria-hidden="true"/>
        </a>
      )}
    </div>

    {error && <Failure message={error} retry={() => load(failedPage.current)}/>}

    {!items && !error ? <Loading/> : items?.length === 0 ?
      <Empty icon={FileText} title="Пока без заявок" text="Нужна справка или есть вопрос по учёбе? Начните с нового обращения." action={create}/>
    : items && <section className="requests-section" aria-label="Мои обращения">
        <div className="section-heading">
          <h2>Мои обращения</h2>
          <span className="requests-count">Показано {items.length} из {total}</span>
        </div>
        <div className="requests-list">{items.map(item =>
          <a className="request-card card" href={`/requests/${item.id}`} key={item.id}>
            <span className="icon-tile purple"><FileText size={21} aria-hidden="true"/></span>
            <div className="request-card-body">
              <span className="meta">№ {requestNumber(item.id)} · {fmtDate(item.createdAt)}</span>
              <h3>{item.type}</h3>
              <p>{item.message}</p>
            </div>
            <Badge tone={statusClass(item.status)}>{item.status}</Badge>
            <ChevronRight size={20} aria-hidden="true"/>
          </a>
        )}</div>
        {hasMore && !error && <div className="requests-pagination"><button className="button secondary" onClick={() => load(page+1)} disabled={busy}>{busy ? "Загружаем…" : "Показать ещё"}</button></div>}
      </section>}

    <ServiceCatalogue/>
    <div className="notice-strip"><CircleHelp size={19} aria-hidden="true"/><span>Здесь хранятся обращения вашей учётной записи. Официальную заявку в вуз можно подать через ЛКС РЭУ.</span></div>
  </>;
}

function NewRequest({student}: {student: Student}) {
  const [type,setType] = useState(""),[message,setMessage] = useState(""),[errors,setErrors] = useState<Record<string,string>>({}),[error,setError] = useState(""),[busy,setBusy] = useState(false),[created,setCreated] = useState<RequestItem | null>(null);
  const lock = useRef(false),key = useRef("");
  useEffect(()=>{
    const query=new URLSearchParams(location.search),selected=query.get("type"),subject=query.get("subject")?.trim().slice(0,120);
    if(selected && TYPES.includes(selected))setType(selected);
    if(selected==="Вопрос по учёбе" && subject)setMessage(`Вопрос по дисциплине «${subject}»: `);
  },[]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (lock.current) return;
    const next = {...(!type && {type: "Выберите тип обращения"}), ...(message.trim().length < 10 && {message: "Опишите обращение — не менее 10 символов"})};
    setErrors(next);setError(""); if (Object.keys(next).length) { document.getElementById(next.type ? "request-type" : "request-message")?.focus(); return; }
    if (!key.current) key.current = crypto.randomUUID();
    lock.current = true;setBusy(true);
    try { const data = await api<{request: RequestItem}>("/api/requests",{type,message:message.trim(),idempotencyKey:key.current}); setCreated(data.request); }
    catch(e) {setError((e as Error).message);setErrors((e as APIError).fields || {});lock.current=false;}
    finally {setBusy(false);}
  }
  if (created) return <><PageTitle title="Заявка сохранена" subtitle="Обращение доступно в списке заявок."/><section className="success-card card"><Badge tone="green">Принята</Badge><h2>Обращение сохранено</h2><p>Заявка № {requestNumber(created.id)} доступна в личном кабинете.<br/>Для подачи в университет используйте ЛКС РЭУ.</p><a className="button primary" href={`/requests/${created.id}`}>Открыть заявку<ArrowRight size={18}/></a><a className="text-link" href="/requests">Ко всем заявкам</a></section></>;
  return <><a href="/requests" className="back-link"><ArrowLeft size={17}/>Все заявки</a><PageTitle title="Новое обращение" subtitle="Выберите тип и опишите обращение."/><div className="form-layout"><form className="card request-form" onSubmit={submit} noValidate><div className="form-person"><span className="avatar lilac">{student.firstName[0]}{student.lastName[0]}</span><div><b>{student.firstName} {student.lastName}</b><small>{student.group} · данные подставлены из профиля</small></div></div><div className="field"><label htmlFor="request-type">Что вам нужно?</label><select id="request-type" value={type} onChange={e => setType(e.target.value)} aria-invalid={!!errors.type} aria-describedby={errors.type ? "type-error" : "type-hint"} required disabled={busy}><option value="">Выберите тип обращения</option>{TYPES.map(t => <option key={t}>{t}</option>)}</select>{errors.type ? <span className="field-error" id="type-error">{errors.type}</span> : <span className="field-hint" id="type-hint">Выберите самый подходящий вариант.</span>}</div><RequestGuidance name={type}/><div className="field"><label htmlFor="request-message">Комментарий к обращению</label><textarea id="request-message" value={message} onChange={e => setMessage(e.target.value)} placeholder="Например: нужна справка об обучении для участия в учебном конкурсе." rows={6} minLength={10} maxLength={2000} required disabled={busy} aria-invalid={!!errors.message} aria-describedby={errors.message ? "message-error" : "message-hint"}/><div className="field-bottom">{errors.message ? <span className="field-error" id="message-error">{errors.message}</span> : <span className="field-hint" id="message-hint">От 10 до 2 000 символов. Без персональных данных.</span>}<span>{message.length}/2000</span></div></div>{error && <p className="inline-error" role="alert">{error}</p>}<div className="form-actions"><button className="button primary" disabled={busy}>{busy ? <><span className="spinner small"/>Сохраняем…</> : <>Создать заявку<ArrowRight size={18}/></>}</button><a href="/requests" className="button ghost">Отмена</a></div></form><aside className="form-aside"><h2>Подача в деканат</h2><p>В «Орбите» обращение сохраняется в вашем профиле. Для официальной подачи откройте <a className="text-link" href="https://student.rea.ru/" target="_blank" rel="noopener noreferrer">ЛКС РЭУ<ArrowUpRight className="link-arrow" size={14} aria-hidden="true"/></a>.</p><p>Новые заявки не обрабатываются автоматически. Историю можно открыть в разделе «Заявки».</p><div className="aside-divider"/><p className="shared-demo-note">Профиль общий. Не указывайте персональные данные.</p></aside></div></>;
}

function RequestDetail({id}: {id:string}) {
  const [item,setItem] = useState<RequestItem | null>(()=>cached<{request:RequestItem}>("/api/requests/"+encodeURIComponent(id))?.request ?? null),[error,setError] = useState("");
  async function load() { setError(""); try { const data = await api<{request:RequestItem}>(`/api/requests/${encodeURIComponent(id)}`);setItem(data.request); }catch(e){setError((e as Error).message);} }
  useEffect(()=>{load();},[id]);
  return <><a className="back-link" href="/requests"><ArrowLeft size={17}/>Все заявки</a>{error ? <Failure message={error} retry={load}/> : !item ? <Loading/> : <><PageTitle eyebrow={`ОБРАЩЕНИЕ № ${requestNumber(item.id)}`} title={item.type} subtitle={`Создано ${fmtDate(item.createdAt, {day:"numeric",month:"long",year:"numeric"})}`} action={<Badge tone={statusClass(item.status)}>{item.status}</Badge>}/><div className="detail-layout"><section className="card"><div className="section-heading"><h2>Ваше обращение</h2><FileText size={20}/></div><p className="request-message">{item.message}</p><div className="notice-strip"><CircleHelp size={18}/><span>Обращение хранится в «Орбите». Подача в университет доступна через ЛКС РЭУ.</span></div></section><section className="card"><div className="section-heading"><h2>История статуса</h2></div><ol className="status-timeline">{item.history.map((entry,index)=><li key={index}><span className={`timeline-dot ${index === item.history.length-1 ? "current" : ""}`}><Check size={12}/></span><div><strong>{entry.status}</strong><time>{fmtDate(entry.at, {day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"})}</time><p>{entry.note}</p></div></li>)}</ol><p className="field-hint">История показывает, когда менялся статус обращения.</p></section></div></>}</>;
}

function Notifications({notices,refresh,notify}: {notices:Notice[];refresh:()=>Promise<void>;notify:(message:string)=>void}) {
  const [filter,setFilter]=useState("all"),[busy,setBusy]=useState("");
  const lock=useRef(false),unread=notices.filter(n=>!n.read).length;
  async function mark(id?:string){if(lock.current)return;lock.current=true;setBusy(id||"all");try{await api(id?`/api/notifications/${encodeURIComponent(id)}/read`:"/api/notifications/read-all",{});await refresh();notify(id?"Уведомление отмечено прочитанным":"Все уведомления прочитаны");}catch(e){notify((e as Error).message);}finally{lock.current=false;setBusy("");}}
  const items=filter==="unread"?notices.filter(n=>!n.read):notices;
  return <><PageTitle title="Уведомления" subtitle={unread?`${unread} ${plural(unread,"непрочитанное","непрочитанных","непрочитанных")} · новости, изменения и напоминания`:"Вы прочитали все уведомления"} action={<button className="button secondary" disabled={!unread||!!busy} onClick={()=>mark()}><CheckCheck size={18}/>{busy==="all"?"Отмечаем…":"Прочитать все"}</button>}/><div className="notification-filter"><div className="segmented"><button onClick={()=>setFilter("all")} className={filter==="all"?"selected":""} aria-pressed={filter==="all"}>Все <span>{notices.length}</span></button><button onClick={()=>setFilter("unread")} className={filter==="unread"?"selected":""} aria-pressed={filter==="unread"}>Непрочитанные <span>{unread}</span></button></div></div>{items.length?<div className="notification-list filter-results" key={filter}>{items.map(item=><article className={`card notification-card ${!item.read?"unread":""}`} key={item.id}><span className={`notification-icon icon-tile ${item.category.toLowerCase().includes("распис")?"orange":"purple"}`}>{item.category.toLowerCase().includes("распис")?<CalendarDays size={21}/>:<Bell size={21}/>}</span><div className="notification-content"><div className="notification-meta"><span>{item.category}</span><time>{fmtDate(item.date,{day:"numeric",month:"long",hour:"2-digit",minute:"2-digit"})}</time>{!item.read&&<Badge tone="purple">Новое</Badge>}</div><h2>{item.title}</h2><p>{item.text}</p><div className="notification-actions">{item.href&&<a className="text-link" href={item.href}>Перейти к событию<ArrowRight size={15}/></a>}{!item.read?<button className="text-button" disabled={!!busy} onClick={()=>mark(item.id)} aria-label={`Отметить прочитанным: ${item.title}`}><Check size={15}/>{busy===item.id?"Отмечаем…":"Отметить прочитанным"}</button>:<span className="read-label"><CheckCheck size={14}/>Прочитано</span>}</div></div></article>)}</div>:<Empty icon={filter==="unread"?CheckCheck:Bell} title={filter==="unread"?"Всё важное прочитано":"Пока без новостей"} text={filter==="unread"?"Непрочитанных уведомлений нет.":"Новые объявления и напоминания появятся здесь."} action={filter==="unread"?<button className="button secondary" onClick={()=>setFilter("all")}>Показать все уведомления</button>:<a href="/" className="button secondary">На главную</a>}/>}</>;
}

/* Карточка источников: студенту и жюри сразу видно, что в портале живое,
   а что ждёт доступа от университета. Подписи приходят с сервера. */
function SourceMap({sources}: {sources:Sources}) {
  const rows = [["Расписание", sources.schedule], ["Вход", sources.identity], ["Баллы", sources.grades]] as const;
  return <section className="card source-map"><h2>Откуда данные</h2>
    <dl>{rows.map(([title, note]) => <div key={title}>
      <dt>{title}<span className={"badge " + (note.mode === "demo" ? "orange" : "green")}>{note.mode === "demo" ? "Демонстрация" : "Данные РЭУ"}</span></dt>
      <dd><b>{note.label}</b><p>{note.detail}</p>{note.problem && <small role="alert">{note.problem}</small>}</dd>
    </div>)}</dl>
    <p className="muted tiny">Расписание уже идёт из университета. Вход и баллы переключаются на РЭУ без переделки портала — нужен только доступ от вуза.</p>
  </section>;
}

function Profile({student,logout,busy,sources,groupProfile,onGroupSaved}: {student:Student;logout:()=>void;busy:boolean;sources?:Sources;groupProfile?:GroupProfile|null;onGroupSaved:(profile:GroupProfile)=>void}) {
  const [mapOpen,setMapOpen] = useState(()=>typeof window!=="undefined" && location.hash==="#campus-map");
  const [helpOpen,setHelpOpen] = useState(false);
  function openCampus() {
    setMapOpen(true);
    requestAnimationFrame(()=>document.getElementById("profile-map")?.scrollIntoView({block:"start"}));
  }
  return <div className="profile-page"><PageTitle title="Мой профиль" subtitle={student.institute}/>
    <section className="identity-card">
      <div className="identity-photo identity-monogram"><Monogram first={student.firstName} last={student.lastName} size="lg"/></div>
      <div className="identity-body"><span className="identity-group">{student.group}</span>
        <h2>{student.lastName} {student.firstName} {student.middleName}</h2><p>{student.program}</p>
        <dl><div><dt>Курс</dt><dd>{student.course}</dd></div><div><dt>Семестр</dt><dd>{student.semester}</dd></div><div><dt>Логин</dt><dd>{student.login}</dd></div></dl>
        <div className="identity-actions">
          <a className="button primary" href="/schedule?view=week">Расписание группы <ArrowRight size={16} aria-hidden="true"/></a>
          <a className="button secondary" href="#campus-map" onClick={openCampus}><MapPin size={16} aria-hidden="true"/> Карта кампуса</a>
        </div>
      </div>
    </section>
    <section className="card profile-university" aria-labelledby="profile-university-title">
      <h2 id="profile-university-title">Университет</h2>
      <div className="profile-university-links">
        {UNIVERSITY_NAV.map(({href,label,icon:Icon})=><a key={href} href={href}>
          <Icon size={19} aria-hidden="true"/><span>{label}</span><ChevronRight size={15} aria-hidden="true"/>
        </a>)}
      </div>
    </section>
    {groupProfile && <GroupPanel group={student.group} profile={groupProfile} onSaved={onGroupSaved}/>}
    <section id="profile-map" className="profile-fold" data-open={mapOpen}>
      <button type="button" className="profile-fold-toggle" aria-expanded={mapOpen} aria-controls="profile-map-content"
        onClick={()=>setMapOpen(open=>!open)}><MapPin size={19} aria-hidden="true"/><span>Карта кампуса</span><ChevronRight size={16} aria-hidden="true"/></button>
      <div id="profile-map-content" className="profile-fold-content"><CampusMap/></div>
    </section>
    <section className="profile-fold" data-open={helpOpen}>
      <button type="button" className="profile-fold-toggle" aria-expanded={helpOpen} aria-controls="profile-help-content"
        onClick={()=>setHelpOpen(open=>!open)}><CircleHelp size={19} aria-hidden="true"/><span>Контакты и источники</span><ChevronRight size={16} aria-hidden="true"/></button>
      <div id="profile-help-content" className="profile-fold-content"><CampusContacts/>{sources && <SourceMap sources={sources}/>}</div>
    </section>
    <div className="profile-footer">
      <p>Учебная запись «Орбиты» · {student.login}</p>
      <div className="profile-actions">
        <button className="button secondary" onClick={logout} disabled={busy}><LogOut size={17} aria-hidden="true"/>Выйти</button>
      </div>
    </div></div>;
}
