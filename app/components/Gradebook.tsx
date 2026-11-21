"use client";
import { Fragment, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { RatingGuide, ratingParts, type Rating } from "./ReuCampus";

export type Grade = {
  id: string; subject: string; status: string; result: string | null;
  updatedAt?: string; nextDate?: string; nextKind?: string; credits: number; rating: Rating | null;
};
type Assessment = { title: string; date: string; time?: string; subject?: string };
type Filter = "all" | "published" | "waiting";
const formatDate = (value: string) => new Intl.DateTimeFormat("ru-RU", {
  day: "numeric", month: "long", timeZone: "Europe/Moscow"
}).format(new Date(value.length === 10 ? value + "T12:00:00+03:00" : value));

const scoreTone = (score: number) => score >= 85 ? "high" : score >= 50 ? "middle" : "low";
function gradeTone(grade: Grade) {
  if (grade.result === "Зачёт") return "high";
  if (grade.result === "5") return "high";
  if (grade.result === "3" || grade.result === "4") return "middle";
  if (grade.result === "2" || grade.result?.toLowerCase().replaceAll("ё", "е") === "незачет") return "low";
  return grade.rating ? scoreTone(grade.rating.total) : undefined;
}

function ScoreSheet({ grade }: { grade: Grade }) {
  const { rating } = grade;
  const breakdown = rating && <dl className="sheet-parts">{ratingParts.map(([key, label, max]) =>
    <div key={key}><dt>{label}</dt><dd><b>{rating[key]}</b> / {max}</dd>
      <div className="part-track" aria-hidden="true"><i style={{width: rating[key] / max * 100 + "%"}}/></div>
    </div>)}</dl>;
  return <div className="score-sheet" key={grade.id}>
    {rating ? <>
      {rating.exam && <section className="exam-rubric"><h4>Экзаменационный билет</h4>
        <ul>{rating.exam.parts.map(part=><li key={part.label}><span>{part.label}</span><span>до <b>{part.max}</b> б.</span></li>)}</ul>
        <a href={rating.exam.source} target="_blank" rel="noopener noreferrer">Рабочая программа · стр. {rating.exam.page}<ArrowUpRight className="link-arrow" size={14} aria-hidden="true"/></a>
      </section>}
      {rating.exam ? <details className="total-breakdown"><summary>Состав итоговой оценки</summary>{breakdown}</details> : breakdown}
    </> : <div className="sheet-pending">
      <strong>{grade.result || "Ожидает результата"}</strong>
      <p>{grade.result ? "Разбивка по баллам пока недоступна." : "Баллы появятся после публикации результата."}</p>
    </div>}
    {grade.updatedAt && <p className="sheet-date">Обновлено {formatDate(grade.updatedAt)}</p>}
    {grade.nextDate && <p className="sheet-event">{grade.nextKind || "Контроль"} · {formatDate(grade.nextDate)}</p>}
  </div>;
}

export default function Gradebook({ grades, semester, event, source }: {
  grades: Grade[]; semester: number; event?: Assessment;
  // Откуда взяты баллы: учебная база «Орбиты» или ведомость университета.
  source?: {label:string; detail:string};
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string>();
  const subjectList=useRef<HTMLElement>(null);
  const eventGrade=grades.find(grade=>grade.subject===event?.subject) || grades.find(grade=>grade.nextDate && grade.nextDate===event?.date);
  function openAssessment() {
    if(!eventGrade)return;
    setFilter("all");setSelectedId(eventGrade.id);
    subjectList.current?.focus({preventScroll:true});
    subjectList.current?.scrollIntoView({block:"start",behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});
  }
  const published = grades.filter(grade => grade.result !== null).length;
  // Сводка по всем дисциплинам: средний балл считается по тем, где рейтинг
  // уже выставлен, иначе ожидающие предметы занижали бы картину.
  const scored = grades.filter(grade => grade.rating);
  const average = scored.length ? Math.round(scored.reduce((sum, grade) => sum + grade.rating!.total, 0) / scored.length) : null;
  const credits = grades.reduce((sum, grade) => sum + grade.credits, 0);
  const filters = [
    {key: "all", text: "Все", count: grades.length},
    {key: "published", text: "С результатом", count: published},
    {key: "waiting", text: "Ожидают", count: grades.length - published}
  ] as const;
  const visible = grades.filter(grade => filter === "all" || (grade.result !== null) === (filter === "published"));
  return <div className="gradebook">
    <header className="studio-title"><h1>Успеваемость</h1></header>
    <section className="semester-hero" aria-label="Сводка семестра">
      <div className="semester-count"><p>Опубликованы результаты</p>
        <div><strong>{published}</strong><span>/ {grades.length}</span></div>
        <div className="semester-meter" aria-hidden="true">{grades.map((grade, index) => <i className={index < published ? "filled" : ""} key={grade.id}/>)}</div>
        <small>Дисциплины семестра</small>
      </div>
      <div className="assessment-ticket">
        {event ? <button type="button" onClick={openAssessment} disabled={!eventGrade}>
          <span className="ticket-date">{formatDate(event.date)}{event.time && <time>{event.time} МСК</time>}</span>
          <strong>{event.title}</strong><span className="ticket-action">Контроль по предмету <ArrowUpRight size={17}/></span>
        </button> : <button type="button" onClick={()=>{setFilter(published===grades.length?"published":"waiting");subjectList.current?.focus({preventScroll:true});subjectList.current?.scrollIntoView({block:"start"});}}>
          <span className="ticket-date">{semester}-й семестр</span><strong>{published===grades.length?"Все результаты готовы":"Ещё ожидаются результаты"}</strong>
          <span className="ticket-action">Открыть дисциплины <ArrowUpRight size={17}/></span></button>}
      </div>
    </section>
    {/* Одна таблица вместо двух списков: раньше сводка и раздел «Дисциплины»
        перечисляли одни и те же предметы, и страница выходила вдвое длиннее.
        Теперь строка разворачивается и показывает разбор баллов на месте. */}
    <section ref={subjectList} tabIndex={-1} className="card grade-summary" aria-label="Дисциплины семестра">
      <div className="section-heading"><h2>Дисциплины семестра</h2>
        <div className="record-filters" aria-label="Фильтр дисциплин">{filters.map(option =>
          <button key={option.key} type="button" aria-pressed={filter === option.key}
            onClick={() => setFilter(option.key)}>{option.text} <span>{option.count}</span></button>)}</div>
      </div>
      <ul className="grade-legend" aria-label="Цвета оценок">
        <li data-grade-tone="high">5 и зачёт</li>
        <li data-grade-tone="middle">3–4</li>
        <li data-grade-tone="low">2 и незачёт</li>
        <li>Ожидает</li>
      </ul>
      <table className="grade-table">
        <colgroup><col/><col className="grade-col-score"/><col className="grade-col-mark"/><col className="grade-col-credits"/></colgroup>
        <thead><tr><th scope="col">Дисциплина</th><th scope="col" className="grade-score">Баллы</th>
          <th scope="col" className="grade-mark">Оценка</th><th scope="col" className="grade-credits">З. е.</th></tr></thead>
        <tbody className="filter-results" key={filter}>
          {visible.map(grade => <Fragment key={grade.id}>
            <tr className={selectedId === grade.id ? "is-open" : ""} data-grade-tone={gradeTone(grade)}>
              <th scope="row"><button type="button" aria-expanded={selectedId === grade.id} aria-controls={"grade-" + grade.id}
                onClick={() => setSelectedId(selectedId === grade.id ? undefined : grade.id)}>
                <span><b>{grade.subject}</b><small>{grade.status}</small></span>
                <ChevronDown size={16} aria-hidden="true"/>
              </button></th>
              <td className="grade-score">{grade.rating
                ? <><span className="grade-score-value">{grade.rating.total}<small>/100</small></span><div className="grade-bar" aria-hidden="true"><i style={{width: grade.rating.total + "%"}}/></div></>
                : <span className="grade-waiting">{grade.result ? "—" : "ожидает"}</span>}</td>
              <td className="grade-mark"><span className={`grade-result-pill ${grade.result ? "posted" : ""}`}>{grade.result === "Зачёт" ? "зачёт" : grade.result || "—"}</span></td>
              <td className="grade-credits"><span className="grade-credit-value">{grade.credits}</span><small className="grade-credit-unit">з. е.</small></td>
            </tr>
            {selectedId === grade.id && <tr className="grade-detail" id={"grade-" + grade.id} data-grade-tone={gradeTone(grade)}>
              <td colSpan={4}><ScoreSheet grade={grade}/></td></tr>}
          </Fragment>)}
          {!visible.length && <tr><td colSpan={4} className="record-empty">В этой подборке дисциплин пока нет.</td></tr>}
        </tbody>
        <tfoot><tr>
          <th scope="row">Итого за семестр</th>
          <td className="grade-score"><strong>{average !== null ? average+"/100" : "—"}</strong><small>средний балл</small></td>
          <td className="grade-mark"><strong>{published} из {grades.length}</strong><small>с результатом</small></td>
          <td className="grade-credits"><strong>{credits}</strong><small>з. е.</small></td>
        </tr></tfoot>
      </table>
    </section>
    <RatingGuide/>
    <p className="grade-source">{source ? <><b>{source.label}.</b> {source.detail}</> : "Здесь показаны баллы учебного профиля."} <a href="https://student.rea.ru/" target="_blank" rel="noopener noreferrer">Официальные результаты в ЛКС РЭУ<ArrowUpRight className="link-arrow" size={14} aria-hidden="true"/></a></p>
  </div>;
}
