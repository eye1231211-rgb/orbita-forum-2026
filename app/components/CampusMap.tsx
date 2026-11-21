"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { ArrowUpRight, Box, MapPin, Minus, Plus, RotateCcw, RotateCw, Square } from "lucide-react";
import { buildings } from "./campus-model";
import { defaultCamera, paintCampus, type CampusCamera, type CampusFocus } from "./campus-renderer";
import { CampusGuide } from "./CampusGuide";

const campusSource = "https://www.rea.ru/education/ob-universitete/kampus-reu-infrastruktura";
const pinLabel = (id: string) => id === "upk" ? "УПК" : id === "congress" ? "КЦ" : id;
const focusFor = (id: string): CampusFocus => {
  const building = buildings.find(item=>item.id===id)!;
  return {point:building.pin,height:building.volumes[0].height};
};

export default function CampusMap() {
  const [selection, setSelection] = useState("3");
  const [camera, setCamera] = useState<CampusCamera>(defaultCamera);
  const canvas = useRef<HTMLCanvasElement>(null);
  const pins = useRef(new Map<string, HTMLButtonElement>());
  const choices = useRef(new Map<string, HTMLButtonElement>());
  const scene = useRef({ camera, selection, redraw: () => {} });
  const drag = useRef<{ id: number; x: number; yaw: number } | null>(null);
  const building = buildings.find(item => item.id === selection)!;
  const plan = camera.tilt === Math.PI / 2;

  useEffect(() => {
    const element = canvas.current;
    const ctx = element?.getContext("2d");
    if (!element || !ctx) return;
    let current = {...defaultCamera};
    let focal = focusFor("3");
    const highlights = new Map(buildings.map(item=>[item.id,item.id==="3" ? 1 : 0]));
    let frame = 0;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const state = scene.current;
    function draw() {
      frame = 0;
      const { clientWidth: width, clientHeight: height } = element!;
      if (width < 50 || height < 50) return;
      const pixelRatio = Math.min(devicePixelRatio || 1, 2);
      const w = Math.round(width * pixelRatio), h = Math.round(height * pixelRatio);
      if (element!.width !== w) element!.width = w;
      if (element!.height !== h) element!.height = h;
      ctx!.setTransform(w / width, 0, 0, h / height, 0, 0);
      const target = state.camera;
      const selectedFocus = focusFor(state.selection);
      let needsFrame = false;
      const ease = (value:number, goal:number, tolerance=.002) => {
        if (motion.matches || Math.abs(goal-value)<tolerance) return goal;
        needsFrame = true;
        return value+(goal-value)*.19;
      };
      current = {yaw:ease(current.yaw,target.yaw), tilt:ease(current.tilt,target.tilt), zoom:ease(current.zoom,target.zoom), focus:ease(current.focus,target.focus)};
      focal = {point:[ease(focal.point[0],selectedFocus.point[0],.6),ease(focal.point[1],selectedFocus.point[1],.6)],
        height:ease(focal.height,selectedFocus.height,.6)};
      highlights.forEach((level,id)=>highlights.set(id,ease(level,id===state.selection ? 1 : 0)));
      const layout = new Map(paintCampus(ctx!, width, height, current, state.selection, focal, highlights).map(pin => [pin.id, pin]));
      pins.current.forEach((button,id) => {
        const pin = layout.get(id);
        button.hidden = !pin;
        if (pin) button.style.transform = `translate(${pin.x}px, ${pin.y}px) translate(-50%, -50%)`;
      });
      if (needsFrame) invalidate();
    }
    function invalidate() { if (!frame) frame = requestAnimationFrame(draw); }
    state.redraw = invalidate;
    const observer = new ResizeObserver(invalidate);
    observer.observe(element);
    invalidate();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      state.redraw = () => {};
    };
  }, []);

  useEffect(() => {
    scene.current.camera = camera;
    scene.current.selection = selection;
    scene.current.redraw();
  }, [camera, selection]);

  function beginDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    drag.current = {id:event.pointerId,x:event.clientX,yaw:camera.yaw};
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function rotateDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== event.pointerId) return;
    const yaw = drag.current.yaw + (event.clientX-drag.current.x)*.007;
    setCamera(view => ({...view,yaw}));
  }
  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id === event.pointerId) drag.current = null;
  }
  function zoom(amount: number) {
    setCamera(view => ({...view,zoom:Math.min(1.8,Math.max(1,view.zoom+amount))}));
  }
  function selectBuilding(id: string) {
    if (id===selection) return;
    setSelection(id);
    setCamera(view=>({...view,focus:.17}));
  }
  function showRouteDestination(id: string) {
    selectBuilding(id);
    choices.current.get(id)?.focus({preventScroll:true});
    canvas.current?.scrollIntoView({block:"nearest",behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});
  }

  return <section id="campus-map" className="card campus-map" aria-labelledby="campus-map-title">
    <div className="campus-map-head">
      <div><h2 id="campus-map-title">Карта кампуса</h2><p>РЭУ им. Г. В. Плеханова · Замоскворечье</p></div>
      <div className="segmented campus-map-modes" role="group" aria-label="Вид карты">
        <button type="button" aria-pressed={!plan} onClick={()=>setCamera(view=>({...view,tilt:defaultCamera.tilt}))}><Box size={15} aria-hidden="true"/> 3D</button>
        <button type="button" aria-pressed={plan} onClick={()=>setCamera(view=>({...view,yaw:0,tilt:Math.PI/2}))}><Square size={14} aria-hidden="true"/> Сверху</button>
      </div>
    </div>
    <div className="campus-map-viewport" onPointerDown={beginDrag} onPointerMove={rotateDrag}
      onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}>
      <canvas ref={canvas} aria-hidden="true"/>
      <div className="campus-map-pins" role="group" aria-label="Метки на карте">
        {buildings.map(item=><button key={item.id} type="button" className="campus-map-pin" aria-label={item.name+" на карте"}
          aria-pressed={selection===item.id} title={item.name} onClick={()=>selectBuilding(item.id)}
          ref={node=>{if(node) pins.current.set(item.id,node);else pins.current.delete(item.id);}}>
          {pinLabel(item.id)}
        </button>)}
      </div>
    </div>
    <div className="campus-map-toolbar">
      <span className="campus-map-bridge-key">Переходы между корпусами</span>
      <div className="campus-map-controls" role="group" aria-label="Управление картой">
        <button type="button" aria-label="Повернуть влево" title="Повернуть влево" onClick={()=>setCamera(view=>({...view,yaw:view.yaw-.35}))}><RotateCcw size={17} aria-hidden="true"/></button>
        <button type="button" aria-label="Повернуть вправо" title="Повернуть вправо" onClick={()=>setCamera(view=>({...view,yaw:view.yaw+.35}))}><RotateCw size={17} aria-hidden="true"/></button>
        <button type="button" aria-label="Отдалить карту" title="Отдалить карту" disabled={camera.zoom<=1} onClick={()=>zoom(-.2)}><Minus size={17} aria-hidden="true"/></button>
        <button type="button" aria-label="Приблизить карту" title="Приблизить карту" disabled={camera.zoom>=1.8} onClick={()=>zoom(.2)}><Plus size={17} aria-hidden="true"/></button>
        <button type="button" onClick={()=>setCamera(defaultCamera)}>Сбросить вид</button>
      </div>
    </div>
    <div className="campus-map-directory">
      <div className="campus-map-choices" role="group" aria-label="Корпуса и площадки">
        {buildings.map(item=><button key={item.id} type="button" aria-label={item.name}
          aria-pressed={selection===item.id} onClick={()=>selectBuilding(item.id)}
          ref={node=>{if(node) choices.current.set(item.id,node);else choices.current.delete(item.id);}}>{pinLabel(item.id)}</button>)}
      </div>
      <div aria-live="polite">
        <div className="campus-map-address campus-selection-in" key={building.id}>
          <span className="profile-resource-icon"><MapPin size={19} aria-hidden="true"/></span>
          <div><h3>{building.name}</h3><p>{building.location}</p>{building.detail && <p className="campus-map-detail">{building.detail}</p>}</div>
        </div>
      </div>
    </div>
    <CampusGuide key={building.id} buildingId={building.id} onSelect={showRouteDestination}/>
    <div className="campus-map-source"><span>Здания и переходы показаны схематично</span>
      <a href={campusSource} target="_blank" rel="noopener noreferrer">О кампусе на сайте РЭУ <ArrowUpRight size={14} aria-hidden="true"/></a>
    </div>
  </section>;
}
