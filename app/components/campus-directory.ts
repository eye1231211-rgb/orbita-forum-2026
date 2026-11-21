const rea = "https://www.rea.ru";
const admissions = rea+"/pk/entrant/kontaktyi";
const studentServices = rea+"/structure/hs/vyisshaya-shkola-menedjmenta/studentu";
const studyDepartment = rea+"/structure/departments/departament-organizatsii-uchebnogo-protsessa";
const dean = studyDepartment+"/Edinyj-elektronnyj-dekanat";
const museum = rea+"/structure/departments/departament-bibliotechnyih-i-muzeynyih-servisov-BiblioScience/muzey-reu-im-gv-plehanova/muzey-istorii-universiteta-i-ekspozitsii";
const physicalEducation = rea+"/structure/hs/vyisshaya-shkola-sotsialno-gumanitarnyih-nauk/subordinateunits/kafedra-fizicheskogo-vospitaniya/studentu";
const engineering = rea+"/structure/hs/vyisshaya-injenernaya-shkola-novyie-materialyi-i-tehnologii/kontaktyi";
const congress = rea+"/structure/departments/departament-organizatsii-obschestvenno-massovyih-meropriyatiy/podchinennyie-podrazdeleniya-departamenta/upravlenie-kongress-tsentr";
const handbook = rea+"/~file/69652/pamyatka_compressed_1_compressed%2520_2_.pdf";

type Room = { number: string; title: string; source: string; note?: string };

export const campusRooms: Record<string, Room[]> = {
  "1": [
    {number:"125", title:"Музей истории Университета", source:museum},
    {number:"156", title:"Высшая школа экономики и бизнеса · приём абитуриентов", source:admissions},
  ],
  "2": [
    {number:"334", title:"Высшая школа менеджмента · приём абитуриентов", source:admissions},
    {number:"131", title:"Аудитория 131", source:handbook+"#page=13", note:"В памятке РЭУ есть видео, как её найти."},
    {number:"137", title:"Аудитория 137", source:handbook+"#page=13", note:"В памятке РЭУ есть видео, как её найти."},
    {number:"260", title:"Музейная выставка о Московском коммерческом институте", source:museum},
    {number:"1 этаж", title:"Зал единоборств", source:physicalEducation},
    {number:"2 этаж", title:"Верхний спортивный зал", source:physicalEducation, note:"В пролёте между 2-м и 3-м этажами."},
  ],
  "3": [
    {number:"116", title:"Единый электронный деканат · справки и документы", source:dean+"/otdel-obrascheniy-studentov-i-prepodavateley",
      note:"1-й этаж, налево от атриума, если стоять спиной ко входу в корпус."},
    {number:"110", title:"Электронные пропуска", source:studentServices, note:"Отдел технической и информационной безопасности."},
    {number:"100", title:"Документы об образовании", source:studentServices, note:"Копии диплома или аттестата."},
    {number:"115, 117, 119, 121", title:"Отдел по работе с контингентом", source:dean+"/Otdel-po-rabote-s-kontingentom",
      note:"1-й этаж. Сопровождение студентов и вопросы учебного процесса."},
    {number:"111", title:"Приём документов от преподавателей", source:dean+"/otdel-obrascheniy-studentov-i-prepodavateley", note:"1-й этаж."},
    {number:"202, 203", title:"Именные аудитории Н. А. Иванова и И. Г. Попова", source:museum},
    {number:"217", title:"Первая Академия медиа · приём абитуриентов", source:admissions},
    {number:"334", title:"Отдел контроля учебного процесса", source:rea+"/structure/departments/Otdel-kontrolya-uchebnogo-processa", note:"3-й этаж."},
    {number:"342", title:"Департамент организации учебного процесса", source:studyDepartment, note:"3-й этаж."},
    {number:"22", title:"Высшая школа кибертехнологий, математики и статистики · приём абитуриентов", source:admissions, note:"4-й этаж."},
    {number:"437", title:"Именная аудитория А. И. Китова", source:museum},
    {number:"535, 551", title:"Именные аудитории Б. М. Смехова и Ш. М. Мунчаева", source:museum},
    {number:"541", title:"Высшая школа права · приём абитуриентов", source:admissions},
    {number:"627", title:"Высшая школа социально-гуманитарных наук · приём абитуриентов", source:admissions},
    {number:"641", title:"Высшая школа «Форсайт» · приём абитуриентов", source:admissions},
    {number:"649", title:"Международная деятельность · поступление иностранных граждан", source:admissions},
  ],
  "4": [
    {number:"301", title:"Факультет бизнеса «Капитаны» · приём абитуриентов", source:admissions},
    {number:"−2 этаж", title:"Малый спортивный зал", source:physicalEducation},
    {number:"Вестибюль", title:"Экспозиция об истории домового храма", source:museum},
  ],
  "5": [
    {number:"309", title:"Бухгалтерия для студентов на бюджете", source:studentServices},
    {number:"311", title:"Бухгалтерия для студентов на платном обучении", source:studentServices},
    {number:"207", title:"Отдел правового обеспечения", source:studentServices},
    {number:"1 этаж", title:"Фитнес-зал", source:physicalEducation},
  ],
  "6": [
    {number:"301", title:"Библиотека Абалкина · запись читателей", source:rea+"/science/biblcentr/struktura/sektor-zapisi-chitateley"},
    {number:"2 этаж", title:"Читальный зал библиотеки Абалкина", source:rea+"/science/biblcentr/knijnyie-vyistavki"},
    {number:"607, 608", title:"Высшая школа финансов · приём абитуриентов", source:admissions},
    {number:"505, 513", title:"Высшая школа креативных индустрий · приём абитуриентов", source:admissions},
    {number:"197", title:"Дирекция Высшей инженерной школы", source:engineering},
    {number:"172, 527", title:"Учебные вопросы Высшей инженерной школы", source:engineering, note:"172 — бакалавриат и специалитет, 527 — магистратура."},
    {number:"1 этаж", title:"Тренажёрный зал", source:physicalEducation},
  ],
  "7": [{number:"Зал № 7", title:"Бильярдный зал", source:physicalEducation}],
  "8": [{number:"Бассейн", title:"Плавательный бассейн РЭУ", source:physicalEducation, note:"Большой Строченовский переулок, 10."}],
  "9": [
    {number:"7.12", title:"Центр по воспитательной работе и молодёжной политике", source:rea+"/structure/departments/upravlenie-po-sotsialno-vospitatelnoy-rabote/tsentr-vospitatelnoy-rabote-i-molodejnoy-politike", note:"7-й этаж."},
    {number:"5.02, 5.11", title:"Высшая школа кибертехнологий, математики и статистики · приём абитуриентов", source:admissions},
    {number:"8 этаж", title:"Спортивный игровой зал 9.1", source:physicalEducation},
  ],
  congress: [{number:"212", title:"Управление «Конгресс-центр»", source:congress, note:"У перехода из корпуса 2 в корпус 8."}],
};

export const campusWalkthroughs: Record<string, {to: string; source: string}[]> = {
  "3": [
    {to:"2",source:handbook+"#page=10"},
    {to:"4",source:handbook+"#page=13"}, {to:"6",source:handbook+"#page=13"},
    {to:"8",source:handbook+"#page=10"}, {to:"congress",source:handbook+"#page=13"},
  ],
  "2": [{to:"3",source:handbook+"#page=10"},{to:"8",source:congress}],
  "8": [{to:"3",source:handbook+"#page=10"},{to:"2",source:congress}],
  "4": [{to:"3",source:handbook+"#page=13"}],
  "6": [{to:"3",source:handbook+"#page=13"}],
  congress: [{to:"3",source:handbook+"#page=13"}],
};
