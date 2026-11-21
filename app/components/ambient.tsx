"use client";
import {useEffect, useRef} from "react";

/* Живой фон «созвездие частиц» — выбран заказчиком из четырёх живых
   вариантов (образец — Magic UI «Particles»). Точки медленно дрейфуют
   по экрану, близкие соединяются тонкими линиями, от курсора точки
   мягко разбегаются. Цвета — палитра РЭУ.
   Нагрузка: число точек зависит от площади экрана (на телефоне плотность выше),
   на скрытой вкладке расчёт стоит. При prefers-reduced-motion рисуется
   один неподвижный кадр. Подключается в layout.tsx. */

const MOBILE_DENSITY = 8500;
const DENSITY = 16000;   // одна точка на столько квадратных пикселей
const MAX_POINTS = 120;
const LINK = 120;        // расстояние, до которого точки соединяются линией, px
const REPEL = 110;       // радиус, в котором точки уходят от курсора, px
const SPEED = 0.32;      // базовая скорость дрейфа, px за кадр

type Point = {x: number; y: number; vx: number; vy: number; r: number};

export function AmbientBackground() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mouse = {x: -9999, y: -9999};
    let w = 0, h = 0, dpr = 1, frame = 0;
    const points: Point[] = [];

    const createPoint = (): Point => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * SPEED * 2,
        vy: (Math.random() - 0.5) * SPEED * 2,
        r: 1.1 + Math.random() * 1.7,
    });

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const prevW = w || window.innerWidth, prevH = h || window.innerHeight;
      w = window.innerWidth;
      h = window.innerHeight;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // При смене размера точки сохраняют относительное положение
      for (const point of points) {
        point.x *= w / prevW;
        point.y *= h / prevH;
      }
      const density = w <= 820 ? MOBILE_DENSITY : DENSITY;
      const count = Math.min(MAX_POINTS, Math.round((w * h) / density));
      points.length = Math.min(points.length, count);
      while (points.length < count) points.push(createPoint());
      draw();
    };

    const step = () => {
      for (const p of points) {
        const dx = p.x - mouse.x, dy = p.y - mouse.y;
        const d = Math.hypot(dx, dy);
        if (d < REPEL && d > 0) {
          const push = (1 - d / REPEL) * 0.6;
          p.vx += (dx / d) * push;
          p.vy += (dy / d) * push;
        }
        // Трение гасит толчок от курсора, а слабый случайный дрейф
        // не даёт точкам остановиться
        p.vx *= 0.97;
        p.vy *= 0.97;
        if (Math.hypot(p.vx, p.vy) < SPEED * 0.5) {
          p.vx += (Math.random() - 0.5) * 0.06;
          p.vy += (Math.random() - 0.5) * 0.06;
        }
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -10) p.x = w + 10; else if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10; else if (p.y > h + 10) p.y = -10;
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;
      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        for (let j = i + 1; j < points.length; j++) {
          const b = points[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          if (Math.abs(dx) > LINK || Math.abs(dy) > LINK) continue;
          const d = Math.hypot(dx, dy);
          if (d >= LINK) continue;
          ctx.strokeStyle = `rgba(20, 78, 152, ${((1 - d / LINK) * 0.32).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      ctx.fillStyle = "rgba(16, 40, 71, 0.55)";
      for (const p of points) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const loop = () => {
      frame = requestAnimationFrame(loop);
      step();
      draw();
    };

    const start = () => { if (!still && !frame && !document.hidden) frame = requestAnimationFrame(loop); };
    const stop = () => { if (frame) { cancelAnimationFrame(frame); frame = 0; } };
    const visibility = () => (document.hidden ? stop() : start());
    const move = (event: PointerEvent) => { mouse.x = event.clientX; mouse.y = event.clientY; };
    const leave = () => { mouse.x = mouse.y = -9999; };

    resize();
    el.classList.add("is-ready");
    start();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pointermove", move, {passive: true});
    document.documentElement.addEventListener("pointerleave", leave);
    return () => {
      stop();
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
    };
  }, []);

  return (
    <div className="ambient" aria-hidden="true">
      <canvas ref={canvas} />
    </div>
  );
}
