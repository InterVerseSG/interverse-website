// InterVerseSG browser walkthrough + active route guidance layer.
// Adds first-person-style movement, user position, route-following guidance, destination beacon and remaining distance.

let ivWalkEnabled=false;
let ivCameraEast=0;
let ivCameraNorth=0;
let ivWalkKeys=new Set();
let ivWalkFrame=null;
let ivLastWalkTime=0;
let ivGuideEnabled=false;
let ivGuideNav=null;
let ivGuideArrivalAnnounced=false;

const ivBaseLocalXY=localXY;
localXY=function(ll,center){
  const p=ivBaseLocalXY(ll,center);
  return {x:p.x-ivCameraEast,z:p.z-ivCameraNorth};
};

function ivInjectWalkControls(){
  const three=document.getElementById('threeView');
  if(!three||document.getElementById('ivWalkPanel')) return;
  const panel=document.createElement('div');
  panel.id='ivWalkPanel';
  panel.className='iv-walk-panel';
  panel.innerHTML=`
    <button id="ivWalkToggle" type="button" aria-pressed="false">Recorrer campus</button>
    <button id="ivGuideToggle" type="button" aria-pressed="false">Guíame al destino</button>
    <button id="ivFaceTarget" type="button">Mirar al próximo tramo</button>
    <button id="ivWalkOrigin" type="button">Ir al origen</button>
    <button id="ivWalkHome" type="button">Volver al centro</button>
    <div class="iv-walk-grid" aria-label="Controles de recorrido">
      <span></span><button data-walk="forward" type="button" aria-label="Avanzar">▲</button><span></span>
      <button data-walk="left" type="button" aria-label="Mover izquierda">◀</button>
      <button data-walk="back" type="button" aria-label="Retroceder">▼</button>
      <button data-walk="right" type="button" aria-label="Mover derecha">▶</button>
    </div>
    <div class="iv-walk-status" id="ivWalkStatus">Modo maqueta</div>
    <div class="iv-guide-status" id="ivGuideStatus" aria-live="polite">Selecciona un destino para iniciar la guía.</div>
  `;
  three.appendChild(panel);

  const toggle=document.getElementById('ivWalkToggle');
  toggle.addEventListener('click',()=>{
    ivWalkEnabled=!ivWalkEnabled;
    toggle.setAttribute('aria-pressed',String(ivWalkEnabled));
    toggle.textContent=ivWalkEnabled?'Salir de recorrido':'Recorrer campus';
    if(ivWalkEnabled) ivStartWalkLoop(); else ivStopWalkLoop();
    ivUpdateWalkStatus();draw3D();
  });

  document.getElementById('ivGuideToggle').addEventListener('click',()=>{
    if(!selectedNav){setStatus('Selecciona primero un destino del campus.',true);return;}
    if(ivGuideEnabled&&ivGuideNav===selectedNav) ivStopGuidance();
    else ivStartGuidance(selectedNav,true);
  });

  document.getElementById('ivFaceTarget').addEventListener('click',()=>{
    if(!selectedNav){setStatus('Selecciona primero un destino.',true);return;}
    ivGuideNav=selectedNav;ivFaceSelectedTarget();
  });

  document.getElementById('ivWalkOrigin').addEventListener('click',()=>{
    if(!ivPlaceUserAtOrigin()){setStatus('Selecciona un punto de origen válido.',true);return;}
    ivGuideArrivalAnnounced=false;draw3D();ivUpdateWalkStatus();ivUpdateGuidanceStatus();
  });

  document.getElementById('ivWalkHome').addEventListener('click',()=>{
    ivCameraEast=0;ivCameraNorth=0;zoom=1;yaw=-0.55;pitch=0.75;
    ivGuideArrivalAnnounced=false;draw3D();ivUpdateWalkStatus();ivUpdateGuidanceStatus();
  });

  panel.querySelectorAll('[data-walk]').forEach(btn=>{
    const key=btn.dataset.walk;
    const start=e=>{e.preventDefault();ivWalkEnabled=true;toggle.setAttribute('aria-pressed','true');toggle.textContent='Salir de recorrido';ivWalkKeys.add(key);ivStartWalkLoop();ivUpdateWalkStatus();};
    const stop=e=>{e.preventDefault();ivWalkKeys.delete(key);};
    btn.addEventListener('pointerdown',start);btn.addEventListener('pointerup',stop);btn.addEventListener('pointercancel',stop);btn.addEventListener('pointerleave',stop);
  });
}

function ivStartWalkLoop(){
  if(ivWalkFrame) return;
  ivLastWalkTime=performance.now();
  const tick=now=>{
    const dt=Math.min(.05,(now-ivLastWalkTime)/1000||0);ivLastWalkTime=now;
    if(ivWalkEnabled) ivStepWalk(dt);
    if(ivGuideEnabled) ivUpdateGuidanceStatus();
    ivWalkFrame=requestAnimationFrame(tick);
  };
  ivWalkFrame=requestAnimationFrame(tick);
}
function ivStopWalkLoop(){if(ivWalkFrame&&!ivGuideEnabled){cancelAnimationFrame(ivWalkFrame);ivWalkFrame=null;}ivWalkKeys.clear();}

function ivStepWalk(dt){
  let f=0,s=0,turn=0;
  if(ivWalkKeys.has('w')||ivWalkKeys.has('arrowup')||ivWalkKeys.has('forward')) f+=1;
  if(ivWalkKeys.has('s')||ivWalkKeys.has('arrowdown')||ivWalkKeys.has('back')) f-=1;
  if(ivWalkKeys.has('a')||ivWalkKeys.has('arrowleft')||ivWalkKeys.has('left')) s-=1;
  if(ivWalkKeys.has('d')||ivWalkKeys.has('arrowright')||ivWalkKeys.has('right')) s+=1;
  if(ivWalkKeys.has('q')) turn-=1;
  if(ivWalkKeys.has('e')) turn+=1;
  if(!f&&!s&&!turn) return;
  yaw+=turn*dt*1.25;
  const speed=55,fx=Math.sin(-yaw),fz=Math.cos(-yaw),rx=Math.cos(-yaw),rz=-Math.sin(-yaw);
  ivCameraEast+=(fx*f+rx*s)*speed*dt;ivCameraNorth+=(fz*f+rz*s)*speed*dt;
  draw3D();ivUpdateWalkStatus();ivUpdateGuidanceStatus();
}

function ivUpdateWalkStatus(){
  const el=document.getElementById('ivWalkStatus');if(!el)return;
  el.textContent=`${ivWalkEnabled?'Recorrido':'Posición'} · E ${Math.round(ivCameraEast)} m · N ${Math.round(ivCameraNorth)} m`;
}

function ivInputTarget(e){const t=e.target;return t&&(['INPUT','TEXTAREA','SELECT','BUTTON'].includes(t.tagName)||t.isContentEditable);}
window.addEventListener('keydown',e=>{
  if(!ivWalkEnabled||ivInputTarget(e)) return;
  const k=e.key.toLowerCase();
  if(['w','a','s','d','q','e','arrowup','arrowdown','arrowleft','arrowright'].includes(k)){e.preventDefault();ivWalkKeys.add(k);ivStartWalkLoop();}
});
window.addEventListener('keyup',e=>ivWalkKeys.delete(e.key.toLowerCase()));

function ivTargetWorld(nav=ivGuideNav){
  if(!nav||!campusBounds) return null;
  const f=featureByNav.get(nav);if(!f) return null;
  const [lon,lat]=f.geometry.coordinates,ll=L.latLng(lat,lon),p=ivBaseLocalXY(ll,campusBounds.getCenter());
  return {nav,f,ll,east:p.x,north:p.z};
}

function ivOriginWorld(){
  if(!campusBounds||!originEl?.value)return null;
  const ll=latLngForNav(originEl.value);if(!ll)return null;
  const p=ivBaseLocalXY(ll,campusBounds.getCenter());
  return {nav:originEl.value,ll,east:p.x,north:p.z};
}

function ivPlaceUserAtOrigin(){
  const o=ivOriginWorld();if(!o)return false;
  ivCameraEast=o.east;ivCameraNorth=o.north;ivGuideArrivalAnnounced=false;
  return true;
}

function ivRouteWorldPoints(){
  if(!campusBounds||!Array.isArray(currentRoute)||currentRoute.length<2)return [];
  const c=campusBounds.getCenter();
  return currentRoute.map(ll=>{const p=ivBaseLocalXY(ll,c);return {ll,x:p.x,z:p.z};});
}

function ivClosestRoutePosition(points,userX,userZ){
  if(points.length<2)return null;
  let best=null;
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1],vx=b.x-a.x,vz=b.z-a.z,len2=vx*vx+vz*vz;
    const t=len2?Math.max(0,Math.min(1,((userX-a.x)*vx+(userZ-a.z)*vz)/len2)):0;
    const x=a.x+vx*t,z=a.z+vz*t,d2=(userX-x)**2+(userZ-z)**2;
    if(!best||d2<best.d2)best={i,t,x,z,d2};
  }
  return best;
}

function ivAdvanceOnRoute(points,pos,lookAhead=24){
  let i=pos.i,x=pos.x,z=pos.z,left=lookAhead;
  while(i<points.length-1){
    const b=points[i+1],dx=b.x-x,dz=b.z-z,len=Math.hypot(dx,dz);
    if(len>=left&&len>0)return {x:x+dx*(left/len),z:z+dz*(left/len),index:i+1};
    left-=len;i++;x=points[i].x;z=points[i].z;
  }
  const last=points[points.length-1];return {x:last.x,z:last.z,index:points.length-1};
}

function ivRemainingRouteDistance(points,pos){
  let total=Math.hypot(points[pos.i+1].x-pos.x,points[pos.i+1].z-pos.z);
  for(let i=pos.i+1;i<points.length-1;i++)total+=Math.hypot(points[i+1].x-points[i].x,points[i+1].z-points[i].z);
  return total;
}

function ivGuideMetrics(){
  const t=ivTargetWorld();if(!t) return null;
  const route=ivRouteWorldPoints();
  if(route.length>1){
    const pos=ivClosestRoutePosition(route,ivCameraEast,ivCameraNorth);
    if(pos){
      const waypoint=ivAdvanceOnRoute(route,pos,24),dx=waypoint.x-ivCameraEast,dz=waypoint.z-ivCameraNorth;
      return {...t,dx,dz,distance:ivRemainingRouteDistance(route,pos),bearing:Math.atan2(dx,dz),routeMode:true,routePosition:pos,waypoint};
    }
  }
  const dx=t.east-ivCameraEast,dz=t.north-ivCameraNorth;
  return {...t,dx,dz,distance:Math.hypot(dx,dz),bearing:Math.atan2(dx,dz),routeMode:false};
}

function ivStartGuidance(nav,face=true){
  if(!featureByNav.has(nav)){setStatus(`No existe información geográfica para ${nav}.`,true);return;}
  ivGuideEnabled=true;ivGuideNav=nav;ivGuideArrivalAnnounced=false;
  const btn=document.getElementById('ivGuideToggle');if(btn){btn.setAttribute('aria-pressed','true');btn.textContent='Detener guía';}
  if(face) ivFaceSelectedTarget();ivStartWalkLoop();ivUpdateGuidanceStatus();draw3D();
  const f=featureByNav.get(nav);setStatus(`Guía activa hacia ${displayForFeature(f)}.\n${ivRouteWorldPoints().length>1?'Siguiendo la ruta peatonal calculada.':'Usando dirección directa como respaldo.'}`);
}
function ivStopGuidance(){
  ivGuideEnabled=false;ivGuideNav=null;ivGuideArrivalAnnounced=false;
  const btn=document.getElementById('ivGuideToggle');if(btn){btn.setAttribute('aria-pressed','false');btn.textContent='Guíame al destino';}
  const s=document.getElementById('ivGuideStatus');if(s)s.textContent='Guía detenida.';
  if(!ivWalkEnabled) ivStopWalkLoop();draw3D();
}
function ivFaceSelectedTarget(){
  const nav=selectedNav||ivGuideNav;if(!nav)return;ivGuideNav=nav;
  const m=ivGuideMetrics();if(!m)return;yaw=-m.bearing;draw3D();ivUpdateGuidanceStatus();
}
function ivUpdateGuidanceStatus(){
  const el=document.getElementById('ivGuideStatus');if(!el)return;
  if(!ivGuideEnabled){const f=selectedNav?featureByNav.get(selectedNav):null;el.textContent=f?`Destino listo: ${displayForFeature(f)}.`:'Selecciona un destino para iniciar la guía.';return;}
  const m=ivGuideMetrics();if(!m){el.textContent='Destino de guía no disponible.';return;}
  const name=displayForFeature(m.f),deg=(m.bearing*180/Math.PI+360)%360,mode=m.routeMode?'ruta peatonal':'dirección directa';
  el.textContent=`Guía → ${name} · ${Math.round(m.distance)} m restantes · ${mode} · rumbo ${Math.round(deg)}°`;
  if(m.distance<=12&&!ivGuideArrivalAnnounced){ivGuideArrivalAnnounced=true;setStatus(`Has llegado al área de ${name}.\nDestino: ${m.nav}`);}else if(m.distance>16)ivGuideArrivalAnnounced=false;
}

function ivShow3D(){
  const button=document.getElementById('view3D');
  if(button){button.click();return;}
  const mapEl=document.getElementById('map'),three=document.getElementById('threeView');
  if(mapEl)mapEl.style.display='none';if(three)three.style.display='block';setTimeout(draw3D,30);
}

async function ivWaitForRoute(timeout=3500){
  const started=performance.now();
  while(performance.now()-started<timeout){
    if(Array.isArray(currentRoute)&&currentRoute.length>1)return true;
    await new Promise(r=>setTimeout(r,120));
  }
  return false;
}

async function ivActivateNavigationCommand(nav){
  if(!nav||!featureByNav.has(nav))return;
  await ivWaitForRoute();
  ivPlaceUserAtOrigin();
  ivShow3D();ivGuideNav=nav;ivStartGuidance(nav,true);
  const f=featureByNav.get(nav),name=displayForFeature(f);
  setStatus(`Ruta y guía 3D activadas hacia ${name}.\nInicio: ${originEl?.selectedOptions?.[0]?.textContent||'origen seleccionado'} · ${ivRouteWorldPoints().length>1?'ruta peatonal':'dirección directa'}.`);
}

function ivInstallCommandAutoGuide(){
  const send=document.getElementById('send');if(!send||send.dataset.ivAutoGuide==='1')return;
  send.dataset.ivAutoGuide='1';
  const installWatch=()=>{
    const before=selectedNav,started=performance.now();
    const watch=()=>{
      if(selectedNav&&selectedNav!==before){setTimeout(()=>ivActivateNavigationCommand(selectedNav),250);return;}
      if(performance.now()-started<15000)setTimeout(watch,180);
    };
    setTimeout(watch,180);
  };
  send.addEventListener('click',installWatch);
  const command=document.getElementById('command');if(command)command.addEventListener('keydown',e=>{if(e.key==='Enter')installWatch();});
}

function ivBoxesOverlap(a,b){return !(a.r<b.l||a.l>b.r||a.b<b.t||a.t>b.b);}
function ivDrawBuildingLabels3D(center,w,h){
  if(!Array.isArray(ivBuildingWays)||!ivBuildingWays.length)return;
  const labels=[];
  for(const b of ivBuildingWays){
    if(!b.nav)continue;const f=featureByNav.get(b.nav);if(!f)continue;
    const lat=b.points.reduce((a,p)=>a+p.lat,0)/b.points.length,lng=b.points.reduce((a,p)=>a+p.lng,0)/b.points.length;
    const ll=L.latLng(lat,lng),q=localXY(ll,center),y=ivTerrainHeight(ll)*2.2+ivBuildingHeight(b.tags)*2.2+9,p=project({x:q.x,y,z:q.z},w,h);
    if(p.s<=0||p.x<-80||p.x>w+80||p.y<-40||p.y>h+40)continue;
    labels.push({p,text:displayForFeature(f),selected:b.nav===selectedNav,nav:b.nav});
  }
  labels.sort((a,b)=>(b.selected-a.selected)||(b.p.s-a.p.s));
  const occupied=[];ctx.textBaseline='middle';
  for(const l of labels){
    const font=l.selected?'bold 15px Arial':'12px Arial';ctx.font=font;
    const tw=ctx.measureText(l.text).width,pad=l.selected?7:5,bh=l.selected?25:20,box={l:l.p.x-tw/2-pad,r:l.p.x+tw/2+pad,t:l.p.y-bh/2,b:l.p.y+bh/2};
    if(occupied.some(o=>ivBoxesOverlap(box,o))&&!l.selected)continue;occupied.push(box);
    if(l.selected){ctx.strokeStyle='rgba(254,209,65,.55)';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(l.p.x,l.p.y+bh/2);ctx.lineTo(l.p.x,l.p.y+46);ctx.stroke();}
    ctx.fillStyle=l.selected?'rgba(254,209,65,.97)':'rgba(255,255,255,.90)';ctx.fillRect(box.l,box.t,box.r-box.l,box.b-box.t);
    ctx.strokeStyle=l.selected?'#85714D':'rgba(0,93,72,.50)';ctx.lineWidth=l.selected?2:1;ctx.strokeRect(box.l,box.t,box.r-box.l,box.b-box.t);
    ctx.fillStyle='#17211e';ctx.fillText(l.text,l.p.x-tw/2,l.p.y);
  }
}

function ivSelectedDestinationPoint(center){
  if(!selectedNav)return null;const t=ivTargetWorld(selectedNav);if(!t)return null;
  const q=localXY(t.ll,center),ground=ivTerrainHeight(t.ll)*2.2;return {t,q,ground};
}
function ivDrawDestinationBeacon(center,w,h){
  const d=ivSelectedDestinationPoint(center);if(!d)return;
  const base=project({x:d.q.x,y:d.ground+3,z:d.q.z},w,h),top=project({x:d.q.x,y:d.ground+80,z:d.q.z},w,h);
  ctx.save();ctx.strokeStyle='rgba(254,209,65,.88)';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(base.x,base.y);ctx.lineTo(top.x,top.y);ctx.stroke();
  ctx.fillStyle='rgba(254,209,65,.22)';ctx.beginPath();ctx.arc(base.x,base.y,18,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#85714D';ctx.lineWidth=3;ctx.beginPath();ctx.arc(base.x,base.y,18,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle='#FED141';ctx.beginPath();ctx.moveTo(top.x,top.y-12);ctx.lineTo(top.x-10,top.y+7);ctx.lineTo(top.x+10,top.y+7);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
}

function ivDrawUserAndGuidance(center,w,h){
  const centerLL=center,userLL=L.latLng(centerLL.lat+(ivCameraNorth/6371000)*(180/Math.PI),centerLL.lng+(ivCameraEast/(6371000*Math.cos(centerLL.lat*Math.PI/180)))*(180/Math.PI));
  const uy=ivTerrainHeight(userLL)*2.2+3,up=project({x:0,y:uy,z:0},w,h);
  ctx.save();ctx.fillStyle='#fff';ctx.strokeStyle='#007B5F';ctx.lineWidth=3;ctx.beginPath();ctx.arc(up.x,up.y,8,0,Math.PI*2);ctx.fill();ctx.stroke();
  const fx=Math.sin(-yaw),fz=Math.cos(-yaw),fp=project({x:fx*18,y:uy+2,z:fz*18},w,h);
  ctx.strokeStyle='#007B5F';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(up.x,up.y);ctx.lineTo(fp.x,fp.y);ctx.stroke();ctx.fillStyle='#17211e';ctx.font='bold 11px Arial';ctx.fillText('Tú',up.x+11,up.y-8);
  if(ivGuideEnabled){
    const m=ivGuideMetrics();if(m){
      const guideLL=m.routeMode?userLL:m.ll,gy=ivTerrainHeight(guideLL)*2.2+8,tp=project({x:m.dx,y:gy,z:m.dz},w,h);
      ctx.strokeStyle='#FED141';ctx.lineWidth=5;ctx.setLineDash([10,7]);ctx.beginPath();ctx.moveTo(up.x,up.y);ctx.lineTo(tp.x,tp.y);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='#FED141';ctx.strokeStyle='#85714D';ctx.lineWidth=2;ctx.beginPath();ctx.arc(tp.x,tp.y,9,0,Math.PI*2);ctx.fill();ctx.stroke();
      const angle=Math.atan2(tp.y-up.y,tp.x-up.x),ax=w/2,ay=58,len=36;
      ctx.save();ctx.translate(ax,ay);ctx.rotate(angle);ctx.fillStyle='#FED141';ctx.strokeStyle='#85714D';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(len,0);ctx.lineTo(3,-13);ctx.lineTo(3,13);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
      ctx.fillStyle='rgba(255,255,255,.95)';ctx.fillRect(w/2-125,78,250,34);ctx.strokeStyle='#007B5F';ctx.strokeRect(w/2-125,78,250,34);ctx.fillStyle='#17211e';ctx.font='bold 13px Arial';ctx.textAlign='center';ctx.fillText(`${displayForFeature(m.f)} · ${Math.round(m.distance)} m ${m.routeMode?'por ruta':''}`,w/2,96);ctx.textAlign='start';
    }
  }
  ctx.restore();
}

const ivWalkDraw3D=draw3D;
draw3D=function(){
  ivWalkDraw3D();if(!ctx||!canvas||!campusBounds)return;
  const w=canvas.width/devicePixelRatio,h=canvas.height/devicePixelRatio;ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
  const center=campusBounds.getCenter();ivDrawDestinationBeacon(center,w,h);ivDrawBuildingLabels3D(center,w,h);ivDrawUserAndGuidance(center,w,h);
};

const ivOriginalShowDetails=showDetails;
showDetails=function(nav){ivOriginalShowDetails(nav);if(ivGuideEnabled&&nav!==ivGuideNav)ivStartGuidance(nav,false);else ivUpdateGuidanceStatus();};

function ivWalkReady(){
  ivInjectWalkControls();ivInstallCommandAutoGuide();
  const help=document.querySelector('.three-help');
  if(help)help.textContent='La guía sigue la ruta peatonal cuando está disponible. Escribe “Llévame a…” para abrir 3D automáticamente; usa WASD/flechas y Q/E para recorrer el campus.';
  ivUpdateWalkStatus();ivUpdateGuidanceStatus();draw3D();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ivWalkReady);else ivWalkReady();