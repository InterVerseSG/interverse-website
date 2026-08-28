// InterVerseSG visual enhancement layer: surfaces, terrain sampling and 3D picking.
// Loaded after app.js so it can reuse the existing campus state without changing core navigation.

const IV_USGS_EPQS='https://epqs.nationalmap.gov/v1/json';
const IV_SURFACE_OVERPASS='https://overpass-api.de/api/interpreter';
let ivSurfaceWays=[];
let ivBuildingWays=[];
let ivTerrainSamples=[];
let iv3DHitTargets=[];
let ivSurfaceLayer=L.layerGroup().addTo(map);

function ivSurfaceKind(tags={}){
  if(tags.amenity==='parking') return 'parking';
  const h=tags.highway||'';
  if(['footway','path','pedestrian','steps'].includes(h)) return 'pedestrian';
  if(['service','residential','living_street'].includes(h)) return 'road';
  return 'other';
}

async function ivLoadCampusSurfaces(){
  if(!campusBounds) return;
  const b=campusBounds.pad(.28), sw=b.getSouthWest(), ne=b.getNorthEast();
  const q=`[out:json][timeout:25];(
    way[highway~"footway|path|pedestrian|steps|service|residential|living_street"](${sw.lat},${sw.lng},${ne.lat},${ne.lng});
    way[amenity=parking](${sw.lat},${sw.lng},${ne.lat},${ne.lng});
  );out body geom;`;
  try{
    const r=await fetch(IV_SURFACE_OVERPASS,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:'data='+encodeURIComponent(q)});
    if(!r.ok) throw new Error(`Overpass HTTP ${r.status}`);
    const data=await r.json();
    ivSurfaceWays=(data.elements||[]).filter(e=>e.type==='way'&&Array.isArray(e.geometry)&&e.geometry.length>1).map(e=>({
      id:e.id,
      kind:ivSurfaceKind(e.tags||{}),
      tags:e.tags||{},
      points:e.geometry.map(p=>L.latLng(p.lat,p.lon))
    }));
    ivDrawSurfaces2D();
    draw3D();
  }catch(e){
    console.warn('InterVerse surfaces unavailable',e);
  }
}

function ivDrawSurfaces2D(){
  ivSurfaceLayer.clearLayers();
  for(const s of ivSurfaceWays){
    const style=s.kind==='road'
      ? {color:'#6f7875',weight:5,opacity:.45}
      : s.kind==='parking'
        ? {color:'#85714D',weight:2,opacity:.35,fillColor:'#c9c2ae',fillOpacity:.2}
        : {color:'#d2a800',weight:3,opacity:.55};
    const closed=s.points.length>2 && s.points[0].equals(s.points[s.points.length-1]);
    if(s.kind==='parking'&&closed) L.polygon(s.points,style).addTo(ivSurfaceLayer);
    else L.polyline(s.points,style).addTo(ivSurfaceLayer);
  }
}

async function ivFetchElevation(ll){
  const u=`${IV_USGS_EPQS}?x=${encodeURIComponent(ll.lng)}&y=${encodeURIComponent(ll.lat)}&units=Meters&wkid=4326&includeDate=false`;
  const r=await fetch(u,{cache:'force-cache'});
  if(!r.ok) throw new Error(`USGS HTTP ${r.status}`);
  const j=await r.json();
  const value=Number(j.value ?? j.USGS_Elevation_Point_Query_Service?.Elevation_Query?.Elevation);
  if(!Number.isFinite(value)) throw new Error('USGS elevation missing');
  return value;
}

async function ivLoadTerrainSamples(){
  if(!campusBounds) return;
  const b=campusBounds.pad(.08), sw=b.getSouthWest(), ne=b.getNorthEast();
  const rows=5, cols=5, pts=[];
  for(let y=0;y<rows;y++) for(let x=0;x<cols;x++){
    const lat=sw.lat+(ne.lat-sw.lat)*(y/(rows-1));
    const lng=sw.lng+(ne.lng-sw.lng)*(x/(cols-1));
    pts.push({row:y,col:x,ll:L.latLng(lat,lng)});
  }
  const out=[];
  for(let i=0;i<pts.length;i+=5){
    const batch=pts.slice(i,i+5);
    const vals=await Promise.all(batch.map(async p=>{try{return {...p,elevation:await ivFetchElevation(p.ll)};}catch{return null;}}));
    out.push(...vals.filter(Boolean));
  }
  if(out.length>=8){
    const base=Math.min(...out.map(p=>p.elevation));
    ivTerrainSamples=out.map(p=>({...p,relative:p.elevation-base}));
    const el=document.getElementById('routingState');
    if(el) el.textContent += ` · Relieve USGS: ${out.length} muestras`;
    draw3D();
  }
}

function ivTerrainHeight(ll){
  if(!ivTerrainSamples.length) return 0;
  let total=0,ws=0;
  for(const p of ivTerrainSamples){
    const d=Math.max(1,hav(ll,p.ll));
    const w=1/(d*d);
    total+=p.relative*w; ws+=w;
  }
  return total/ws;
}

function ivDrawTerrain3D(center,w,h){
  if(!ivTerrainSamples.length) return;
  const byKey=new Map(ivTerrainSamples.map(p=>[`${p.row}:${p.col}`,p]));
  ctx.lineWidth=1;
  for(let r=0;r<4;r++) for(let c=0;c<4;c++){
    const cells=[[r,c],[r,c+1],[r+1,c+1],[r+1,c]].map(([rr,cc])=>byKey.get(`${rr}:${cc}`));
    if(cells.some(v=>!v)) continue;
    const pp=cells.map(s=>{const q=localXY(s.ll,center);return project({x:q.x,y:s.relative*2.2,z:q.z},w,h);});
    const avg=cells.reduce((a,b)=>a+b.relative,0)/4;
    const light=Math.max(36,Math.min(70,58-avg*.7));
    ctx.fillStyle=`hsl(145 23% ${light}%)`;
    ctx.strokeStyle='rgba(60,90,78,.28)';
    ctx.beginPath();ctx.moveTo(pp[0].x,pp[0].y);for(let i=1;i<pp.length;i++)ctx.lineTo(pp[i].x,pp[i].y);ctx.closePath();ctx.fill();ctx.stroke();
  }
}

function ivDrawSurfaces3D(center,w,h){
  for(const s of ivSurfaceWays){
    const pts=s.points.map(ll=>{const q=localXY(ll,center),y=ivTerrainHeight(ll)*2.2+1;return project({x:q.x,y,z:q.z},w,h);});
    if(pts.length<2) continue;
    ctx.strokeStyle=s.kind==='road'?'rgba(80,84,83,.8)':s.kind==='parking'?'rgba(133,113,77,.65)':'rgba(210,168,0,.85)';
    ctx.lineWidth=s.kind==='road'?5:s.kind==='pedestrian'?3:2;
    ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i].x,pts[i].y);ctx.stroke();
  }
}

function ivFindNavForWay(way){
  // Match a building footprint to the nearest registered POI.
  if(!way.points?.length) return null;
  const lat=way.points.reduce((a,p)=>a+p.lat,0)/way.points.length;
  const lng=way.points.reduce((a,p)=>a+p.lng,0)/way.points.length;
  const c=L.latLng(lat,lng);
  let best=null,dist=Infinity;
  for(const [nav,f] of featureByNav){
    const [lon,la]=f.geometry.coordinates,d=hav(c,L.latLng(la,lon));
    if(d<dist){dist=d;best=nav;}
  }
  return dist<80?best:null;
}

async function ivLoadBuildingsForPicking(){
  if(!campusBounds) return;
  const b=campusBounds.pad(.18),sw=b.getSouthWest(),ne=b.getNorthEast();
  const q=`[out:json][timeout:25];way[building](${sw.lat},${sw.lng},${ne.lat},${ne.lng});out body geom;`;
  try{
    const r=await fetch(IV_SURFACE_OVERPASS,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:'data='+encodeURIComponent(q)});
    if(!r.ok) throw new Error(`Overpass HTTP ${r.status}`);
    const data=await r.json();
    ivBuildingWays=(data.elements||[]).filter(e=>e.type==='way'&&Array.isArray(e.geometry)&&e.geometry.length>2).map(e=>({
      id:e.id,tags:e.tags||{},points:e.geometry.map(p=>L.latLng(p.lat,p.lon))
    }));
    for(const bldg of ivBuildingWays) bldg.nav=ivFindNavForWay(bldg);
    draw3D();
  }catch(e){console.warn('InterVerse building picking geometry unavailable',e);}
}

function ivBuildingHeight(tags={}){
  const h=parseFloat(tags.height);
  if(Number.isFinite(h)&&h>0) return h;
  const levels=parseFloat(tags['building:levels']);
  if(Number.isFinite(levels)&&levels>0) return levels*3;
  return 8; // visual fallback only when OSM does not publish height.
}

function ivDrawBuildings3D(center,w,h){
  iv3DHitTargets=[];
  const shapes=[];
  for(const b of ivBuildingWays){
    const local=b.points.map(ll=>{const q=localXY(ll,center);return {x:q.x,z:q.z,ll};});
    const base=local.reduce((a,p)=>a+ivTerrainHeight(p.ll),0)/Math.max(1,local.length)*2.2;
    const bh=ivBuildingHeight(b.tags)*2.2;
    const bottom=local.map(p=>project({x:p.x,y:base,z:p.z},w,h));
    const top=local.map(p=>project({x:p.x,y:base+bh,z:p.z},w,h));
    const depth=top.reduce((a,p)=>a+p.s,0)/Math.max(1,top.length);
    shapes.push({b,bottom,top,depth});
  }
  shapes.sort((a,b)=>a.depth-b.depth);
  for(const s of shapes){
    const selected=s.b.nav&&s.b.nav===selectedNav;
    ctx.fillStyle=selected?'rgba(254,209,65,.9)':'rgba(0,123,95,.62)';
    ctx.strokeStyle=selected?'#7b6700':'#005d48';ctx.lineWidth=1.2;
    ctx.beginPath();ctx.moveTo(s.top[0].x,s.top[0].y);for(let i=1;i<s.top.length;i++)ctx.lineTo(s.top[i].x,s.top[i].y);ctx.closePath();ctx.fill();ctx.stroke();
    for(let i=0;i<s.top.length-1;i++){
      const a=s.bottom[i],b=s.bottom[i+1],c=s.top[i+1],d=s.top[i];
      ctx.fillStyle=selected?'rgba(230,188,45,.72)':'rgba(0,98,75,.48)';
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(c.x,c.y);ctx.lineTo(d.x,d.y);ctx.closePath();ctx.fill();
    }
    const xs=s.top.map(p=>p.x),ys=s.top.map(p=>p.y);
    iv3DHitTargets.push({nav:s.b.nav,way:s.b,minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys)});
  }
}

// Extend the core renderer without changing app.js.
const ivCoreDraw3D=draw3D;
draw3D=function(){
  ivCoreDraw3D();
  if(!ctx||!canvas||!campusBounds) return;
  const w=canvas.width/devicePixelRatio,h=canvas.height/devicePixelRatio;
  ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
  const center=campusBounds.getCenter();
  // Overlay verified/contextual geospatial layers.
  ivDrawTerrain3D(center,w,h);
  ivDrawSurfaces3D(center,w,h);
  ivDrawBuildings3D(center,w,h);
  // redraw active route on top of geometry
  if(currentRoute.length>1){
    ctx.strokeStyle='#85714D';ctx.lineWidth=5;ctx.beginPath();
    currentRoute.forEach((ll,i)=>{const q=localXY(ll,center),p=project({x:q.x,y:ivTerrainHeight(ll)*2.2+5,z:q.z},w,h);i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);});ctx.stroke();
  }
};

function ivInstall3DPicking(){
  const c=document.getElementById('threeCanvas');
  if(!c) return;
  c.addEventListener('click',e=>{
    const r=c.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
    const hits=iv3DHitTargets.filter(t=>x>=t.minX&&x<=t.maxX&&y>=t.minY&&y<=t.maxY);
    if(!hits.length) return;
    const hit=hits[hits.length-1];
    if(hit.nav){
      showDetails(hit.nav);
      const f=featureByNav.get(hit.nav);
      setStatus(`Edificio seleccionado en 3D: ${f?displayForFeature(f):hit.nav}\n${hit.nav}`);
    }else{
      setStatus(`Edificio OSM ${hit.way.id} seleccionado. Todavía no está asociado a un NAV_* verificado.`);
    }
    draw3D();
  });
}

async function ivEnhanceWhenReady(){
  for(let i=0;i<40&&!campusBounds;i++) await new Promise(r=>setTimeout(r,250));
  if(!campusBounds) return;
  ivInstall3DPicking();
  await Promise.allSettled([ivLoadCampusSurfaces(),ivLoadBuildingsForPicking(),ivLoadTerrainSamples()]);
  draw3D();
}

ivEnhanceWhenReady();
