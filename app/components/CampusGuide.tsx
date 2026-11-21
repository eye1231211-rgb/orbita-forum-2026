"use client";

import { useState } from "react";
import { ArrowUpRight, Search } from "lucide-react";
import { campusRooms, campusWalkthroughs } from "./campus-directory";
import { buildings } from "./campus-model";

const normalize = (value: string) => value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");

export function CampusGuide({buildingId, onSelect}: {buildingId:string; onSelect:(id:string)=>void}) {
  const [query,setQuery] = useState("");
  const [expanded,setExpanded] = useState(false);
  const rooms = campusRooms[buildingId] ?? [];
  const routes = campusWalkthroughs[buildingId] ?? [];
  const search = normalize(query);
  const matching = rooms.filter(room=>normalize(room.number+" "+room.title+" "+(room.note ?? "")).includes(search));
  const visible = expanded || search ? matching : matching.slice(0,4);
  if (!rooms.length && !routes.length) return null;

  return <div className="campus-guide">
    {!!rooms.length && <section className="campus-guide-rooms" aria-labelledby="campus-rooms-title">
      <h4 id="campus-rooms-title">Кабинеты и залы</h4>
      {rooms.length>4 && <label className="campus-room-search">
        <Search size={16} aria-hidden="true"/>
        <input type="search" aria-label="Найти кабинет" placeholder="Номер или название" value={query}
          onChange={event=>setQuery(event.target.value)}/>
      </label>}
      <ul className="campus-guide-list">
        {visible.map(room=><li key={room.title}>
          <a href={room.source} target="_blank" rel="noopener noreferrer" className="campus-room-link">
            <span><strong>{room.title}</strong>{room.note && <small>{room.note}</small>}</span>
            <span className="campus-room-number">{room.number}</span>
            <ArrowUpRight size={14} aria-hidden="true"/>
          </a>
        </li>)}
      </ul>
      {search && !visible.length && <p className="campus-room-empty" role="status">В справочнике этого корпуса ничего не найдено.</p>}
      {!search && rooms.length>4 && <button className="text-button campus-show-rooms" type="button"
        aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>
        {expanded ? "Свернуть список" : `Все кабинеты и залы · ${rooms.length}`}
      </button>}
    </section>}
    {!!routes.length && <section className="campus-guide-routes" aria-labelledby="campus-routes-title">
      <h4 id="campus-routes-title">Внутренние маршруты</h4>
      <ul className="campus-guide-list">
        {routes.map(route=>{
          const name = buildings.find(building=>building.id===route.to)?.name;
          return <li key={route.to} className="campus-guide-route">
            <button className="text-button" type="button" onClick={()=>onSelect(route.to)}>{name}</button>
            <a href={route.source} target="_blank" rel="noopener noreferrer" aria-label={`Материалы РЭУ о переходе между зданиями: ${name}`}>
              Источник <ArrowUpRight size={13} aria-hidden="true"/>
            </a>
          </li>;
        })}
      </ul>
    </section>}
  </div>;
}
