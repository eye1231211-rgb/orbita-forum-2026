"use client";

/* «Вайб Плехановки» — подборка снимков кампуса, сделанных автором проекта.
   Кадры лежат в public/vibe двумя размерами: плитка 560 px и крупный кадр
   1400 px. Опись (public/vibe-gallery.json) готовит scripts/build-vibe-gallery.py,
   он же снимает метаданные съёмки. Кадры с людьми собраны в тему «Люди»:
   согласие людей на снимках подтвердил владелец проекта.
   Плитки грузятся лениво, крупный кадр — только когда его открыли. */

import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {createPortal} from "react-dom";
import {ArrowLeft, ArrowRight, Camera, X} from "lucide-react";

type Photo = {id: string; group: string; caption: string; width: number; height: number; shape: "wide"|"tall"};
type Group = {id: string; title: string};
type Album = {title: string; note: string; groups: Group[]; photos: Photo[]};

const url = (id: string, size: "thumb"|"full") => `/vibe/${id}${size === "thumb" ? "-thumb" : ""}.webp`;

export default function VibeGallery() {
  const [album, setAlbum] = useState<Album|null>(null);
  const [failed, setFailed] = useState(false);
  const [group, setGroup] = useState("");
  const [open, setOpen] = useState<string|null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement|null>(null);

  useEffect(() => {
    let active = true;
    fetch("/vibe-gallery.json")
      .then(response => response.ok ? response.json() as Promise<Album> : Promise.reject(new Error("нет подборки")))
      .then(data => { if (active) setAlbum(data); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);

  const shown = useMemo(
    () => (album?.photos || []).filter(photo => !group || photo.group === group),
    [album, group]);

  const step = useCallback((delta: number) => {
    setOpen(current => {
      if (!current) return current;
      const index = shown.findIndex(photo => photo.id === current);
      if (index < 0) return current;
      return shown[(index + delta + shown.length) % shown.length].id;
    });
  }, [shown]);

  // Клавиши работают, пока открыт крупный кадр: Esc закрывает, стрелки листают.
  useEffect(() => {
    if (!open) return;
    const keys = (event: KeyboardEvent) => {
      // Esc возвращает курсор на ту же плитку, что и кнопка закрытия
      if (event.key === "Escape") { event.preventDefault(); setOpen(null); returnFocus.current?.focus(); }
      else if (event.key === "ArrowRight") { event.preventDefault(); step(1); }
      else if (event.key === "ArrowLeft") { event.preventDefault(); step(-1); }
      else if (event.key === "Tab") {
        // Пока открыт кадр, Tab ходит по кнопкам окна и не уходит на страницу
        // под ним: иначе человек с клавиатуры терял место и не мог закрыть окно.
        const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".vibe-viewer button"));
        if (!buttons.length) return;
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.shiftKey ? index - 1 : index + 1;
        if (index < 0 || next < 0 || next >= buttons.length) {
          event.preventDefault();
          buttons[event.shiftKey ? buttons.length - 1 : 0].focus();
        }
      }
    };
    document.addEventListener("keydown", keys);
    const body = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    return () => { document.removeEventListener("keydown", keys); document.body.style.overflow = body; };
  }, [open, step]);

  const close = () => { setOpen(null); returnFocus.current?.focus(); };

  const current = open ? shown.find(photo => photo.id === open) : undefined;
  const position = current ? shown.findIndex(photo => photo.id === current.id) + 1 : 0;

  if (failed) return <section className="card"><h2>Подборка не загрузилась</h2>
    <p>Фотографии кампуса временно недоступны. Обновите страницу позже.</p></section>;
  if (!album) return <div className="loading" role="status"><span className="spinner"/>Загружаем подборку…</div>;

  return <section className="vibe" aria-label="Фотографии кампуса">
    <div className="vibe-filters" role="group" aria-label="Темы подборки">
      <button type="button" aria-pressed={!group} onClick={() => setGroup("")}>Всё<span>{album.photos.length}</span></button>
      {album.groups.map(entry => {
        const count = album.photos.filter(photo => photo.group === entry.id).length;
        if (!count) return null;
        return <button key={entry.id} type="button" aria-pressed={group === entry.id}
          onClick={() => setGroup(entry.id)}>{entry.title}<span>{count}</span></button>;
      })}
    </div>

    <div className="vibe-grid">
      {shown.map((photo, index) => <button key={photo.id} type="button"
        className={"vibe-cell " + photo.shape}
        onClick={event => { returnFocus.current = event.currentTarget; setOpen(photo.id); }}
        aria-label={`Открыть кадр: ${photo.caption}`}>
        <img src={url(photo.id, "thumb")} alt={photo.caption}
          loading={index < 6 ? "eager" : "lazy"} decoding="async"
          width={photo.width} height={photo.height}
          style={{aspectRatio: `${photo.width} / ${photo.height}`}}/>
        <span>{photo.caption}</span>
      </button>)}
    </div>

    <p className="vibe-note"><Camera size={14} aria-hidden="true"/>{album.note}</p>

    {/* Крупный кадр рисуется в body: у разделов есть анимация с transform,
        а она делает предка точкой отсчёта для position: fixed — окно уезжало
        вниз вместе со страницей. */}
    {current && createPortal(<div className="vibe-viewer" role="dialog" aria-modal="true" aria-label={current.caption}
      onClick={event => { if (event.target === event.currentTarget) close(); }}>
      <figure>
        <img src={url(current.id, "full")} alt={current.caption} width={current.width} height={current.height}/>
        <figcaption>{current.caption}<small>{position} из {shown.length}</small></figcaption>
      </figure>
      <button type="button" className="vibe-close" ref={closeButton} onClick={close} aria-label="Закрыть кадр"><X size={20}/></button>
      <button type="button" className="vibe-prev" onClick={() => step(-1)} aria-label="Предыдущий кадр"><ArrowLeft size={20}/></button>
      <button type="button" className="vibe-next" onClick={() => step(1)} aria-label="Следующий кадр"><ArrowRight size={20}/></button>
    </div>, document.body)}
  </section>;
}
