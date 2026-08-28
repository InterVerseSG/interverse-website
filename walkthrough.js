// InterVerseSG browser walkthrough + active guidance layer.
// Adds first-person-style movement, visible user position, destination arrow and remaining distance.

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
    <button id="ivFaceTarget" type="button">Mirar al destino</button>
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
    ivUpdateWalkStatus();
    draw3D();
  });

  document.getElementById('ivGuideToggle').addEventListener('click',()=>{
    if(!selectedNav){
      setStatus('Selecciona primero un destino del campus.',true);
      return;
    }
    if(ivGuideEnabled&&ivGuideNav===selectedNav) ivStopGuidance();
    else ivStartGuidance(selectedNav,true);
  });

  document.getElementById('ivFaceTarget').addEventListener('click',()=>{
    if(!selectedNav){setStatus('Selecciona primero un destino.',true);return;}
    ivGuideNav=selectedNav;
    ivFaceSelectedTarget();
  });

  document.getElementById('ivWalkHome').addEventListener('click',()=>{
    ivCameraEast=0;ivCameraNorth=0;zoom=1;yaw=-0.55;pitch=0.75;
    ivGuideArrivalAnnounced=false;
    draw3D();ivUpdateWalkStatus();ivUpdateGuidanceStatus();
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
  const speed=55;
  const fx=Math.sin(-yaw),fz=Math.cos(-yaw),rx=Math.cos(-yaw),rz=-Math.sin(-yaw);
  ivCameraEast+=(fx*f+rx*s)*speed*dt;
  ivCameraNorth+=(fz*f+rz*s)*speed*dt;
  draw3D();ivUpdateWalkStatus();ivUpdateGuidanceStatus();
}

function ivUpdateWalkStatus(){
  const el=document.getElementById('ivWalkStatus');if(!el)return;
  if(!ivWalkEnabled){el.textContent=`Posición · E ${Math.round(ivCameraEast)} m · N ${Math.round(ivCameraNorth)} m`;return;}
  el.textContent=`Recorrido · E ${Math.round(ivCameraEast)} m · N ${Math.round(ivCameraNorth)} m`;
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
  const [lon,lat]=f.geometry.coordinates;
  const ll=L.latLng(lat,lon);
  const p=ivBaseLocalXY(ll,campusBounds.getCenter());
  return {nav,f,ll,east:p.x,north:p.z};
}

function ivGuideMetrics(){
  const t=ivTargetWorld();if(!t) return null;
  const dx=t.east-ivCameraEast,dz=t.north-ivCameraNorth;
  return {...t,dx,dz,distance:Math.hypot(dx,dz),bearing:Math.atan2(dx,dz)};
}

function ivStartGuidance(nav,face=true){
  if(!featureByNav.has(nav)){setStatus(`No existe información geográfica para ${nav}.`,true);return;}
  ivGuideEnabled=true;ivGuideNav=nav;ivGuideArrivalAnnounced=false;
  const btn=document.getElementById('ivGuideToggle');
  if(btn){btn.setAttribute('aria-pressed','true');btn.textContent='Detener guía';}
  if(face) ivFaceSelectedTarget();
  ivStartWalkLoop();ivUpdateGuidanceStatus();draw3D();
  const f=featureByNav.get(nav);
  setStatus(`Guía activa hacia ${displayForFeature(f)}.\nMuévete con WASD/flechas o los controles en pantalla.`);
}

function ivStopGuidance(){
  ivGuideEnabled=false;ivGuideNav=null;ivGuideArrivalAnnounced=false;
  const btn=document.getElementById('ivGuideToggle');
  if(btn){btn.setAttribute('aria-pressed','false');btn.textContent='Guíame al destino';}
  const s=document.getElementById('ivGuideStatus');if(s)s.textContent='Guía detenida.';
  if(!ivWalkEnabled) ivStopWalkLoop();
  draw3D();
}

function ivFaceSelectedTarget(){
  const nav=selectedNav||ivGuideNav;if(!nav) return;
  ivGuideNav=nav;
  const m=ivGuideMetrics();if(!m) return;
  yaw=-m.bearing;
  draw3D();ivUpdateGuidanceStatus();
}

function ivUpdateGuidanceStatus(){
  const el=document.getElementById('ivGuideStatus');if(!el)return;
  if(!ivGuideEnabled){
    const f=selectedNav?featureByNav.get(selectedNav):null;
    el.textContent=f?`Destino listo: ${displayForFeature(f)}.`:'Selecciona un destino para iniciar la guía.';
    return;
  }
  const m=ivGuideMetrics();if(!m){el.textContent='Destino de guía no disponible.';return;}
  const name=displayForFeature(m.f);
  const deg=(m.bearing*180/Math.PI+360)%360;
  el.textContent=`Guía → ${name} · ${Math.round(m.distance)} m · rumbo ${Math.round(deg)}°`;
  if(m.distance<=12&&!ivGuideArrivalAnnounced){
    ivGuideArrivalAnnounced=true;
    setStatus(`Has llegado al área de ${name}.\nDestino: ${m.nav}`);
  }else if(m.distance>16){ivGuideArrivalAnnounced=false;}
}

function ivDrawBuildingLabels3D(center,w,h){
  if(!Array.isArray(ivBuildingWays)||!ivBuildingWays.length) return;
  const labels=[];
  for(const b of ivBuildingWays){
    if(!b.nav) continue;
    const f=featureByNav.get(b.nav);if(!f) continue;
    const lat=b.points.reduce((a,p)=>a+p.lat,0)/b.points.length;
    const lng=b.points.reduce((a,p)=>a+p.lng,0)/b.points.length;
    const ll=L.latLng(lat,lng),q=localXY(ll,center);
    const y=ivTerrainHeight(ll)*2.2+ivBuildingHeight(b.tags)*2.2+7;
    const p=project({x:q.x,y,z:q.z},w,h);
    if(p.s<=0) continue;
    labels.push({p,text:displayForFeature(f),selected:b.nav===selectedNav});
  }
  labels.sort((a,b)=>a.p.y-b.p.y);
  ctx.textBaseline='middle';
  for(const l of labels){
    const font=l.selected?'bold 13px Arial':'12px Arial';ctx.font=font;
    const tw=ctx.measureText(l.text).width,pad=5;
    ctx.fillStyle=l.selected?'rgba(254,209,65,.94)':'rgba(255,255,255,.88)';
    ctx.fillRect(l.p.x-tw/2-pad,l.p.y-10,tw+pad*2,20);
    ctx.strokeStyle=l.selected?'#85714D':'rgba(0,93,72,.55)';ctx.lineWidth=1;ctx.strokeRect(l.p.x-tw/2-pad,l.p.y-10,tw+pad*2,20);
    ctx.fillStyle='#17211e';ctx.fillText(l.text,l.p.x-tw/2,l.p.y);
  }
}

function ivDrawUserAndGuidance(center,w,h){
  const centerLL=center;
  const userLL=L.latLng(
    centerLL.lat+(ivCameraNorth/6371000)*(180/Math.PI),
    centerLL.lng+(ivCameraEast/(6371000*Math.cos(centerLL.lat*Math.PI/180)))*(180/Math.PI)
  );
  const uy=ivTerrainHeight(userLL)*2.2+3;
  const up=project({x:0,y:uy,z:0},w,h);
  ctx.save();
  ctx.fillStyle='#ffffff';ctx.strokeStyle='#007B5F';ctx.lineWidth=3;
  ctx.beginPath();ctx.arc(up.x,up.y,8,0,Math.PI*2);ctx.fill();ctx.stroke();
  const fx=Math.sin(-yaw),fz=Math.cos(-yaw);
  const fp=project({x:fx*18,y:uy+2,z:fz*18},w,h);
  ctx.strokeStyle='#007B5F';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(up.x,up.y);ctx.lineTo(fp.x,fp.y);ctx.stroke();
  ctx.fillStyle='#17211e';ctx.font='bold 11px Arial';ctx.fillText('Tú',up.x+11,up.y-8);

  if(ivGuideEnabled){
    const m=ivGuideMetrics();
    if(m){
      const targetLocal={x:m.dx,z:m.dz};
      const ty=ivTerrainHeight(m.ll)*2.2+8;
      const tp=project({x:targetLocal.x,y:ty,z:targetLocal.z},w,h);
      ctx.strokeStyle='#FED141';ctx.lineWidth=5;ctx.setLineDash([10,7]);ctx.beginPath();ctx.moveTo(up.x,up.y);ctx.lineTo(tp.x,tp.y);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle='#FED141';ctx.strokeStyle='#85714D';ctx.lineWidth=2;ctx.beginPath();ctx.arc(tp.x,tp.y,10,0,Math.PI*2);ctx.fill();ctx.stroke();

      const angle=Math.atan2(tp.y-up.y,tp.x-up.x),ax=w/2,ay=58,len=36;
      ctx.save();ctx.translate(ax,ay);ctx.rotate(angle);ctx.fillStyle='#FED141';ctx.strokeStyle='#85714D';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(len,0);ctx.lineTo(3,-13);ctx.lineTo(3,13);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
      ctx.fillStyle='rgba(255,255,255,.94)';ctx.fillRect(w/2-100,78,200,30);ctx.strokeStyle='#007B5F';ctx.strokeRect(w/2-100,78,200,30);ctx.fillStyle='#17211e';ctx.font='bold 13px Arial';ctx.textAlign='center';ctx.fillText(`${displayForFeature(m.f)} · ${Math.round(m.distance)} m`,w/2,94);ctx.textAlign='start';
    }
  }
  ctx.restore();
}

const ivWalkDraw3D=draw3D;
draw3D=function(){
  ivWalkDraw3D();
  if(!ctx||!canvas||!campusBounds) return;
  const w=canvas.width/devicePixelRatio,h=canvas.height/devicePixelRatio;
  ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
  const center=campusBounds.getCenter();
  ivDrawBuildingLabels3D(center,w,h);
  ivDrawUserAndGuidance(center,w,h);
};

// Keep guidance synchronized when another part of the viewer changes selectedNav.
const ivOriginalShowDetails=showDetails;
showDetails=function(nav){
  ivOriginalShowDetails(nav);
  if(ivGuideEnabled&&nav!==ivGuideNav) ivStartGuidance(nav,false);
  else ivUpdateGuidanceStatus();
};

function ivWalkReady(){
  ivInjectWalkControls();
  const help=document.querySelector('.three-help');
  if(help) help.textContent='Arrastra para rotar, rueda para zoom o activa “Recorrer campus”. En recorrido usa WASD/flechas y Q/E. Selecciona un edificio y pulsa “Guíame al destino” para ver flecha y distancia restante.';
  ivUpdateWalkStatus();ivUpdateGuidanceStatus();draw3D();
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',ivWalkReady); else ivWalkReady();
