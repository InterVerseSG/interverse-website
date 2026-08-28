// InterVerseSG browser walkthrough layer.
// Adds first-person-style panning over the existing lightweight 3D canvas without changing core navigation.

let ivWalkEnabled=false;
let ivCameraEast=0;
let ivCameraNorth=0;
let ivWalkKeys=new Set();
let ivWalkFrame=null;
let ivLastWalkTime=0;

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
    <button id="ivWalkHome" type="button">Volver al centro</button>
    <div class="iv-walk-grid" aria-label="Controles de recorrido">
      <span></span><button data-walk="forward" type="button" aria-label="Avanzar">▲</button><span></span>
      <button data-walk="left" type="button" aria-label="Mover izquierda">◀</button>
      <button data-walk="back" type="button" aria-label="Retroceder">▼</button>
      <button data-walk="right" type="button" aria-label="Mover derecha">▶</button>
    </div>
    <div class="iv-walk-status" id="ivWalkStatus">Modo maqueta</div>
  `;
  three.appendChild(panel);

  const toggle=document.getElementById('ivWalkToggle');
  toggle.addEventListener('click',()=>{
    ivWalkEnabled=!ivWalkEnabled;
    toggle.setAttribute('aria-pressed',String(ivWalkEnabled));
    toggle.textContent=ivWalkEnabled?'Salir de recorrido':'Recorrer campus';
    document.getElementById('ivWalkStatus').textContent=ivWalkEnabled?'WASD / flechas para moverte · Q/E para girar':'Modo maqueta';
    if(ivWalkEnabled) ivStartWalkLoop(); else ivStopWalkLoop();
  });
  document.getElementById('ivWalkHome').addEventListener('click',()=>{
    ivCameraEast=0;ivCameraNorth=0;zoom=1;yaw=-0.55;pitch=0.75;draw3D();ivUpdateWalkStatus();
  });

  panel.querySelectorAll('[data-walk]').forEach(btn=>{
    const key=btn.dataset.walk;
    const start=e=>{e.preventDefault();ivWalkEnabled=true;toggle.setAttribute('aria-pressed','true');toggle.textContent='Salir de recorrido';ivWalkKeys.add(key);ivStartWalkLoop();};
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
    ivWalkFrame=requestAnimationFrame(tick);
  };
  ivWalkFrame=requestAnimationFrame(tick);
}
function ivStopWalkLoop(){if(ivWalkFrame){cancelAnimationFrame(ivWalkFrame);ivWalkFrame=null;}ivWalkKeys.clear();}

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
  draw3D();ivUpdateWalkStatus();
}

function ivUpdateWalkStatus(){
  const el=document.getElementById('ivWalkStatus');if(!el)return;
  if(!ivWalkEnabled){el.textContent='Modo maqueta';return;}
  el.textContent=`Recorrido · E ${Math.round(ivCameraEast)} m · N ${Math.round(ivCameraNorth)} m`;
}

function ivInputTarget(e){const t=e.target;return t&&(['INPUT','TEXTAREA','SELECT','BUTTON'].includes(t.tagName)||t.isContentEditable);}
window.addEventListener('keydown',e=>{
  if(!ivWalkEnabled||ivInputTarget(e)) return;
  const k=e.key.toLowerCase();
  if(['w','a','s','d','q','e','arrowup','arrowdown','arrowleft','arrowright'].includes(k)){e.preventDefault();ivWalkKeys.add(k);ivStartWalkLoop();}
});
window.addEventListener('keyup',e=>ivWalkKeys.delete(e.key.toLowerCase()));

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

const ivWalkDraw3D=draw3D;
draw3D=function(){
  ivWalkDraw3D();
  if(!ctx||!canvas||!campusBounds) return;
  const w=canvas.width/devicePixelRatio,h=canvas.height/devicePixelRatio;
  ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);
  ivDrawBuildingLabels3D(campusBounds.getCenter(),w,h);
};

function ivWalkReady(){
  ivInjectWalkControls();
  const help=document.querySelector('.three-help');
  if(help) help.textContent='Arrastra para rotar, rueda para zoom o activa “Recorrer campus”. En recorrido usa WASD/flechas y Q/E. Haz clic en edificios para seleccionarlos.';
  draw3D();
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',ivWalkReady); else ivWalkReady();
