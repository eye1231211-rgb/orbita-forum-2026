/* Вымышленные преподаватели.

   Правила конкурса прямо запрещают настоящие ФИО преподавателей, а открытое
   расписание РЭУ их содержит. Поэтому имя заменяется на вымышленное на самой
   границе импорта: настоящее ФИО в репозиторий и в интерфейс не попадает.

   Замена детерминированная: один и тот же преподаватель получает одно и то же
   вымышленное имя при каждом импорте. Иначе после переимпорта один человек
   рассыпался бы на нескольких, и расписание перестало бы быть связным.
   Обратного преобразования нет — по вымышленному имени настоящее не
   восстанавливается. */

const SURNAMES = {
  f: ['Ладнева', 'Озёрная', 'Речная', 'Соснова', 'Вишнёва', 'Лесная', 'Яснова', 'Зорина', 'Светлова', 'Полянская', 'Туманова', 'Холмова'],
  m: ['Ладнев', 'Озёрный', 'Речной', 'Соснов', 'Вишнёв', 'Лесной', 'Яснов', 'Зорин', 'Светлов', 'Полянский', 'Туманов', 'Холмов']
};
const NAMES = {
  f: ['Мира', 'Ольга', 'Ника', 'Вера', 'Ева', 'Лада', 'Инна', 'Рада', 'Злата', 'Дина', 'Яна', 'Алла'],
  m: ['Тимур', 'Лев', 'Ян', 'Арсен', 'Дамир', 'Глеб', 'Марат', 'Руслан', 'Олег', 'Игорь', 'Пётр', 'Семён']
};
const PATRONYMICS = {
  f: ['Олеговна', 'Игоревна', 'Петровна', 'Семёновна', 'Тимуровна', 'Львовна', 'Глебовна', 'Маратовна'],
  m: ['Олегович', 'Игоревич', 'Петрович', 'Семёнович', 'Тимурович', 'Львович', 'Глебович', 'Маратович']
};

// FNV-1a: нужен только устойчивый разброс, а не криптография.
function fingerprint(value) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/* Одно вымышленное ФИО. `taken` — уже занятые имена: при совпадении берётся
   следующее отчество, чтобы два разных преподавателя не слились в одного. */
export function fictionalTeacher(source, taken = new Set()) {
  const seed = fingerprint(String(source).trim().toLowerCase());
  const gender = seed % 2 === 0 ? 'f' : 'm';
  const surname = SURNAMES[gender][(seed >>> 3) % SURNAMES[gender].length];
  const name = NAMES[gender][(seed >>> 9) % NAMES[gender].length];
  const start = (seed >>> 15) % PATRONYMICS[gender].length;
  for (let shift = 0; shift < PATRONYMICS[gender].length; shift += 1) {
    const full = surname + ' ' + name + ' ' + PATRONYMICS[gender][(start + shift) % PATRONYMICS[gender].length];
    if (!taken.has(full)) { taken.add(full); return full; }
  }
  return surname + ' ' + name + ' ' + PATRONYMICS[gender][start];
}

/* Строка расписания может перечислять несколько преподавателей через запятую. */
export function fictionalTeachers(source, taken = new Set()) {
  return String(source || '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => fictionalTeacher(part, taken))
    .join(', ');
}
