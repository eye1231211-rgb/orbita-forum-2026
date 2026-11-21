// Real REU schools and programmes; people, groups, lessons and results are demonstration fixtures, not an official curriculum.
export function addAcademicFixtures(data) {
  const configs=[
    {login:'alina',subjects:['Архитектура предприятия','Моделирование бизнес-процессов','Анализ данных','Проектирование информационных систем','Базы данных','Проектный практикум'],teachers:['Мира Ладнева','Тимур Светлов','Ольга Речная','Лев Туманов','Ника Соснова','Ян Полянский']},
    {login:'mark',subjects:['Финансы','Бухгалтерский учёт','Финансовый анализ','Корпоративные финансы','Деньги, кредит, банки','Инвестиционный практикум'],teachers:['Вера Озёрная','Арсен Мирный','Ева Лесная','Дамир Северный','Лада Вишнёва','Глеб Холмов']}
  ];
  for(const config of configs) {
    const {login,subjects,teachers}=config;const student_id='student-'+login;
    subjects.forEach((name,i)=>{
      const discipline_id=`${login}-subject-${i}`;
      data.disciplines.push({id:discipline_id,student_id,name,credits:i<3?4:3});
      data.results.push({id:`${login}-result-${i}`,student_id,discipline_id,result:i===0?'5':i===1?(login==='alina'?'4':'5'):i===2?'Зачёт':null,status:i===2?'Зачтено':i<2?'Есть оценки':'Ожидает результата',updated_at:i<3?'2026-11-05':null,next_date:i===3?'2026-11-12':i===4?'2026-11-17':null,next_kind:i===3?'Защита прототипа':i===4?'Зачёт':null});
    });
    const plans=login==='alina'?[
      ['09',0,'09:00','10:30','Лекция','А-304'],['09',1,'10:50','12:20','Практика','Б-208'],['09',3,'13:00','14:30','Практика','А-112'],
      ['10',2,'09:00','10:30','Семинар','А-210'],['10',4,'10:50','12:20','Лекция','Б-305'],
      ['11',1,'10:50','12:20','Практика','Б-208'],['11',5,'13:00','14:30','Мастерская','А-112'],
      ['12',3,'10:50','12:20','Защита','А-112'],['12',0,'13:00','14:30','Семинар','А-304'],
      ['13',4,'09:00','10:30','Практика','Б-305'],['13',2,'10:50','12:20','Семинар','А-210']
    ]:[
      ['09',2,'10:50','12:20','Практика','В-102'],['09',0,'13:00','14:30','Лекция','В-305'],
      ['10',1,'09:00','10:30','Лекция','Г-210'],['10',3,'10:50','12:20','Практика','В-102'],
      ['11',5,'09:00','10:30','Лабораторная','Г-115'],['11',4,'13:00','14:30','Семинар','В-305'],
      ['12',3,'10:50','12:20','Защита','В-102'],['13',0,'09:00','10:30','Семинар','В-305']
    ];
    plans.forEach(([day,subject,start,end,kind,room],i)=>{
      const changed=i===1;const cancelled=i===6;
      data.lessons.push({id:`${login}-lesson-${i}`,student_id,discipline_id:`${login}-subject-${subject}`,date:`2026-11-${day}`,start,end,room,teacher:teachers[subject],kind,status:changed?'Перенесено':cancelled?'Отменено':'Обычное',old_room:changed?(login==='alina'?'А-201':'Г-114'):null,note:changed?`Вымышленный перенос: занятие пройдёт в ${room} вместо ${login==='alina'?'А-201':'Г-114'}. Время прежнее.`:cancelled?'Вымышленная отмена: преподаватель участвует в учебном семинаре. Замена не назначена.':''});
    });
    data.events.push({id:`${login}-event-0`,student_id,discipline_id:`${login}-subject-3`,title:login==='alina'?'Защита проекта информационной системы':'Защита финансовой модели',date:'2026-11-12',time:'10:50',note:'Подготовьте демонстрационный проект. Вымышленное учебное событие.'});
    const moved=data.lessons.find(x=>x.id===`${login}-lesson-1`);
    data.notifications.push(
      {id:`${login}-notice-0`,student_id,title:'Изменилась аудитория',text:`${subjects[login==='alina'?1:0]}: ${moved.date} в ${moved.start}, аудитория ${moved.room} вместо ${moved.old_room}. Это вымышленный пример переноса.`,category:'Расписание',date:'2026-11-09T05:30:00.000Z',href:`/schedule?date=${moved.date}&lesson=${moved.id}`},
      {id:`${login}-notice-1`,student_id,title:login==='alina'?'Скоро защита информационной системы':'Скоро защита финансовой модели',text:'12 ноября 2026 в 10:50 — защита учебного проекта. Посмотрите детали в разделе успеваемости.',category:'Учёба',date:'2026-11-08T10:00:00.000Z',href:'/grades'},
      {id:`${login}-notice-2`,student_id,title:login==='alina'?'Справка уже в работе':'Справка готова в демоверсии',text:login==='alina'?'Демонстрационный пример: справка с места учёбы находится в работе.':'Демонстрационный пример готовой справки. Реальный документ не создаётся.',category:'Заявки',date:'2026-11-08T09:00:00.000Z',href:`/requests/demo-request-${login}`},
      {id:`${login}-notice-3`,student_id,title:login==='alina'?'Практикум по бизнес-аналитике':'Практикум по финансовым моделям',text:login==='alina'?'13 ноября 2026 в 16:00 — вымышленная встреча о бизнес-аналитике в пространстве А-112.':'13 ноября 2026 в 15:00 — вымышленное обсуждение финансовых моделей в Г-115.',category:'Новости',date:'2026-11-07T08:00:00.000Z',href:null}
    );
  }
}
