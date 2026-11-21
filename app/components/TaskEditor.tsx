"use client";
import {useEffect, useRef, useState, type FormEvent} from "react";
import {ArrowUpRight, Plus, Pencil, Trash2} from "lucide-react";
import {api} from "./portal-client";

export type PersonalTask = {id:string; title:string; details:string; due:string; done:boolean; revision:number; lessonId:string; lessonDate:string};
export type LessonOrigin = {id:string; date:string; subject:string};
type Draft = Pick<PersonalTask,"id"|"title"|"details"|"due"|"revision"|"lessonId"|"lessonDate">;
const blank = (): Draft => ({id:crypto.randomUUID(),title:"",details:"",due:"",revision:0,lessonId:"",lessonDate:""});
const shortDate=(date:string)=>new Date(date+"T12:00:00+03:00").toLocaleDateString("ru-RU",{day:"numeric",month:"long",timeZone:"Europe/Moscow"});

export function TaskEditor<T extends {personal:PersonalTask[]}>({plan,onChange,lessons}:{plan:T;onChange:(plan:T)=>void;lessons:LessonOrigin[]}) {
  const [draft,setDraft]=useState<Draft|null>(null);
  const [remove,setRemove]=useState("");
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const [message,setMessage]=useState("");
  const active=useRef(false);
  const titleInput=useRef<HTMLInputElement>(null);
  useEffect(()=>{
    const params=new URLSearchParams(location.search);
    if(params.get("task")!=="homework")return;
    const id=params.get("lesson")||"",date=params.get("date")||"",subject=params.get("subject")||"";
    const fallback=/^reu-[0-9a-f]{24}$/.test(id) && /^\d{4}-\d{2}-\d{2}$/.test(date) && subject ? {id,date,subject:subject.slice(0,125)} : null;
    const lesson=lessons.find(row=>row.id===id)||fallback;
    if(!lesson)return;
    const existing=plan.personal.find(task=>task.lessonId===lesson.id);
    setDraft(existing||{...blank(),title:"ДЗ · "+lesson.subject,lessonId:lesson.id,lessonDate:lesson.date});
    document.getElementById("week-plan-title")?.scrollIntoView({block:"start"});
  },[]);
  useEffect(()=>{if(draft)titleInput.current?.focus({preventScroll:true});},[draft?.id]);
  async function change(action:string,payload:object){
    if(active.current)return;
    active.current=true;setBusy(true);setError("");
    try {
      const next=await api<T>("/api/plan/task",{...payload,action});
      onChange(next);setDraft(null);setRemove("");
      setMessage(action==="remove"?"Задача удалена":"Изменения сохранены");
    }catch(err){
      setError((err as Error).message);
      if((err as {status?:number}).status===409){
        try {onChange(await api<T>("/api/plan?refresh="+Date.now()));setDraft(null);}catch{}
      }
    }finally{active.current=false;setBusy(false);}
  }
  function submit(e:FormEvent){e.preventDefault();if(draft)void change(draft.revision?"edit":"create",draft);}
  return <div className="personal-planner">
    <div className="planner-top"><h2 id="week-plan-title">Мой план</h2><button type="button" className="button secondary" disabled={busy} onClick={()=>{setDraft(blank());setRemove("");setError("");}}><Plus size={15}/>Добавить задачу</button></div>
    {draft && <form className="task-form" onSubmit={submit}>
      <label>Название<input ref={titleInput} required maxLength={140} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
      <label>{draft.lessonId?"Домашнее задание со слов преподавателя":"Заметка"}<textarea rows={3} maxLength={1600} value={draft.details} onChange={e=>setDraft({...draft,details:e.target.value})}/></label>
      <label>Срок<input type="date" value={draft.due} onChange={e=>setDraft({...draft,due:e.target.value})}/></label>
      <div><button type="submit" className="button primary" disabled={busy||!draft.title.trim()}>Сохранить</button><button className="button ghost" type="button" disabled={busy} onClick={()=>setDraft(null)}>Отмена</button></div>
    </form>}
    {plan.personal.length?<ul className="personal-list">{plan.personal.map(task=><li key={task.id}>
      <input type="checkbox" checked={task.done} disabled={busy} aria-label={"Выполнено: "+task.title} onChange={e=>void change("mark",{id:task.id,revision:task.revision,done:e.target.checked})}/>
      <div className={task.done?"task-copy complete":"task-copy"}><b>{task.title}</b>
        {task.details && <p>{task.details}</p>}
        {task.due && <small>До {shortDate(task.due)}</small>}
        {task.lessonId && <a href={"/schedule?date="+task.lessonDate+"#lesson-"+task.lessonId}>К занятию<ArrowUpRight className="link-arrow" size={14} aria-hidden="true"/></a>}
      </div>
      <div className="task-tools"><button type="button" disabled={busy} aria-label={"Изменить: "+task.title} onClick={()=>{setError("");setRemove("");setDraft(task);}}><Pencil size={15}/></button>
        <button type="button" disabled={busy} aria-label={"Удалить: "+task.title} onClick={()=>setRemove(task.id)}><Trash2 size={15}/></button></div>
      {remove===task.id && <div className="task-confirm">Удалить задачу? <button disabled={busy} onClick={()=>void change("remove",{id:task.id,revision:task.revision})}>Удалить</button><button onClick={()=>setRemove("")}>Оставить</button></div>}
    </li>)}</ul>:!draft && <p className="planner-empty">Личных задач пока нет. Добавьте первую задачу или запишите домашнее задание из расписания.</p>}
    {error && <p role="alert" className="inline-error">{error}</p>}
    <span className="visually-hidden" role="status">{message}</span>
  </div>;
}
