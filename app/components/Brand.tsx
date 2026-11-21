/* Фирменные элементы «Орбиты».
   Знак и монограммы нарисованы вектором: они остаются чёткими на любом
   экране, наследуют цвет темы и не являются сгенерированными картинками. */

/* Знак: ядро и наклонная орбита со спутником.
   Прежний вариант — кольцо с вертикальной чертой внутри — читался как
   кнопка питания (⏻). Теперь ядро сплошное, а орбита проходит за ним:
   задняя половина эллипса бледнее и скрыта ядром, передняя лежит поверх.
   Глубина без градиентов и теней, форма держится и в 24 px.
   Вариант «портик на орбите» по сгенерированному эскизу пробовался
   2026-11-14 и отклонён заказчиком. */
export function OrbitMark({ size = 38, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      className={"orbit-mark " + className}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g transform="rotate(-24 20 20)" stroke="currentColor" strokeLinecap="round">
        {/* Задняя половина орбиты — уходит за ядро */}
        <path d="M3.5 20a16.5 6.6 0 0 1 33 0" strokeWidth="1.9" opacity=".42" />
      </g>
      {/* Ядро — университет */}
      <circle cx="20" cy="20" r="7.4" fill="currentColor" />
      <g transform="rotate(-24 20 20)">
        {/* Передняя половина орбиты. Тёмный просвет вокруг неё снят:
            на маленьком знаке он читался как трещина через ядро. */}
        <path d="M3.5 20a16.5 6.6 0 0 0 33 0" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        {/* Спутник — студент на своей орбите */}
        <circle cx="31.2" cy="24.9" r="3" fill="currentColor" />
      </g>
    </svg>
  );
}

/* Инициалы: имя + фамилия — тот же порядок, что в карточках входа и форме. */
export function initialsOf(first: string, last: string) {
  const a = (first || "").trim().charAt(0);
  const b = (last || "").trim().charAt(0);
  return (a + b).toUpperCase();
}

/* Монограмма заменяет портрет. Настоящие кабинеты вузов показывают
   инициалы, пока студент не загрузил собственное фото. */
export function Monogram({
  first,
  last,
  size = "md",
  onNavy = false,
  className = "",
}: {
  first: string;
  last: string;
  size?: "sm" | "md" | "lg";
  onNavy?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`monogram size-${size}${onNavy ? " on-navy" : ""}${className ? " " + className : ""}`}
      aria-hidden="true"
    >
      {initialsOf(first, last)}
    </span>
  );
}
