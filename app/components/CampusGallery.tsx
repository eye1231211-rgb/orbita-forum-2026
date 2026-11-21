"use client";
import {useEffect, useState} from "react";

// These images also appear in the author's campus album.
const frames = [
  {file:"novyi-korpus-vecherom", position:"50% 58%"},
  {file:"kolonnada-dnem", position:"52% 50%"},
  {file:"steklyannye-yarusy", position:"50% 48%"},
  {file:"perehod-mezhdu-korpusami", position:"50% 50%"},
  {file:"alleya", position:"50% 53%"},
  {file:"skver-osenyu", position:"50% 49%"},
];
const wrap=(index:number)=>(index+frames.length)%frames.length;
// Следующий кадр: битые пропускаем, иначе смена застрянет на них
const nextFrame=(from:number,broken:number[])=>{
  let index=wrap(from+1);
  for(let attempt=0;attempt<frames.length && broken.includes(index);attempt++)index=wrap(index+1);
  return index;
};
const url=(index:number)=>"/vibe/"+frames[index].file+".webp";
const duration=6500;

/* Панель с номером кадра, стрелками и паузой убрана по просьбе заказчика:
   это фон экрана входа, а не галерея, которую листают. Поэтому блок
   помечен декоративным, а смена кадров сама стоит при prefers-reduced-motion,
   на скрытой вкладке и на кадре, который не загрузился. */

export default function CampusGallery({start=0}:{start?:number}) {
  const [current,setCurrent]=useState(start);
  const [requested,setRequested]=useState(start);
  const [loaded,setLoaded]=useState<number[]>([start,wrap(start+1)]);
  const [ready,setReady]=useState<number[]>([]);
  const [broken,setBroken]=useState<number[]>([]);
  const [reduced,setReduced]=useState(true);
  const [visible,setVisible]=useState(true);
  useEffect(()=>{
    const media=matchMedia("(prefers-reduced-motion: reduce)");
    const motion=()=>setReduced(media.matches);
    const visibility=()=>setVisible(!document.hidden);
    motion();visibility();
    media.addEventListener("change",motion);
    document.addEventListener("visibilitychange",visibility);
    return ()=>{media.removeEventListener("change",motion);document.removeEventListener("visibilitychange",visibility);};
  },[]);
  useEffect(()=>{
    if(ready.includes(requested))setCurrent(requested);
    const preload=[requested,wrap(requested+1)];
    setLoaded(previous=>preload.every(index=>previous.includes(index))?previous:[...new Set([...previous,...preload])]);
  },[requested,ready]);
  useEffect(()=>{
    if(reduced||!visible||requested!==current||!ready.includes(current)||broken.length>=frames.length)return;
    const timer=setTimeout(()=>setRequested(nextFrame(current,broken)),duration);
    return ()=>clearTimeout(timer);
  },[current,requested,ready,reduced,visible,broken]);
  return <div className={"campus-gallery"+(reduced?" still-gallery":"")} aria-hidden="true">
    <div className="gallery-frames">{loaded.map(index=><img key={index}
      src={url(index)} style={{objectPosition:frames[index].position}}
      className={current===index?"on-slide":""}
      alt=""
      fetchPriority={index===start?"high":"low"} decoding="async"
      onLoad={()=>setReady(prior=>prior.includes(index)?prior:[...prior,index])}
      onError={()=>{setBroken(prior=>prior.includes(index)?prior:[...prior,index]);if(requested===index)setRequested(nextFrame(index,broken));}}
    />)}</div>
  </div>;
}
