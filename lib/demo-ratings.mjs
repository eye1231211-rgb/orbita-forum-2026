// Illustrative breakdowns for the six published grades in the two fixed demo profiles.
// Unpublished results and future grades do not inherit scores from other disciplines.
const scorecards = new Map([
  ['alina-result-0', ['5', 19, 18, 19, 37]],
  ['alina-result-1', ['4', 16, 15, 17, 32]],
  ['alina-result-2', ['Зачёт', 15, 14, 12, 27]],
  ['mark-result-0', ['5', 18, 19, 18, 36]],
  ['mark-result-1', ['5', 17, 19, 17, 34]],
  ['mark-result-2', ['Зачёт', 12, 16, 14, 28]],
]);
const programme='https://www.rea.ru/mnt/sveden/education/eduOp/Бак/ВШФ/38.03.01 Экономика/Финансы и кредит/О/РП/RP_38.03.01_E_FIK_2024_v4.pdf';
const examRubrics = new Map([
  ['mark-result-0',{page:323,parts:[['Первый вопрос',10],['Второй вопрос',10],['Расчётно-аналитическое задание',15],['Второе практическое задание',5]]}],
  ['mark-result-1',{page:924,parts:[['Первый вопрос',10],['Второй вопрос',10],['Расчётно-аналитическое задание',20]]}]
]);
export function demoRating(grade) {
  const card = scorecards.get(grade.id);
  if (!card || card[0] !== grade.result) return null;
  const [, participation, control, creative, assessment] = card;
  const rubric=examRubrics.get(grade.id);
  const exam=rubric && {page:rubric.page,source:programme+'#page='+rubric.page,parts:rubric.parts.map(([label,max])=>({label,max}))};
  return {participation, control, creative, assessment, exam, total:participation + control + creative + assessment};
}
