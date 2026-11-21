import { buildings, passages, type Point } from "./campus-model";

export type CampusCamera = { yaw: number; tilt: number; zoom: number; focus: number };
export type CampusFocus = { point: Point; height: number };
type Projected = { x: number; y: number; depth: number };
type Project = (point: Point, height?: number) => Projected;
type Pin = { id: string; x: number; y: number };
type Face = { depth: number; paint: () => void };

export const defaultCamera: CampusCamera = {yaw: -.21, tilt: .83, zoom: 1, focus: 0};

function shade(from: string, to: string, amount: number) {
  if (amount <= 0) return from;
  if (amount >= 1) return to;
  const a = Number.parseInt(from.slice(1),16), b = Number.parseInt(to.slice(1),16);
  const channel = (shift: number) => Math.round(((a>>shift)&255)*(1-amount)+((b>>shift)&255)*amount);
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

function path(ctx: CanvasRenderingContext2D, points: Projected[], start = true) {
  if (start) ctx.beginPath();
  points.forEach(({x,y}, index) => index === 0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y));
  ctx.closePath();
}

function signedArea(points: Point[]) {
  return points.reduce((sum, [x,z], i) => {
    const [nx,nz] = points[(i+1)%points.length];
    return sum + x*nz - nx*z;
  }, 0);
}

function faceOutline(points: Point[], hole = false) {
  return (signedArea(points) > 0) !== hole ? points : points.slice().reverse();
}

function mix(a: Projected, b: Projected, t: number) {
  return {x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t, depth:a.depth+(b.depth-a.depth)*t};
}

function facade(ctx: CanvasRenderingContext2D, a: Projected, b: Projected, c: Projected, d: Projected, active: number, modern: boolean, bridge: boolean) {
  const width = Math.abs(a.x-b.x);
  const height = d.y-a.y;
  const light = b.y > a.y;
  const wall = bridge ? "#a6bddc" : light ? "#becbe0" : "#a8b9d2";
  ctx.fillStyle = shade(wall,light ? "#7198c9" : "#547eaf",active);
  path(ctx,[a,b,c,d]);
  ctx.fill();
  ctx.strokeStyle = shade("#9caccc","#5278aa",active);
  ctx.lineWidth = .65;
  ctx.stroke();
  if (width < 12 || height < 7) return;
  const count = Math.max(1, Math.round(width/(modern?6:10)));
  const floors = bridge ? 1 : Math.max(1, Math.round(height/(modern?5:8)));
  ctx.fillStyle = bridge ? "rgba(241,248,255,.75)" : `rgba(38,73,120,${.18 + .13*active})`;
  for (let slot=0;slot<count;slot++) {
    const left = (slot+.25)/count;
    const right = (slot+.66)/count;
    const roofL = mix(a,b,left), roofR = mix(a,b,right);
    const wallL = mix(d,c,left), wallR = mix(d,c,right);
    for (let floor=0;floor<floors;floor++) {
      const upper = (floor+.32)/floors, lower = (floor+.73)/floors;
      path(ctx,[mix(roofL,wallL,upper),mix(roofR,wallR,upper),mix(roofR,wallR,lower),mix(roofL,wallL,lower)]);
      ctx.fill();
    }
  }
}

export function paintCampus(ctx: CanvasRenderingContext2D, width: number, height: number, camera: CampusCamera,
  selected: string, focal: CampusFocus, highlights: ReadonlyMap<string, number>): Pin[] {
  const sine = Math.sin(camera.tilt), cosine = Math.cos(camera.tilt);
  const angle = camera.yaw + .275;
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const project: Project = ([x,z], h=0) => {
    const cross = (x-675)*ca-(z-515)*sa;
    const forward = (x-675)*sa+(z-515)*ca;
    return {x:cross, y:forward*sine-h*cosine, depth:forward*cosine+h*sine};
  };
  const extremes = buildings.flatMap(building => building.volumes.flatMap(volume =>
    volume.outline.flatMap(point => [project(point),project(point,volume.height)])));
  const left = Math.min(...extremes.map(p=>p.x)), right = Math.max(...extremes.map(p=>p.x));
  const top = Math.min(...extremes.map(p=>p.y)), bottom = Math.max(...extremes.map(p=>p.y));
  const scale = Math.min((width-42)/(right-left), (height-46)/(bottom-top))*camera.zoom;
  const activeBuilding = buildings.find(building=>building.id===selected);
  const focus = project(focal.point,focal.height);
  const focusWeight = Math.min(1,camera.focus+(camera.zoom-1)*1.4);
  const midX = (left+right)/2, midY = (top+bottom)/2;
  const shift = (difference:number, room:number) => camera.zoom>1
    ? difference*focusWeight
    : Math.max(-room,Math.min(room,difference*focusWeight));
  const centerX = midX+shift(focus.x-midX,(width/2-12)/scale-(right-left)/2);
  const centerY = midY+shift(focus.y-midY,(height/2-12)/scale-(bottom-top)/2);
  const screen: Project = (point,h) => {
    const p = project(point,h);
    return { x:width/2+(p.x-centerX)*scale, y:height/2+(p.y-centerY)*scale, depth:p.depth };
  };

  ctx.clearRect(0,0,width,height);
  const faces: Face[] = [];
  const volumes = [
    ...buildings.flatMap(building=>building.volumes.map(volume=>({
      volume, active:highlights.get(building.id) ?? 0, modern:building.id==="9", bridge:false,
    }))),
    ...passages.map(passage=>({
      volume:passage.volume, active:Math.max(...passage.connects.map(id=>highlights.get(id) ?? 0))*.65, modern:false, bridge:true,
    })),
  ];
  for (const {volume, active, modern, bridge} of volumes) {
    const roof = volume.outline.map(p=>screen(p,volume.height));
    const courtyard = volume.courtyard?.map(p=>screen(p,volume.height));
    const ground = volume.outline.map(([x,z])=>screen([x+20,z+19]));
    path(ctx,ground);
    ctx.fillStyle = `rgba(54,81,129,${.11+.09*active})`;
    ctx.fill();
    const outlines=[faceOutline(volume.outline)];
    if (volume.courtyard) outlines.push(faceOutline(volume.courtyard,true));
    for (const loop of outlines) {
      loop.forEach((point,i)=>{
        const next=loop[(i+1)%loop.length];
        const a=screen(point,volume.height), b=screen(next,volume.height);
        if (b.x>=a.x || cosine<.02) return;
        const c=screen(next,volume.base), d=screen(point,volume.base);
        const depth = (a.depth+b.depth+c.depth+d.depth)/4;
        faces.push({depth,paint:()=>facade(ctx,a,b,c,d,active,modern,bridge)});
      });
    }
    const depth=roof.reduce((sum,p)=>sum+p.depth,0)/roof.length;
    faces.push({depth,paint:()=>{
      const minY=Math.min(...roof.map(p=>p.y)), maxY=Math.max(...roof.map(p=>p.y));
      const gradient=ctx.createLinearGradient(0,minY,0,maxY);
      gradient.addColorStop(0,shade(bridge?"#d3eaf4":"#f6f9ff","#a9c7ef",active));
      gradient.addColorStop(1,shade(bridge?"#adcada":modern?"#c4d5ed":"#dbe5f4","#7ca6dc",active));
      path(ctx,roof);
      if (courtyard) path(ctx,courtyard,false);
      ctx.fillStyle=gradient;
      ctx.fill("evenodd");
      ctx.strokeStyle=shade(bridge?"#8eafc9":"#afc0db","#547fb5",active);
      ctx.lineWidth=.8+.5*active;
      ctx.stroke();
    }});
  }
  faces.sort((a,b)=>a.depth-b.depth).forEach(face=>face.paint());

  const pins: Pin[]=[];
  const offsets = [[0,0],[0,-28],[23,18],[-23,18],[28,-21],[-28,-21],[0,28]];
  const order = activeBuilding ? [activeBuilding,...buildings.filter(b=>b!==activeBuilding)] : buildings;
  for (const building of order) {
    const point=screen(building.pin,building.volumes[0].height+4);
    if (point.x<8 || point.x>width-8 || point.y<6 || point.y>height-6) continue;
    const target=offsets.map(([x,y])=>({x:point.x+x,y:point.y+y}))
      .find(p=>p.x>=20&&p.x<=width-20&&p.y>=17&&p.y<=height-17&&pins.every(pin=>Math.hypot(pin.x-p.x,pin.y-p.y)>=30));
    if (!target) continue;
    if (target.x!==point.x || target.y!==point.y) {
      ctx.beginPath();
      ctx.moveTo(point.x,point.y);
      ctx.lineTo(target.x,target.y);
      ctx.strokeStyle="#718db7";
      ctx.lineWidth=1;
      ctx.stroke();
    }
    pins.push({id:building.id,...target});
  }
  return pins;
}
