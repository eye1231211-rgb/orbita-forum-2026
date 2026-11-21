const encoder=new TextEncoder();
const escapeText=value=>String(value||'').replaceAll('\\','\\\\').replace(/\r\n|\n|\r/g,'\\n').replaceAll(';','\\;').replaceAll(',','\\,');
// RFC 5545 folds at 75 octets, never in the middle of a UTF-8 character.
export function foldLine(value) {
  const parts=[];let line='',bytes=0;
  for(const char of value) {
    const length=encoder.encode(char).length;
    if(bytes+length>75){parts.push(line);line=' '+char;bytes=1+length;}else{line+=char;bytes+=length;}
  }
  parts.push(line);return parts.join('\r\n');
}
const utc=(date,time)=>new Date(`${date}T${time}:00+03:00`).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
export function createCalendar(lessons) {
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Orbita//Student Calendar//RU','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:Орбита / РЭУ — расписание группы','X-WR-TIMEZONE:Europe/Moscow'];
  for(const lesson of lessons) {
    lines.push('BEGIN:VEVENT',`UID:${lesson.id}@orbita.calendar`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')}`,`DTSTART:${utc(lesson.date,lesson.start)}`,`DTEND:${utc(lesson.date,lesson.end)}`,`SUMMARY:${escapeText((lesson.status==='Отменено'?'Отменено: ':'')+lesson.subject)}`,`LOCATION:${escapeText(lesson.room)}`,`DESCRIPTION:${escapeText(`${lesson.kind}. Преподаватель: ${lesson.teacher}. ${lesson.note||''}`)}`,`STATUS:${lesson.status==='Отменено'?'CANCELLED':'CONFIRMED'}`,'END:VEVENT');
  }
  lines.push('END:VCALENDAR');return lines.map(foldLine).join('\r\n')+'\r\n';
}
