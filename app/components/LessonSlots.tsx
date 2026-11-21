import type {ReactNode} from "react";

type LessonTime = {id:string; date:string; start:string; end:string; subject:string; kind:string; subgroup?:string};
export type SharedLesson = {subject?:string; kind?:string};

export function LessonSlots<T extends LessonTime>({items, renderLesson}: {
  items:T[];
  renderLesson:(item:T, shared?:SharedLesson)=>ReactNode;
}) {
  const slots: T[][] = [];
  const subgroupSlots = new Map<string,T[]>();
  for (const lesson of items) {
    const key = lesson.date+"/"+lesson.start+"/"+lesson.end;
    const existing = lesson.subgroup ? subgroupSlots.get(key) : undefined;
    if (existing) existing.push(lesson);
    else {
      const slot = [lesson];
      slots.push(slot);
      if (lesson.subgroup) subgroupSlots.set(key,slot);
    }
  }

  return <>{slots.map(slot => {
    const first = slot[0];
    if (slot.length===1) return renderLesson(first);
    const shared: SharedLesson = {
      subject: slot.every(item=>item.subject===first.subject) ? first.subject : undefined,
      kind: slot.every(item=>item.kind===first.kind) ? first.kind : undefined,
    };
    const title = shared.subject || "Занятия по подгруппам";
    return <section className="lesson-split" aria-label={title+" · "+first.start+"–"+first.end} key={first.id}>
      <header className="lesson-split-head">
        <span className="lesson-slot-time">{first.start}–{first.end}</span>
        <div><h3>{title}</h3>{shared.kind && <span>{shared.kind}{shared.subject && " · по подгруппам"}</span>}</div>
      </header>
      <div className="lesson-split-items">{slot.map(item=>renderLesson(item,shared))}</div>
    </section>;
  })}</>;
}
