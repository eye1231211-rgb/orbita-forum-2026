"use client";
import {TaskEditor, type PersonalTask, type LessonOrigin} from "./TaskEditor";
import {api, cached} from "./portal-client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";

type PlanItem = {
  key: string;
  title: string;
  description: string;
  date: string;
  href: string;
  kind: "schedule" | "event" | "assessment";
  done: boolean;
};
type Plan = { personal:PersonalTask[]; items: PlanItem[]; completed: number; total: number };
type Mark = { key: string; done: boolean };

function requestPlan(mark?: Mark) {
  return mark ? api<Plan>("/api/plan/mark", mark) : api<Plan>("/api/plan");
}

const dateLabel = (value: string) => new Date(value.length === 10 ? value + "T12:00:00+03:00" : value).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "short" });

export default function WeekPlan({lessons}:{lessons:LessonOrigin[]}) {
  const [plan, setPlan] = useState<Plan | null>(()=>cached<Plan>("/api/plan") ?? null);
  const [loading, setLoading] = useState(!cached("/api/plan"));
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const lock = useRef(false);
  const lastMark = useRef<Mark | undefined>(undefined);

  async function load() {
    if (lock.current) return;
    lock.current = true;
    setLoading(!cached("/api/plan")); setError(""); lastMark.current = undefined;
    try { setPlan(await requestPlan()); }
    catch (error) { setError((error as Error).message); }
    finally { setLoading(false); lock.current = false; }
  }

  async function mark(action: Mark) {
    // Serialize the small list so late responses cannot overwrite newer marks.
    if (lock.current) return;
    lock.current = true; setBusyKey(action.key); setError(""); lastMark.current = action;
    try {
      setPlan(await requestPlan(action));
      setAnnouncement(action.done ? "Личное действие отмечено выполненным." : "Личное действие снова в плане.");
      lastMark.current = undefined;
    } catch (error) { setError((error as Error).message); }
    finally { lock.current = false; setBusyKey(""); }
  }

  useEffect(() => { load(); }, []);

  return <section className="card week-plan" aria-labelledby="week-plan-title" aria-busy={loading}>
    {plan ? <TaskEditor plan={plan} onChange={setPlan} lessons={lessons}/> : <h2 id="week-plan-title">Мой план</h2>}
    {loading && <div className="plan-loading" role="status"><span className="spinner small"/>Загружаем личный план…</div>}
    {!loading && plan && <details className="plan-automatic"><summary>Задачи из расписания и ведомости <span>· выполнено {plan.completed} из {plan.total}</span></summary>
      {plan.items.length ? <ul className="plan-list">{plan.items.map((item, index) => {
        const descriptionId = `plan-description-${index}`;
        const titleId = `plan-title-${index}`;
        const href = item.href.startsWith("/") && !item.href.startsWith("//") ? item.href : "/";
        return <li className={`plan-row ${item.done ? "done" : ""}`} key={item.key}>
          <label className="plan-label">
            <input type="checkbox" checked={item.done} disabled={!!busyKey} onChange={event => mark({key: item.key, done: event.target.checked})} aria-labelledby={titleId} aria-describedby={descriptionId}/>
            <span className="plan-item-copy"><span className="plan-item-title" id={titleId}>{item.title}</span><span className="plan-item-description" id={descriptionId}>{item.description}</span></span>
          </label>
          <div className="plan-row-detail"><span className="plan-item-date">{busyKey === item.key ? "Сохраняем…" : item.done ? "Сделано" : dateLabel(item.date)}</span><a className="plan-detail-link" href={href} aria-label={`Детали: ${item.title}`}>Детали<ArrowUpRight size={15}/></a></div>
        </li>;
      })}</ul> : <p className="plan-empty">В плане нет предстоящих действий.</p>}
    </details>}
    {error && <div className="plan-error" role="alert"><p>{error}</p><button className="text-button" onClick={() => lastMark.current ? mark(lastMark.current) : load()} disabled={loading || !!busyKey}><RefreshCw size={14}/>Повторить</button></div>}

    <span className="visually-hidden" role="status">{announcement}</span>
  </section>;
}
