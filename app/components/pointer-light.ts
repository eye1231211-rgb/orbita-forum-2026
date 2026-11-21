"use client";
import {useEffect} from "react";

/* Подсветка поверхности под курсором.
   Приём взят у Magic UI (Magic Card): мягкое пятно света идёт за мышью
   внутри карточки. Здесь он реализован без обёрток вокруг каждой карточки:
   один слушатель на документ находит ближайшую поверхность и передаёт ей
   координаты через CSS-переменные --mx и --my, а атрибут data-lit
   включает пятно. Остальное делает CSS (app/system.css, раздел 25).
   Подключается один раз в корневом layout.tsx. */

// Список совпадает с разделом 25 в system.css. Строка заявки несёт класс
// .card, но это строка списка: свет ей не положен, светится сам список.
export const LIT_SURFACES = [
  ".card:not(.request-card)",
  ".record-list", ".record-inspector",
  ".atlas-itinerary", ".atlas-index", ".atlas-lower .week-plan", ".atlas-dial",
  ".identity-card", ".profile-footer",
  ".requests-list", ".service-choices a", ".notification-card",
  ".week-strip", ".form-aside", ".empty",
  ".login-picker .demo-account",
].join(",");

export function PointerLight() {
  useEffect(() => {
    // На сенсорных экранах курсора нет — пятно было бы застывшим следом пальца
    if (!matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    let frame = 0;
    let pending: {el: HTMLElement; x: number; y: number} | null = null;
    let current: HTMLElement | null = null;

    const flush = () => {
      frame = 0;
      if (!pending) return;
      const {el, x, y} = pending;
      const box = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${Math.round(x - box.left)}px`);
      el.style.setProperty("--my", `${Math.round(y - box.top)}px`);
      pending = null;
    };

    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>(LIT_SURFACES) : null;
      if (current && current !== target) current.removeAttribute("data-lit");
      current = target;
      if (target) {
        target.setAttribute("data-lit", "");
        pending = {el: target, x: event.clientX, y: event.clientY};
      }
      // Координаты пишутся не чаще кадра: иначе на быстром движении
      // браузер пересчитывает стиль на каждое событие мыши.
      if (!frame) frame = requestAnimationFrame(flush);
    };

    const leave = () => { current?.removeAttribute("data-lit"); current = null; };

    document.addEventListener("pointermove", move, {passive: true});
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      document.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      if (frame) cancelAnimationFrame(frame);
      leave();
    };
  }, []);
  return null;
}
