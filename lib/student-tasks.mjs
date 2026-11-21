const isoDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;

export async function personalTasks(db, owner) {
  const rows = await db.prepare(`SELECT id,title,details,due,lesson_id AS lessonId,lesson_date AS lessonDate,
    done,revision FROM personal_tasks WHERE student_id=?
    ORDER BY done,(due=''),due,created_at DESC,id`).bind(owner).all();
  return rows.results.map(row=>({...row,done:Boolean(row.done)}));
}

export async function changeTask(db, owner, input, fail) {
  const {id, action, revision} = input;
  if(typeof id!=='string' || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) fail(422,'Некорректный номер задачи.');
  const row=await db.prepare('SELECT * FROM personal_tasks WHERE student_id=? AND id=?').bind(owner,id).first();
  if(action!=='create' && !row) fail(404,'Задача недоступна.');
  if(action!=='create' && (!Number.isInteger(revision) || revision!==row.revision)) fail(409,'Задача уже изменилась. Откройте её снова.');
  let statement;
  if(action==='create' || action==='edit'){
    const {title,details='',due='',lessonId='',lessonDate=''}=input;
    if(typeof title!=='string'||!title.trim()||title.trim().length>140||typeof details!=='string'||details.length>1600 ||
       (due!==''&&!isoDay(due))) fail(422,'Проверьте название, описание и срок задачи.');
    if(typeof lessonId!=='string'||(lessonId!==''&&!/^reu-[0-9a-f]{24}$/.test(lessonId))||
       (lessonDate!==''&&!isoDay(lessonDate))||Boolean(lessonId)!==Boolean(lessonDate)) fail(422,'Некорректная ссылка на занятие.');
    if(action==='create'){
      if(row){
        if(row.title!==title.trim()||row.details!==details.trim()||row.due!==due||row.lesson_id!==lessonId||row.lesson_date!==lessonDate) fail(409,'Задача с этим номером уже существует.');
        return;
      }
      statement=db.prepare(`INSERT INTO personal_tasks(id,student_id,title,details,due,lesson_id,lesson_date,created_at)
        SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM personal_tasks WHERE student_id=?)<60
        ON CONFLICT(student_id,id) DO NOTHING`)
        .bind(id,owner,title.trim(),details.trim(),due,lessonId,lessonDate,new Date().toISOString(),owner);
    }else{
      statement=db.prepare('UPDATE personal_tasks SET title=?,details=?,due=?,revision=revision+1 WHERE student_id=? AND id=? AND revision=?')
        .bind(title.trim(),details.trim(),due,owner,id,revision);
    }
  }else if(action==='mark' && typeof input.done==='boolean'){
    statement=db.prepare('UPDATE personal_tasks SET done=?,revision=revision+1 WHERE student_id=? AND id=? AND revision=?').bind(input.done?1:0,owner,id,revision);
  }else if(action==='remove'){
    statement=db.prepare('DELETE FROM personal_tasks WHERE student_id=? AND id=? AND revision=?').bind(owner,id,revision);
  }else fail(422,'Неизвестное действие.');
  const result=await statement.run();
  if(!(result.meta?.changes ?? result.changes)){
    if(action==='create'){
      const duplicate=await db.prepare('SELECT title,details,due,lesson_id,lesson_date FROM personal_tasks WHERE student_id=? AND id=?').bind(owner,id).first();
      if(duplicate && duplicate.title===input.title.trim() && duplicate.details===(input.details||'').trim() &&
        duplicate.due===(input.due||'') && duplicate.lesson_id===(input.lessonId||'') && duplicate.lesson_date===(input.lessonDate||''))return;
      if(!duplicate)fail(429,'В плане уже 60 задач. Удалите завершённую задачу.');
    }
    fail(409,'Задача изменилась. Обновите план.');
  }
}

export async function issuedHomework(db, group) {
  const rows=await db.prepare('SELECT lesson_id AS lessonId,assignment,due,author,source_url AS sourceUrl FROM lesson_homework WHERE group_name=?').bind(group).all();
  return Object.fromEntries(rows.results.map(row=>[row.lessonId,row]));
}
