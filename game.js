(function(){
"use strict";
const SIZE=5, C=2;
const SPAWNS=[[2,2,2],[1,2,2],[3,2,2],[2,2,1],[2,2,3]];
let EXIT=[4,4,4]; // se aleatoriza en borde al pulsar ENTRAR
function isBorder(p){ return p[0]===0||p[0]===SIZE-1||p[1]===0||p[1]===SIZE-1||p[2]===0||p[2]===SIZE-1; }
function randomBorderExit(){
  let p;
  do{
    p=[Math.floor(Math.random()*SIZE),Math.floor(Math.random()*SIZE),Math.floor(Math.random()*SIZE)];
  }while(!isBorder(p));
  return p;
}
const DIRS={
  E:{d:[1,0,0],label:"ESTE",wall:"+X"},
  O:{d:[-1,0,0],label:"OESTE",wall:"-X"},
  N:{d:[0,0,1],label:"NORTE",wall:"+Z"},
  S:{d:[0,0,-1],label:"SUR",wall:"-Z"},
  UP:{d:[0,1,0],label:"ARRIBA",wall:"+Y"},
  DOWN:{d:[0,-1,0],label:"ABAJO",wall:"-Y"}
};
const ROOM_NAMES=["ADIVINA EL NÚMERO","SECUENCIA LÓGICA","MEMORIA FOTOGRÁFICA","DILEMA LÓGICO","REFLEJOS"];
const ROOM_DESC=[
  "Un teclado parpadea: adivina el número oculto del 1 al 10 en 3 intentos.",
  "La pared muestra una secuencia incompleta. Halla el siguiente número.",
  "Memoriza un código de 4 cifras que se ocultará en 5 segundos.",
  "El cubo te interroga. Elige la respuesta correcta.",
  "Espera al verde y pulsa lo antes posible (<1.5s)."
];

// --- estado ---
let pos=[...SPAWNS[Math.floor(Math.random()*SPAWNS.length)]];
let lives=3, moves=0, startTime=null, elapsed=0, timerInt=null;
let solvedRooms=new Set(), visited=new Set(), pathOrder=[];
let roomUnlocked=false, currentRoomPuzzle=null, doorPuzzle=null, pendingDir=null;
let playing=false;
let doorChallengesEnabled=true;
let centerLightEnabled=false; // luz central desactivada por defecto (se activa en el panel)
let compassPos=null, compassCollected=false, showCompassOnMap=false;

// --- utils seed ---
function hash3(x,y,z){
  let h=(x*73856093)^(y*19349663)^(z*83492791);
  h=Math.imul(h^0x9e3779b9, 0x85ebca6b); h^=h>>>13; h=Math.imul(h,0xc2b2ae35); h^=h>>>16;
  return h>>>0;
}
function rng32(seed){ let a=seed>>>0; return function(){ a|=0;a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function key(x,y,z){return x+","+y+","+z;}
function isSpawn(x,y,z){return SPAWNS.some(s=>s[0]===x&&s[1]===y&&s[2]===z);}
function isExit(x,y,z){return x===EXIT[0]&&y===EXIT[1]&&z===EXIT[2];}
function manhattan(a,b){return Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])+Math.abs(a[2]-b[2]);}
function distCenter(p){return manhattan(p,[C,C,C]);}
function sector(p){const d=distCenter(p); if(d<=1)return "NÚCLEO"; if(d<=3)return "INTERIOR"; if(d<=4)return "MEDIO"; return "EXTERIOR";}
function roomInfo(x,y,z){
  const h=hash3(x,y,z), r=rng32(h);
  if(isSpawn(x,y,z)) return {trap:false,type:h%5,safe:true};
  if(isExit(x,y,z)) return {trap:false,type:1,safe:true,exit:true};
  const trap=(h%100)<12;
  return {trap,type:Math.floor(r()*5),safe:!trap};
}
function doorDifficulty(p){
  const d=distCenter(p);
  if(d<=1)return 0; if(d<=3)return 1; if(d<=4)return 2; return 3;
}
function genDoorMath(p){
  const lvl=doorDifficulty(p), R=Math.random;
  let q,a;
  if(lvl===0){const x=2+Math.floor(R()*19),y=2+Math.floor(R()*19);q=`${x} + ${y} = ?`;a=x+y;}
  else if(lvl===1){ if(R()<.5){const x=3+Math.floor(R()*10),y=3+Math.floor(R()*10);q=`${x} × ${y} = ?`;a=x*y;}
    else{const x=10+Math.floor(R()*40),y=2+Math.floor(R()*19);q=`${x} − ${y} = ?`;a=x-y;}}
  else if(lvl===2){const x=2+Math.floor(R()*8),y=2+Math.floor(R()*8),z=2+Math.floor(R()*20);q=`${x} × ${y} + ${z} = ?`;a=x*y+z;}
  else{const x=2+Math.floor(R()*8),b=1+Math.floor(R()*20),s=x*Math.floor(2+R()*9)+b;q=`${x}x + ${b} = ${s}  →  x = ?`;a=(s-b)/x;}
  return {q,a,lvl};
}
function genRoomPuzzle(x,y,z){
  const info=roomInfo(x,y,z);
  const rr=rng32(hash3(x,y,z));
  const type=info.type;
  if(type===0) return {type, target:1+Math.floor(rr()*10), attempts:3};
  if(type===1){const a=1+Math.floor(rr()*9), d=2+Math.floor(rr()*5);
    return {type, seq:[a,a+d,a+2*d,a+3*d], answer:a+4*d};}
  if(type===2) return {type, code:String(Math.floor(rr()*10000)).padStart(4,"0")};
  if(type===3){
    const primes=[2,3,5,7,11,13,17,19,23,29,31];
    const comp=[4,6,8,9,10,12,14,15,16,18,20,21,22,24,25,26,27];
    const p=primes[Math.floor(rr()*primes.length)];
    let c1=comp[Math.floor(rr()*comp.length)], c2=comp[Math.floor(rr()*comp.length)];
    if(c2===c1)c2=comp[(comp.indexOf(c1)+3)%comp.length];
    let opts=[p,c1,c2].sort(()=>rr()-.5);
    return {type, prime:p, opts};
  }
  return {type};
}

// --- estilos steampunk / cyberpunk por sala (diseño distinto por pared) ---
function roomStyle(x,y,z){
  const h=hash3(x,y,z);
  // la salida NO tiene estilo especial: paredes indistinguibles de cualquier sala
  if(isSpawn(x,y,z)) return {family:(h%2?"cyberpunk":"steampunk"), variant:h%4, seed:h, label:(h%2?"CYBERPUNK · NÚCLEO":"STEAMPUNK · NÚCLEO")};
  const fam=(h%2===0)?"steampunk":"cyberpunk";
  return {family:fam, variant:Math.floor(h/7)%4, seed:h, label:(fam==="steampunk"?"STEAMPUNK":"CYBERPUNK")+" · V"+(Math.floor(h/7)%4+1)};
}
function drawGear(g,cx,cy,r,teeth,col){
  g.save(); g.translate(cx,cy);
  g.fillStyle=col;
  for(let i=0;i<teeth;i++){g.save();g.rotate(i/teeth*Math.PI*2);g.fillRect(-r*.12,-r*1.18,r*.24,r*.36);g.restore();}
  g.beginPath();g.arc(0,0,r,0,7);g.fill();
  g.fillStyle="rgba(0,0,0,.55)";g.beginPath();g.arc(0,0,r*.62,0,7);g.fill();
  g.strokeStyle="rgba(255,220,150,.7)";g.lineWidth=3;
  for(let i=0;i<5;i++){g.save();g.rotate(i/5*Math.PI*2);g.beginPath();g.moveTo(0,0);g.lineTo(0,-r*.6);g.stroke();g.restore();}
  g.fillStyle="#1a0f05";g.beginPath();g.arc(0,0,r*.18,0,7);g.fill();
  g.restore();
}
function makeWallTexture(x,y,z,face){
  const st=roomStyle(x,y,z);
  const rr=rng32((hash3(x,y,z)^Math.imul(face+1,0x9e3779b1))>>>0);
  const S=512, cnv=document.createElement("canvas"); cnv.width=S; cnv.height=S;
  const g=cnv.getContext("2d");
  if(st.family==="steampunk"){
    const c1=["#2b1a0c","#33200e","#241608","#3a2410"][ (st.variant+face)%4 ];
    const c2=["#6e4a20","#7d5527","#5f3f1e","#8a6130"][ (st.variant+face)%4 ];
    const gr=g.createLinearGradient(0,0,S,S); gr.addColorStop(0,c1); gr.addColorStop(.5,c2); gr.addColorStop(1,c1);
    g.fillStyle=gr; g.fillRect(0,0,S,S);
    // placas remachadas
    g.strokeStyle="rgba(0,0,0,.7)"; g.lineWidth=6;
    g.strokeRect(14,14,S-28,S-28);
    g.strokeStyle="rgba(255,220,150,.25)"; g.lineWidth=2;
    g.strokeRect(22,22,S-44,S-44);
    g.beginPath(); g.moveTo(S/2,14); g.lineTo(S/2,S-14); g.moveTo(14,S/2); g.lineTo(S-14,S/2);
    g.strokeStyle="rgba(0,0,0,.5)"; g.lineWidth=4; g.stroke();
    // tuberías distintas por pared
    const pipes=1+Math.floor(rr()*2);
    for(let i=0;i<pipes;i++){
      const horiz=rr()<.5, p=60+rr()*(S-120), w=26+rr()*22;
      g.fillStyle="#1c1208"; horiz?g.fillRect(0,p-w/2-4,S,w+8):g.fillRect(p-w/2-4,0,w+8,S);
      const pg2=horiz?g.createLinearGradient(0,p-w/2,0,p+w/2):g.createLinearGradient(p-w/2,0,p+w/2,0);
      pg2.addColorStop(0,"#3a250f"); pg2.addColorStop(.5,"#c9984f"); pg2.addColorStop(1,"#3a250f");
      g.fillStyle=pg2; horiz?g.fillRect(0,p-w/2,S,w):g.fillRect(p-w/2,0,w,S);
      g.fillStyle="rgba(0,0,0,.4)";
      for(let b=40;b<S;b+=110){ horiz?g.fillRect(b,p-w/2-4,8,w+8):g.fillRect(p-w/2-4,b,w+8,8); }
    }
    // engranajes (posición distinta por pared)
    const ng=2+Math.floor(rr()*2);
    for(let i=0;i<ng;i++) drawGear(g, 70+rr()*(S-140), 70+rr()*(S-140), 34+rr()*52, 8+Math.floor(rr()*6), rr()<.5?"#8a6a35":"#5e4a2a");
    // remaches borde
    for(let i=24;i<=S-24;i+=56){
      [[i,24],[i,S-24],[24,i],[S-24,i]].forEach(([rx,ry])=>{
        const rg=g.createRadialGradient(rx-3,ry-3,1,rx,ry,10);
        rg.addColorStop(0,"#ffe9b0"); rg.addColorStop(.5,"#8a6a35"); rg.addColorStop(1,"#201205");
        g.fillStyle=rg; g.beginPath(); g.arc(rx,ry,9,0,7); g.fill();
      });
    }
    // rayones / suciedad
    g.strokeStyle="rgba(0,0,0,.25)";
    for(let i=0;i<40;i++){g.lineWidth=1+rr()*2;g.beginPath();const sx=rr()*S,sy=rr()*S;g.moveTo(sx,sy);g.lineTo(sx+(rr()-.5)*90,sy+(rr()-.5)*90);g.stroke();}
  } else {
    const base=g.createLinearGradient(0,0,0,S); base.addColorStop(0,"#04050e"); base.addColorStop(1,"#0a1030");
    g.fillStyle=base; g.fillRect(0,0,S,S);
    const neon=[["#00f0ff","#ff2bd6"],["#7cff00","#00f0ff"],["#ff2bd6","#7c4dff"],["#00f0ff","#ffe600"]][ (st.variant+face)%4 ];
    // rejilla
    g.strokeStyle="rgba(0,240,255,.18)"; g.lineWidth=1;
    for(let i=0;i<=S;i+=32){g.beginPath();g.moveTo(i,0);g.lineTo(i,S);g.stroke();g.beginPath();g.moveTo(0,i);g.lineTo(S,i);g.stroke();}
    // circuitos (trazas distintas por pared)
    for(let i=0;i<14;i++){
      g.strokeStyle=i%2?neon[0]:neon[1]; g.lineWidth=3; g.shadowColor=g.strokeStyle; g.shadowBlur=12;
      let px=rr()*S, py=rr()*S; g.beginPath(); g.moveTo(px,py);
      for(let s=0;s<4;s++){ if(rr()<.5) px=Math.max(10,Math.min(S-10,px+(rr()-.5)*220)); else py=Math.max(10,Math.min(S-10,py+(rr()-.5)*220)); g.lineTo(px,py); }
      g.stroke(); g.shadowBlur=0;
      g.fillStyle=neon[i%2]; g.fillRect(px-5,py-5,10,10);
      g.fillStyle="#000"; g.fillRect(px-2,py-2,4,4);
    }
    // paneles neón
    for(let i=0;i<2;i++){
      const w=120+rr()*160,h=60+rr()*90,px=rr()*(S-w),py=rr()*(S-h);
      g.strokeStyle=neon[i%2]; g.lineWidth=3; g.shadowColor=neon[i%2]; g.shadowBlur=16;
      g.strokeRect(px,py,w,h); g.shadowBlur=0;
      g.fillStyle="rgba(0,0,0,.55)"; g.fillRect(px,py,w,h);
      g.fillStyle=neon[i%2]; g.font="bold 20px Consolas,monospace";
      g.fillText((hash3(x,y,z)+face*77+i*1313).toString(16).toUpperCase().slice(0,6), px+10, py+30);
      g.fillStyle="rgba(255,255,255,.8)"; g.font="12px Consolas,monospace";
      g.fillText("SECTOR "+x+","+y+","+z+" / W"+face, px+10, py+50);
    }
    // scanlines
    g.fillStyle="rgba(0,0,0,.28)";
    for(let y=0;y<S;y+=4) g.fillRect(0,y,S,1);
    // viñeta
    const vg=g.createRadialGradient(S/2,S/2,S*.3,S/2,S/2,S*.75);
    vg.addColorStop(0,"rgba(0,0,0,0)"); vg.addColorStop(1,"rgba(0,0,0,.6)");
    g.fillStyle=vg; g.fillRect(0,0,S,S);
  }
  // marco común opaco para dar relieve (no unicolor)
  g.strokeStyle="rgba(0,0,0,.9)"; g.lineWidth=18; g.strokeRect(0,0,S,S);
  // hueco real de la puerta: al abrir se ve a través (círculo en X, cuadrado en Y/Z)
  g.save(); g.globalCompositeOperation="destination-out";
  if(face===0||face===1){ g.beginPath(); g.arc(S/2,S/2,S*(0.78/9),0,7); g.fill(); }
  else { const hh=S*(0.8/9); g.fillRect(S/2-hh,S/2-hh,hh*2,hh*2); }
  g.restore();
  const tex=new THREE.CanvasTexture(cnv);
  tex.encoding=THREE.sRGBEncoding;
  return tex;
}

// --- log / toast ---
function log(m){const el=document.getElementById("log");const d=document.createElement("div");d.textContent="› "+m;el.prepend(d);}
function toast(m,ms=2200){const t=document.getElementById("toast");t.textContent=m;t.style.display="block";clearTimeout(t._h);t._h=setTimeout(()=>t.style.display="none",ms);}

// --- THREE escena: interior de un cubo ---
let scene,camera,renderer,roomBox,roomEdges,doorMeshes={},centerLight,detailGroup,compassGroup=null,needleGroup=null,yaw=0,pitch=0,dragging=false,lx=0,ly=0;
let wallMats=[];
function clearDetails(){
  if(!detailGroup) return;
  for(let i=detailGroup.children.length-1;i>=0;i--){
    const o=detailGroup.children[i];
    detailGroup.remove(o);
    if(o.geometry) o.geometry.dispose();
    if(o.material) (Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{if(m.map)m.map.dispose(); m.dispose();});
  }
}
function buildDetails(family,variant){
  clearDetails();
  if(family==="steampunk"){
    const copper=new THREE.MeshStandardMaterial({color:0x8a6130,metalness:.9,roughness:.35});
    const dark=new THREE.MeshStandardMaterial({color:0x2a1a0c,metalness:.7,roughness:.5});
    [[-4.05,-4.05],[4.05,-4.05],[-4.05,4.05],[4.05,4.05]].forEach(([px,pz],idx)=>{
      if((variant+idx)%3===2) return; // alguna esquina sin tubo según variante
      const pipe=new THREE.Mesh(new THREE.CylinderGeometry(.2,.2,9,12),idx%2?copper:dark);
      pipe.position.set(px,0,pz); detailGroup.add(pipe);
      const joint=new THREE.Mesh(new THREE.TorusGeometry(.3,.1,8,16),copper);
      joint.position.set(px,1.8,pz); joint.rotation.x=Math.PI/2; detailGroup.add(joint);
    });
    const gear=new THREE.Mesh(new THREE.TorusGeometry(1.05,.24,10,24),copper);
    gear.position.set(0,2.7,-4.27); detailGroup.add(gear);
    const gear2=new THREE.Mesh(new THREE.TorusGeometry(.68,.18,10,20),dark);
    gear2.position.set(-2.85,-1.8,4.27); detailGroup.add(gear2);
  } else {
    // cyberpunk sin líneas neón 3D (retiradas a petición: amarilla/fucsia)
  }
}
function applyRoomDesign(x,y,z,skipTex){
  const st=roomStyle(x,y,z);
  if(!skipTex){
    for(let f=0;f<6;f++){
      const old=wallMats[f].map;
      wallMats[f].map=makeWallTexture(x,y,z,f);
      wallMats[f].needsUpdate=true;
      if(old&&old!==whiteTexI&&old!==whiteTexS) old.dispose();
      wallMats[f].color.setHex(0xffffff);
    }
    // cubo de salida: las paredes que dan al exterior son blancas (con hueco)
    if(isExit(x,y,z)){
      const f2d={0:"E",1:"O",2:"UP",3:"DOWN",4:"N",5:"S"};
      for(const f of outerFaces(x,y,z)){
        const old=wallMats[f].map;
        wallMats[f].map=getWhiteTex(f2d[f]);
        wallMats[f].needsUpdate=true;
        if(old&&old!==whiteTexI&&old!==whiteTexS) old.dispose();
        wallMats[f].color.setHex(0xffffff);
      }
    }
  }
  roomEdges.material.color.setHex(st.family==="steampunk"?0xffb45e:0x00f0ff);
  centerLight.color.setHex(st.family==="steampunk"?0xffaa55:0x33eeff);
  buildDetails(st.family, st.variant);
  const tag=document.getElementById("style-tag");
  if(tag) tag.textContent="ESTILO: "+st.label+" — paredes 6/6 distintas";
}
// caras del BoxGeometry [+X,-X,+Y,-Y,+Z,-Z] que dan al exterior del cubo
function outerFaces(x,y,z){
  const f=[];
  if(x===0)f.push(1); if(x===SIZE-1)f.push(0);
  if(y===0)f.push(3); if(y===SIZE-1)f.push(2);
  if(z===0)f.push(5); if(z===SIZE-1)f.push(4);
  return f;
}
// blancas con hueco de puerta (círculo en X, cuadrado en Y/Z); compartidas, no destruir
let whiteTexI=null, whiteTexS=null;
function paintWhite(g,S,iris){
  g.fillStyle="#eef1f4"; g.fillRect(0,0,S,S);
  g.strokeStyle="rgba(0,0,0,.14)"; g.lineWidth=2;
  for(let i=0;i<=S;i+=16){g.beginPath();g.moveTo(i,0);g.lineTo(i,S);g.stroke();g.beginPath();g.moveTo(0,i);g.lineTo(S,i);g.stroke();}
  g.save(); g.globalCompositeOperation="destination-out";
  if(iris){ g.beginPath(); g.arc(S/2,S/2,S*(0.78/9),0,7); g.fill(); }
  else { const hh=S*(0.8/9); g.fillRect(S/2-hh,S/2-hh,hh*2,hh*2); }
  g.restore();
}
function getWhiteTex(dir){
  const iris=(dir==="E"||dir==="O");
  if(iris&&whiteTexI) return whiteTexI;
  if(!iris&&whiteTexS) return whiteTexS;
  const S=64, c=document.createElement("canvas"); c.width=c.height=S;
  paintWhite(c.getContext("2d"),S,iris);
  const t=new THREE.CanvasTexture(c);
  if(iris) whiteTexI=t; else whiteTexS=t;
  return t;
}
function isWhiteTex(t){ return t===whiteTexI||t===whiteTexS; }
function roomColor(x,y,z){
  if(isSpawn(x,y,z))return 0x0a3d24;
  const i=roomInfo(x,y,z);
  if(i.trap&&solvedRooms.has(key(x,y,z)))return 0x3d0a0a;
  if(i.trap&&visited.has(key(x,y,z)))return 0x2a0d0d;
  const palette=[0x0b1e2a,0x0e1a30,0x101a2a,0x0b2422,0x161a30];
  return palette[i.type%palette.length];
}
function initThree(){
  const cv=document.getElementById("c3d");
  scene=new THREE.Scene(); scene.background=new THREE.Color(0x020403);
  scene.fog=new THREE.Fog(0x020403,12,45);
  camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.1,100);
  camera.position.set(0,0,0);
  renderer=new THREE.WebGLRenderer({canvas:cv,antialias:true});
  renderer.setSize(innerWidth,innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  scene.add(new THREE.AmbientLight(0x88ffbb,.55));
  centerLight=new THREE.PointLight(0x33ff99,1.1,20); centerLight.position.set(0,1.5,0); centerLight.visible=centerLightEnabled; scene.add(centerLight);
  const dl=new THREE.DirectionalLight(0xffffff,.25); dl.position.set(2,4,3); scene.add(dl);
  // caja interior con 6 materiales distintos (uno por pared, opacos con textura)
  const g=new THREE.BoxGeometry(9,9,9);
  wallMats=[];
  for(let i=0;i<6;i++) wallMats.push(new THREE.MeshStandardMaterial({map:makeWallTexture(2,2,2,i),side:THREE.BackSide,metalness:.55,roughness:.5,transparent:true}));
  roomBox=new THREE.Mesh(g,wallMats);
  scene.add(roomBox);
  // segunda caja para la sala vecina (se ve a través de la puerta abierta)
  neighborMats=[];
  for(let i=0;i<6;i++) neighborMats.push(new THREE.MeshStandardMaterial({side:THREE.BackSide,metalness:.55,roughness:.5,transparent:true}));
  neighborBox=new THREE.Mesh(new THREE.BoxGeometry(ROOM,ROOM,ROOM),neighborMats);
  neighborBox.visible=false;
  scene.add(neighborBox);
  roomEdges=new THREE.LineSegments(new THREE.EdgesGeometry(g),new THREE.LineBasicMaterial({color:0x1de07a}));
  scene.add(roomEdges);
  detailGroup=new THREE.Group(); scene.add(detailGroup);
  // compás recogible (una sala al azar, sin marca en el minimapa)
  compassGroup=new THREE.Group();
  {
    const gold=new THREE.MeshStandardMaterial({color:0xd8a920,metalness:.95,roughness:.3});
    const ringC=new THREE.Mesh(new THREE.TorusGeometry(.5,.08,12,40),gold);
    ringC.rotation.x=-Math.PI/2;
    compassGroup.add(ringC);
    const dial=new THREE.Mesh(new THREE.CircleGeometry(.48,32),
      new THREE.MeshStandardMaterial({color:0x0b0e12,metalness:.4,roughness:.6}));
    dial.rotation.x=-Math.PI/2; dial.position.y=-.01;
    compassGroup.add(dial);
    needleGroup=new THREE.Group(); needleGroup.position.y=.06;
    const north=new THREE.Mesh(new THREE.BoxGeometry(.45,.04,.09),
      new THREE.MeshStandardMaterial({color:0xc22a2a,emissive:0x7a1010,emissiveIntensity:.9}));
    north.position.x=.225; needleGroup.add(north);
    const south=new THREE.Mesh(new THREE.BoxGeometry(.45,.04,.09),
      new THREE.MeshStandardMaterial({color:0xdfe5ea,emissive:0x555555,emissiveIntensity:.4}));
    south.position.x=-.225; needleGroup.add(south);
    const pin=new THREE.Mesh(new THREE.SphereGeometry(.07,12,10),gold);
    needleGroup.add(pin);
    compassGroup.add(needleGroup);
    compassGroup.traverse(o=>{ o.userData.compass=true; });
    compassGroup.position.set(1.6,-2.6,-0.5);
    compassGroup.visible=false;
    scene.add(compassGroup);
  }
  // rejilla suelo/techo
  const grid=new THREE.GridHelper(9,9,0x1de07a,0x0e5a35); grid.position.y=-4.49; scene.add(grid);
  const grid2=grid.clone(); grid2.position.y=4.49; scene.add(grid2);
  // 6 puertas de la sala actual + segundo set reutilizable para la vecina
  doorMeshes=makeDoorSet(scene);
  neighborDoorGroup=new THREE.Group(); neighborDoorGroup.visible=false; scene.add(neighborDoorGroup);
  neighborDoors=makeDoorSet(neighborDoorGroup);
  // destello del compás en la vecina (informativo, no recogible)
  neighborGlint=new THREE.Mesh(new THREE.OctahedronGeometry(.32),
    new THREE.MeshStandardMaterial({color:0xd8a920,emissive:0x8a6a00,emissiveIntensity:1.2,metalness:.9,roughness:.3}));
  neighborGlint.visible=false; scene.add(neighborGlint);
  // eventos mirada
  cv.addEventListener("pointerdown",e=>{dragging=true;lx=e.clientX;ly=e.clientY;cv.style.cursor="grabbing";
    cv._dx=e.clientX; cv._dy=e.clientY;});
  addEventListener("pointerup",()=>{dragging=false;document.getElementById("c3d").style.cursor="grab";});
  addEventListener("pointermove",e=>{if(!dragging)return; yaw-=(e.clientX-lx)*.005; pitch-=(e.clientY-ly)*.005;
    pitch=Math.max(-1.2,Math.min(1.2,pitch)); lx=e.clientX;ly=e.clientY;});
  // click: puertas visibles o pared blanca de salida (cara exterior del cubo de salida)
  const FACE2DIR=["E","O","UP","DOWN","N","S"]; // materialIndex del BoxGeometry
  const ray=new THREE.Raycaster(), mv=new THREE.Vector2();
  cv.addEventListener("click",e=>{
    if(cv._dx!==undefined&&Math.hypot(e.clientX-cv._dx,e.clientY-cv._dy)>7) return; // era arrastre, no click
    mv.x=(e.clientX/innerWidth)*2-1; mv.y=-(e.clientY/innerHeight)*2+1;
    ray.setFromCamera(mv,camera);
    const targets=[];
    for(const k in doorMeshes){const o=doorMeshes[k];
      if(o&&o.group&&o.group.visible){ targets.push(...o.group.children); }}
    targets.push(roomBox);
    if(compassGroup&&compassGroup.visible){
      targets.push(...compassGroup.children);
      if(needleGroup) targets.push(...needleGroup.children);
    }
    const hits=ray.intersectObjects(targets);
    if(!hits.length) return;
    const h=hits[0];
    if(h.object.userData.compass){ collectCompass(); return; }
    if(h.object===roomBox){
      const dir=FACE2DIR[h.face?h.face.materialIndex:-1];
      if(!dir) return;
      const [x,y,z]=pos,[dx,dy,dz]=DIRS[dir].d;
      if(isOutside(x+dx,y+dy,z+dz)&&isExit(x,y,z)) tryDoor(dir); // pared blanca
      return;
    }
    if(h.object.userData.dir) tryDoor(h.object.userData.dir);
  });
  addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
  addEventListener("keydown",e=>{
    if(e.key==="ArrowLeft")yaw+=.15; if(e.key==="ArrowRight")yaw-=.15;
    if(e.key==="ArrowUp")pitch=Math.min(1.2,pitch+.1); if(e.key==="ArrowDown")pitch=Math.max(-1.2,pitch-.1);
    const k=e.key.toLowerCase();
    const map={e:"E",o:"O",n:"N",s:"S",u:"UP",j:"DOWN"};
    if(playing&&map[k]&&document.getElementById("modal-wrap").style.display!=="flex")tryDoor(map[k]);
    if(e.key==="Escape")closeModal();
  });
  (function loop(t){
    requestAnimationFrame(loop);
    camera.rotation.order="YXZ"; camera.rotation.y=yaw; camera.rotation.x=pitch;
    if(centerLight.visible) centerLight.intensity=1+Math.sin(Date.now()/500)*.12;
    if(compassGroup&&compassGroup.visible){
      compassGroup.position.y=-2.6+Math.sin(Date.now()/600)*.18;
      compassGroup.rotation.y=Math.sin(Date.now()/900)*.12;
    }
    if(neighborGlint&&neighborGlint.visible) neighborGlint.rotation.y+=.02;
    renderer.render(scene,camera);
    try{ tickMinimap(); }catch(e){}
  })();
}
const DOOR_DEFS=[
  ["E", 4.5-0.02,0,0, 0,-Math.PI/2],
  ["O",-4.5+0.02,0,0, 0, Math.PI/2],
  ["N", 0,0,4.5-0.02, 0, Math.PI],
  ["S", 0,0,-4.5+0.02,0,0],
  ["UP",0,4.5-0.02,0, Math.PI/2,0],
  ["DOWN",0,-4.5+0.02,0, -Math.PI/2,0]
];
function makeDoorSet(parent){
  const reg={};
  for(const [dir,x,y,z,rx,ry] of DOOR_DEFS){
    const grp=new THREE.Group();
    let entry;
    if(dir==="E"||dir==="O") entry=buildIris(dir,grp);
    else if(dir==="UP"||dir==="DOWN") entry=buildSlide(dir,grp);
    else entry=buildSplit(dir,grp);
    // etiqueta común arriba (no tapa la apertura)
    const cnv=document.createElement("canvas"); cnv.width=128;cnv.height=128;
    const tex=new THREE.CanvasTexture(cnv); tex.userData={canvas:cnv};
    const label=new THREE.Mesh(new THREE.PlaneGeometry(.62,.62),
      new THREE.MeshBasicMaterial({map:tex,transparent:true}));
    label.position.set(0,1.62,.1); label.userData.dir=dir;
    grp.add(label);
    entry.label=label; entry.tex=tex; entry.group=grp; entry.open=0;
    grp.position.set(x,y,z); grp.rotation.set(rx||0,ry||0,0);
    grp.traverse(o=>{ o.userData.dir=dir; });
    parent.add(grp);
    reg[dir]=entry;
  }
  return reg;
}
// jambas de nicho: portal hundido común a todos los tipos (local +z = hacia la sala)
function buildJambs(grp){
  const m=new THREE.MeshStandardMaterial({color:0x6b4a22,metalness:.8,roughness:.4});
  const jambs=[];
  const vGeo=new THREE.BoxGeometry(.35,2.7,.9), hGeo=new THREE.BoxGeometry(2.7,.35,.9);
  [[-1.175,0,vGeo],[1.175,0,vGeo],[0,-1.175,hGeo],[0,1.175,hGeo]].forEach(([a,b,geo])=>{
    const j=new THREE.Mesh(geo,m); j.position.set(a,b,.45); grp.add(j); jambs.push(j);
  });
  return {jambs, jambMat:m};
}
// EJE X: diafragma fotográfico de 6 palas (sin fondo: se ve a través al abrir)
function buildIris(dir,grp){
  const ring=new THREE.Mesh(new THREE.TorusGeometry(.92,.09,14,48),
    new THREE.MeshStandardMaterial({color:0x9aa2ad,metalness:.95,roughness:.28}));
  ring.position.z=.04;
  const ringIn=new THREE.Mesh(new THREE.TorusGeometry(.78,.03,10,48),
    new THREE.MeshStandardMaterial({color:0x1de07a,emissive:0x0a4a2a,emissiveIntensity:.8,metalness:.6,roughness:.4}));
  ringIn.position.z=.045;
  const aperture=new THREE.Mesh(new THREE.CircleGeometry(.78,40),
    new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:1}));
  aperture.position.z=.02; aperture.scale.set(.14,.14,1);
  const bladeGeo=new THREE.PlaneGeometry(1.15,.62);
  bladeGeo.translate(.45,0,0);
  const blades=[];
  const PIVOT_R=.68, LEAD=.55;
  for(let i=0;i<6;i++){
    const a=(i/6)*Math.PI*2;
    const shade=i%2?0x2b3138:0x3a424c;
    const b=new THREE.Mesh(bladeGeo.clone(),
      new THREE.MeshStandardMaterial({color:shade,metalness:.9,roughness:.32,side:THREE.DoubleSide}));
    b.position.set(Math.cos(a)*PIVOT_R,Math.sin(a)*PIVOT_R,.035);
    b.userData.base=a;
    b.rotation.z=a+Math.PI+LEAD;
    grp.add(b); blades.push(b);
  }
  const mask=new THREE.Mesh(new THREE.RingGeometry(.84,1.3,48),
    new THREE.MeshStandardMaterial({color:0x0b0d10,metalness:.7,roughness:.5,side:THREE.DoubleSide}));
  mask.position.z=.045;
  grp.add(mask);
  grp.add(ring); grp.add(ringIn);
  const {jambs,jambMat}=buildJambs(grp);
  const backing=new THREE.Mesh(new THREE.PlaneGeometry(2.2,2.2),
    new THREE.MeshBasicMaterial({color:0xffffff}));
  backing.position.z=-.4; backing.visible=false; grp.add(backing);
  return {kind:"iris",ring,ringIn,aperture,blades,mask,jambs,jambMat,backing};
}
// EJE Y (suelo/techo): una hoja deslizante lateral sobre raíles (sin fondo)
function buildSlide(dir,grp){
  const trimMat=new THREE.MeshStandardMaterial({color:0x6a7683,metalness:.95,roughness:.3});
  const trimT=new THREE.Mesh(new THREE.BoxGeometry(2.3,.3,.06),trimMat);
  trimT.position.set(0,1.0,.03);
  const trimB=trimT.clone(); trimB.position.y=-1.0;
  const trimL=new THREE.Mesh(new THREE.BoxGeometry(.3,1.7,.06),trimMat);
  trimL.position.set(-1.0,0,.03);
  const trimR=trimL.clone(); trimR.position.x=1.0;
  const railMat=new THREE.MeshStandardMaterial({color:0x4a545f,metalness:.95,roughness:.3});
  const railT=new THREE.Mesh(new THREE.BoxGeometry(2.15,.1,.07),railMat);
  railT.position.set(0,.95,.09);
  const railB=railT.clone(); railB.position.y=-.95;
  const slab=new THREE.Mesh(new THREE.BoxGeometry(1.7,1.7,.09),
    new THREE.MeshStandardMaterial({color:0x39404a,metalness:.9,roughness:.32}));
  slab.position.z=.07;
  const stripe=new THREE.Mesh(new THREE.BoxGeometry(.1,1.5,.02),
    new THREE.MeshStandardMaterial({color:0x1de07a,emissive:0x0a8a4a,emissiveIntensity:1}));
  stripe.position.set(-.55,0,.06); slab.add(stripe);
  grp.add(trimT); grp.add(trimB); grp.add(trimL); grp.add(trimR);
  grp.add(railT); grp.add(railB); grp.add(slab);
  const {jambs,jambMat}=buildJambs(grp);
  const backing=new THREE.Mesh(new THREE.PlaneGeometry(2.2,2.2),
    new THREE.MeshBasicMaterial({color:0xffffff}));
  backing.position.z=-.4; backing.visible=false; grp.add(backing);
  return {kind:"slide",slab,stripe,jambs,jambMat,backing};
}
// EJE Z: doble hoja que se parte por el centro, con marco (sin fondo)
function buildSplit(dir,grp){
  const jambMat0=new THREE.MeshStandardMaterial({color:0x6a7683,metalness:.95,roughness:.3});
  const trimT=new THREE.Mesh(new THREE.BoxGeometry(2.3,.3,.06),jambMat0);
  trimT.position.set(0,1.0,.03);
  const trimB=trimT.clone(); trimB.position.y=-1.0;
  const trimL=new THREE.Mesh(new THREE.BoxGeometry(.3,1.7,.06),jambMat0);
  trimL.position.set(-1.0,0,.03);
  const trimR=trimL.clone(); trimR.position.x=1.0;
  const leafMat=new THREE.MeshStandardMaterial({color:0x333b45,metalness:.9,roughness:.32});
  const left=new THREE.Mesh(new THREE.BoxGeometry(.85,1.7,.09),leafMat);
  left.position.set(-.425,0,.07);
  const right=new THREE.Mesh(new THREE.BoxGeometry(.85,1.7,.09),leafMat.clone());
  right.position.set(.425,0,.07);
  const seam=new THREE.Mesh(new THREE.BoxGeometry(.05,1.6,.02),
    new THREE.MeshBasicMaterial({color:0x1de07a,transparent:true,opacity:.9}));
  seam.position.set(0,0,.12);
  grp.add(trimT); grp.add(trimB); grp.add(trimL); grp.add(trimR);
  grp.add(left); grp.add(right); grp.add(seam);
  const {jambs,jambMat}=buildJambs(grp);
  const backing=new THREE.Mesh(new THREE.PlaneGeometry(2.2,2.2),
    new THREE.MeshBasicMaterial({color:0xffffff}));
  backing.position.z=-.4; backing.visible=false; grp.add(backing);
  return {kind:"split",left,right,seam,jambs,jambMat,backing};
}
// 0 = cerrado, 1 = abierto (según el tipo de puerta; al abrir se ve a través)
function setDoorOpen(dir,t,reg){
  const o=(reg||doorMeshes)[dir]; if(!o) return;
  t=Math.max(0,Math.min(1,t)); o.open=t;
  if(o.kind==="iris"||!o.kind){
    const SWING=(Math.PI/2+.55);
    for(const b of o.blades) b.rotation.z=b.userData.base+Math.PI+.55 - t*SWING;
    const s=.14+.86*t;
    o.aperture.scale.set(s,s,1);
    o.aperture.material.opacity=1-t;
    o.ringIn.material.emissiveIntensity=.6+1.6*t;
  }else if(o.kind==="slide"){
    o.slab.position.x=t*1.8;
    o.stripe.material.emissiveIntensity=1-.6*t;
  }else if(o.kind==="split"){
    o.left.position.x=-.425-t*.92;
    o.right.position.x=.425+t*.92;
    o.seam.material.opacity=.9*(1-t);
  }
}
function tween(ms,fn){
  return new Promise(res=>{const t0=performance.now();
    (function step(){const k=Math.min(1,(performance.now()-t0)/ms);
      fn(k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2);
      if(k<1)requestAnimationFrame(step); else res();})();});
}
function faceFor(dir){
  if(dir==="E")return{yaw:-Math.PI/2,pitch:0};
  if(dir==="O")return{yaw:Math.PI/2,pitch:0};
  if(dir==="N")return{yaw:Math.PI,pitch:0};
  if(dir==="S")return{yaw:0,pitch:0};
  if(dir==="UP")return{yaw:null,pitch:1.15};
  return{yaw:null,pitch:-1.15};
}
let traversing=false;
let neighborBox=null, neighborMats=[], tunnelGroup=null;
let neighborDoorGroup=null, neighborDoors=null, neighborGlint=null;
const GAP=2.5, ROOM=9; // grosor visual entre salas y lado de cada cubo
// pasadizo entre salas: tubo de 4 planos + tiras emisivas, del muro hacia fuera
function buildTunnel(dir){
  removeTunnel();
  const g=new THREE.Group();
  const W=2.0;
  const wallMat=new THREE.MeshStandardMaterial({color:0x14181d,metalness:.7,roughness:.5,side:THREE.DoubleSide});
  const side=new THREE.PlaneGeometry(GAP,W);
  const mkP=(px,py,rx,ry)=>{const m=new THREE.Mesh(side,wallMat);m.position.set(px,py,0);m.rotation.set(rx,ry,0);g.add(m);};
  mkP(W/2,0,0,Math.PI/2); mkP(-W/2,0,0,Math.PI/2); mkP(0,W/2,Math.PI/2,0); mkP(0,-W/2,Math.PI/2,0);
  const stripGeo=new THREE.BoxGeometry(.09,.09,GAP);
  const stripMat=new THREE.MeshBasicMaterial({color:0x1de07a});
  [[1,1],[1,-1],[-1,1],[-1,-1]].forEach(([sx,sy])=>{
    const s=new THREE.Mesh(stripGeo,stripMat); s.position.set(sx*W/2,sy*W/2,0); g.add(s);
  });
  const dv=DIRS[dir].d;
  if(dir==="E")g.rotation.y=Math.PI/2; else if(dir==="O")g.rotation.y=-Math.PI/2;
  else if(dir==="S")g.rotation.y=Math.PI;
  else if(dir==="UP")g.rotation.x=-Math.PI/2; else if(dir==="DOWN")g.rotation.x=Math.PI/2;
  g.position.set(dv[0]*(ROOM/2+GAP/2),dv[1]*(ROOM/2+GAP/2),dv[2]*(ROOM/2+GAP/2));
  scene.add(g); tunnelGroup=g;
}
function removeTunnel(){
  if(!tunnelGroup) return;
  scene.remove(tunnelGroup);
  const geos=new Set(), mats=new Set();
  tunnelGroup.traverse(o=>{ if(o.geometry)geos.add(o.geometry); if(o.material)mats.add(o.material); });
  geos.forEach(x=>x.dispose()); mats.forEach(x=>x.dispose());
  tunnelGroup=null;
}
// sala vecina real, visible a través de la puerta abierta
function buildNeighbor(nx,ny,nz,dir){
  for(let f=0;f<6;f++){
    const old=neighborMats[f].map;
    neighborMats[f].map=makeWallTexture(nx,ny,nz,f);
    neighborMats[f].needsUpdate=true;
    if(old&&!isWhiteTex(old)) old.dispose();
    neighborMats[f].color.setHex(0xffffff);
  }
  if(isExit(nx,ny,nz)){
    const f2d={0:"E",1:"O",2:"UP",3:"DOWN",4:"N",5:"S"};
    for(const f of outerFaces(nx,ny,nz)){
      const old=neighborMats[f].map;
      neighborMats[f].map=getWhiteTex(f2d[f]);
      neighborMats[f].needsUpdate=true;
      if(old&&!isWhiteTex(old)) old.dispose();
    }
  }
  const dv=DIRS[dir].d, off=ROOM+GAP;
  neighborBox.position.set(dv[0]*off,dv[1]*off,dv[2]*off);
  neighborBox.visible=true;
  // set de puertas de la vecina + puerta de entrada abierta + destello del compás
  neighborDoorGroup.position.copy(neighborBox.position);
  neighborDoorGroup.visible=true;
  const jambColN=roomStyle(nx,ny,nz).family==="steampunk"?0x6b4a22:0x11161d;
  for(const d in DIRS) styleDoorEntry(neighborDoors,d,nx,ny,nz,jambColN);
  const back={E:"O",O:"E",N:"S",S:"N",UP:"DOWN",DOWN:"UP"}[dir];
  setDoorOpen(back,1,neighborDoors);
  const glintHere=!compassCollected&&compassPos&&compassPos[0]===nx&&compassPos[1]===ny&&compassPos[2]===nz;
  if(neighborGlint){
    neighborGlint.visible=!!glintHere;
    if(glintHere) neighborGlint.position.set(neighborBox.position.x+1.6,neighborBox.position.y-2.6,neighborBox.position.z-0.5);
  }
}
async function traverse(dir){
  if(traversing||!playing) return;
  const [cx,cy,cz]=pos, [ddx,ddy,ddz]=DIRS[dir].d;
  if(isOutside(cx+ddx,cy+ddy,cz+ddz)){ escapeSequence(dir); return; } // seguridad
  traversing=true;
  try{
    // 1) mirar hacia la puerta
    const f=faceFor(dir), y0=yaw, p0=pitch;
    let dy=0;
    if(f.yaw!==null&&f.yaw!==undefined){ dy=f.yaw-y0; while(dy>Math.PI)dy-=Math.PI*2; while(dy<-Math.PI)dy+=Math.PI*2; }
    await tween(260,k=>{ if(f.yaw!==null&&f.yaw!==undefined)yaw=y0+dy*k; if(f.pitch!==null&&f.pitch!==undefined)pitch=p0+(f.pitch-p0)*k; });
    // 2) construir pasadizo + vecina y abrir la puerta: ya se ve a través
    buildTunnel(dir);
    buildNeighbor(cx+ddx,cy+ddy,cz+ddz,dir);
    await tween(480,k=>setDoorOpen(dir,k));
    await new Promise(r=>setTimeout(r,220));
    // 3) volar por el pasadizo hasta el centro de la vecina (sin fundido)
    const dv=DIRS[dir].d, N={x:dv[0]*(ROOM+GAP),y:dv[1]*(ROOM+GAP),z:dv[2]*(ROOM+GAP)};
    await tween(1150,k=>{ camera.position.set(N.x*k,N.y*k,N.z*k); });
    // 4) world-shift: la vecina pasa a ser la sala actual en el origen
    roomBox.position.set(-N.x,-N.y,-N.z);
    neighborBox.position.set(0,0,0);
    camera.position.set(0,0,0);
    let _b=roomBox; roomBox=neighborBox; neighborBox=_b;
    let _w=wallMats; wallMats=neighborMats; neighborMats=_w;
    neighborBox.visible=false;
    neighborDoorGroup.visible=false;
    if(neighborGlint)neighborGlint.visible=false;
    removeTunnel();
    move(dir);
  }finally{ traversing=false; }
}
function drawDoorLabel(dir,txt,sub,reg){
  const o=(reg||doorMeshes)[dir]; if(!o)return;
  const c=o.tex.userData.canvas, g=c.getContext("2d");
  g.clearRect(0,0,128,128);
  g.fillStyle="rgba(0,0,0,.85)"; g.beginPath(); g.arc(64,64,58,0,7); g.fill();
  g.strokeStyle="#1de07a"; g.lineWidth=4; g.stroke();
  g.fillStyle="#fff"; g.font="bold 44px Consolas,monospace"; g.textAlign="center"; g.textBaseline="middle";
  g.fillText(txt,64,56);
  g.fillStyle="#1de07a"; g.font="16px Consolas,monospace"; g.fillText(sub||"",64,96);
  o.tex.needsUpdate=true;
}
function refresh3D(){
  const [x,y,z]=pos;
  applyRoomDesign(x,y,z,false);
  refreshDoors();
  updateCompass();
}
// estiliza una puerta de un set para la sala (x,y,z)
function styleDoorEntry(reg,dir,x,y,z,jambCol){
  const o=reg[dir]; if(!o||!o.group)return;
  const [dx,dy,dz]=DIRS[dir].d;
  const nx=x+dx,ny=y+dy,nz=z+dz;
  const isWall=nx<0||nx>=SIZE||ny<0||ny>=SIZE||nz<0||nz>=SIZE;
  // ninguna puerta al exterior se muestra: en la salida se escapa pulsando la pared blanca
  const isEscape=isWall&&isExit(x,y,z);
  o.group.visible=!isWall;
  if(isWall){ if(isEscape) paintDoorWhite(dir,reg); return; }
  let txt,sub=DIRS[dir].wall;
  txt=(o.kind==="slide"?"═":o.kind==="split"?"║":"◉");
  o.jambMat.color.setHex(jambCol);
  o.backing.visible=false;
  if(o.kind==="iris"||!o.kind){
    o.ringIn.material.emissive.set(0x0a8a4a);
    o.ringIn.material.color.set(0x9fe8c0);
    o.ring.material.color.set(0x9aa2ad);
  }else{
    if(o.stripe) o.stripe.material.emissive.set(0x0a8a4a);
    if(o.seam) o.seam.material.color.set(0x1de07a);
  }
  setDoorOpen(dir,0,reg);
  drawDoorLabel(dir,txt,sub,reg);
}
// puertas visibles, tinte de nichos y puerta blanca oculta de escape
function refreshDoors(){
  const [x,y,z]=pos;
  const jambCol=roomStyle(x,y,z).family==="steampunk"?0x6b4a22:0x11161d;
  for(const dir in DIRS) styleDoorEntry(doorMeshes,dir,x,y,z,jambCol);
}
// pinta de blanco la puerta oculta de escape (solo se revela durante la animación)
function paintDoorWhite(dir,reg){
  const o=(reg||doorMeshes)[dir]; if(!o) return;
  o.jambMat.color.setHex(0xdfe3e8);
  if(o.kind==="iris"||!o.kind){
    o.ringIn.material.emissive.set(0xffffff);
    o.ringIn.material.color.set(0xffffff);
    o.ring.material.color.set(0xf2f4f6);
  }else{
    if(o.stripe) o.stripe.material.emissive.set(0xffffff);
    if(o.seam) o.seam.material.color.set(0xffffff);
  }
  o.backing.visible=true;
  setDoorOpen(dir,0,reg);
  drawDoorLabel(dir,(o.kind==="slide"?"═":o.kind==="split"?"║":"◉"),DIRS[dir].wall,reg);
}
// compás: visible solo si esta sala lo contiene y aún no se recogió (sin marca en minimapa)
function updateCompass(){
  if(!compassGroup) return;
  const here=!compassCollected&&compassPos&&pos[0]===compassPos[0]&&pos[1]===compassPos[1]&&pos[2]===compassPos[2];
  compassGroup.visible=!!here;
  if(here&&needleGroup){
    const dx=EXIT[0]-pos[0], dz=EXIT[2]-pos[2];
    if(dx!==0||dz!==0) needleGroup.rotation.y=Math.atan2(-dz,dx);
  }
}

// --- HUD / minimapa ---
function fmtTime(s){s=Math.floor(s);return Math.floor(s/60)+":"+String(s%60).padStart(2,"0");}
function compass(){
  const dx=EXIT[0]-pos[0],dy=EXIT[1]-pos[1],dz=EXIT[2]-pos[2];
  let h="";
  h+=dx>0?"→E ":""; h+=dx<0?"←O ":""; h+=dz>0?"↑N ":""; h+=dz<0?"↓S ":"";
  h+=dy>0?"▲":""; h+=dy<0?"▼":"";
  return h.trim()||"★ ¡AQUÍ!";
}
function refreshHUD(){
  const [x,y,z]=pos, info=roomInfo(x,y,z);
  const st=roomStyle(x,y,z);
  document.getElementById("h-pos").textContent=`[${x},${y},${z}]`;
  document.getElementById("coords").textContent=`[ ${x} , ${y} , ${z} ]`;
  document.getElementById("h-sector").textContent=sector(pos);
  document.getElementById("h-dist").textContent=manhattan(pos,EXIT);
  document.getElementById("h-lives").textContent="♥".repeat(lives)||"✕";
  document.getElementById("h-moves").textContent=moves;
  document.getElementById("h-time").textContent=fmtTime(elapsed);
  document.getElementById("h-compass").textContent=compassCollected?compass():"–";
  document.getElementById("pill-compass").style.display=compassCollected?"":"none";
  const showBtn=playing&&!compassCollected&&compassPos
    &&pos[0]===compassPos[0]&&pos[1]===compassPos[1]&&pos[2]===compassPos[2];
  document.getElementById("btn-compass").style.display=showBtn?"":"none";
  let d=`Sala #${hash3(x,y,z).toString(16).toUpperCase()} · ${st.label} — `;
  if(isExit(x,y,z))d+="Sala límite: una pared blanca da al exterior. Pulsa sobre ella para escapar.";
  else if(isSpawn(x,y,z))d+="Núcleo central del cubo.";
  else d+="Sala del cubo. Elige una puerta y supera su reto matemático.";
  document.getElementById("room-desc").textContent=d;
  if(showBtn) document.getElementById("room-desc").textContent+=" 🧭 ¡Un compás brilla en el suelo!";
  document.getElementById("room-status").textContent=doorChallengesEnabled
    ?"▣ Puertas listas — cada una pide un cálculo para cruzar."
    :"▣ Modo libre — las puertas se abren sin cálculo.";
  document.querySelectorAll(".door-btn[data-dir]").forEach(b=>{
    const dir=b.dataset.dir,[dx,dy,dz]=DIRS[dir].d;
    const nx=x+dx,ny=y+dy,nz=z+dz;
    const isWall=nx<0||nx>=SIZE||ny<0||ny>=SIZE||nz<0||nz>=SIZE;
    // ninguna puerta exterior aparece en el panel (la salida es la pared blanca 3D)
    b.style.display=isWall?"none":"";
    b.disabled=isWall;
    if(!isWall) b.textContent=DIRS[dir].label+" ("+DIRS[dir].wall+")";
  });
  drawMinimap3D();
}
// --- MINIMAPA 3D: cubos lado a lado + camino recorrido ---
let miniR, miniS, miniC, miniGroup, miniPath=null, miniYaw=0.7, miniPitch=0.6, miniDist=13, miniAuto=true, miniDrag=false, miniLX=0, miniLY=0;
let miniBoxGeo=null, miniMats=null;
function miniPos(x,y,z){ return [(x-C)*1.15,(y-C)*1.15,(z-C)*1.15]; }
function initMinimap(){
  const cv=document.getElementById("minimap");
  miniR=new THREE.WebGLRenderer({canvas:cv,antialias:true,alpha:true});
  miniR.setSize(270,220,false); miniR.setPixelRatio(Math.min(devicePixelRatio,2));
  miniS=new THREE.Scene(); miniS.background=new THREE.Color(0x020604);
  miniS.fog=new THREE.Fog(0x020604,60,120);
  miniC=new THREE.PerspectiveCamera(42,270/220,.1,500);
  miniS.add(new THREE.AmbientLight(0xffffff,.75));
  const dl=new THREE.DirectionalLight(0xffffff,.7); dl.position.set(10,18,8); miniS.add(dl);
  miniGroup=new THREE.Group(); miniS.add(miniGroup);
  // contenedor fantasma del cubo para referencia de escala
  const bound=new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(SIZE*1.15,SIZE*1.15,SIZE*1.15)),
    new THREE.LineBasicMaterial({color:0x1de07a,transparent:true,opacity:.25}));
  miniS.add(bound);
  miniBoxGeo=new THREE.BoxGeometry(.95,.95,.95);
  miniMats={
    visited:new THREE.MeshStandardMaterial({color:0x0e6e42,metalness:.3,roughness:.5}),
    trap:new THREE.MeshStandardMaterial({color:0x8a1e1e,metalness:.3,roughness:.5}),
    spawn:new THREE.MeshStandardMaterial({color:0x2b9dff,emissive:0x0a2a55,metalness:.4,roughness:.4}),
    exit:new THREE.MeshStandardMaterial({color:0xffd76a,emissive:0x6a4d00,metalness:.5,roughness:.35}),
    compass:new THREE.MeshStandardMaterial({color:0xffffff,emissive:0xbbbbbb,emissiveIntensity:.9,metalness:.3,roughness:.3}),
    player:new THREE.MeshStandardMaterial({color:0x1de07a,emissive:0x0a5a30,metalness:.3,roughness:.3})
  };
  cv.style.cursor="move";
  cv.addEventListener("pointerdown",e=>{miniDrag=true;miniLX=e.clientX;miniLY=e.clientY;miniAuto=false;
    const b=document.getElementById("btn-rot"); if(b)b.textContent="▶ ROTACIÓN"; cv.setPointerCapture(e.pointerId);});
  cv.addEventListener("pointermove",e=>{ if(!miniDrag)return;
    miniYaw-=(e.clientX-miniLX)*.01; miniPitch=Math.max(.05,Math.min(1.5,miniPitch+(e.clientY-miniLY)*.008));
    miniLX=e.clientX; miniLY=e.clientY;});
  cv.addEventListener("pointerup",()=>miniDrag=false);
  cv.addEventListener("wheel",e=>{e.preventDefault(); miniDist=Math.max(6,Math.min(40,miniDist+e.deltaY*.02));},{passive:false});
  document.getElementById("btn-rot").onclick=()=>{miniAuto=!miniAuto;
    document.getElementById("btn-rot").textContent=miniAuto?"⏸ ROTACIÓN":"▶ ROTACIÓN";};
  document.getElementById("btn-top").onclick=()=>{miniPitch=1.5;miniYaw=0;};
}
function drawMinimap3D(){
  if(!miniS) return;
  while(miniGroup.children.length){ const o=miniGroup.children[0]; miniGroup.remove(o);
    if(o.geometry && o.geometry!==miniBoxGeo) o.geometry.dispose(); }
  const [px,py,pz]=pos;
  visited.forEach(k=>{
    const [x,y,z]=k.split(",").map(Number);
    let m=miniMats.visited;
    if(isExit(x,y,z)) m=miniMats.exit;
    else if(isSpawn(x,y,z)) m=miniMats.spawn;
    else if(roomInfo(x,y,z).trap) m=miniMats.trap;
    const b=new THREE.Mesh(miniBoxGeo,m);
    const [mx,my,mz]=miniPos(x,y,z);
    b.position.set(mx,my,mz);
    if(x===px&&y===py&&z===pz){ b.material=miniMats.player; b.scale.set(1.35,1.35,1.35); }
    miniGroup.add(b);
    // arista sutil para separar cubos lado a lado
    const e=new THREE.LineSegments(new THREE.EdgesGeometry(miniBoxGeo),
      new THREE.LineBasicMaterial({color:0x000000,transparent:true,opacity:.5}));
    e.position.copy(b.position); e.scale.copy(b.scale); miniGroup.add(e);
  });
  // salida siempre visible como referencia aunque no visitada
  if(!visited.has(key(...EXIT))){
    const b=new THREE.Mesh(miniBoxGeo,miniMats.exit);
    const [mx,my,mz]=miniPos(...EXIT); b.position.set(mx,my,mz); b.scale.set(1.3,1.3,1.3);
    miniGroup.add(b);
  }
  // compás: solo si el jugador activa la opción y aún no se recogió
  if(showCompassOnMap&&!compassCollected&&compassPos){
    const b=new THREE.Mesh(miniBoxGeo,miniMats.compass);
    const [mx,my,mz]=miniPos(compassPos[0],compassPos[1],compassPos[2]);
    b.position.set(mx,my,mz); b.scale.set(1.15,1.15,1.15);
    miniGroup.add(b);
  }
}
function tickMinimap(){
  if(!miniR) return;
  if(miniAuto&&!miniDrag) miniYaw+=.004;
  const r=miniDist;
  miniC.position.set(
    r*Math.cos(miniPitch)*Math.cos(miniYaw),
    r*Math.sin(miniPitch),
    r*Math.cos(miniPitch)*Math.sin(miniYaw));
  miniC.lookAt(0,0,0);
  // pulso del jugador
  const s=1.35+Math.sin(Date.now()/400)*.08;
  miniGroup.children.forEach(o=>{ if(o.material===miniMats.player) o.scale.set(s,s,s); });
  miniR.render(miniS,miniC);
}

// --- modales ---
const MW=document.getElementById("modal-wrap"), M=document.getElementById("modal");
function openModal(html){M.innerHTML=html;MW.style.display="flex";}
function closeModal(){MW.style.display="none";M.innerHTML="";}
MW.addEventListener("click",e=>{if(e.target===MW)toast("Resuelve el reto para continuar");});

// --- RETO DE SALA (solo se revela al intentar abrir una puerta) ---
let pendingRoomDir=null;
function openRoomChallenge(forDir){
  const [x,y,z]=pos, k=key(x,y,z);
  if(solvedRooms.has(k)){ if(forDir) openDoorMath(forDir); return; }
  pendingRoomDir=forDir||null;
  currentRoomPuzzle=genRoomPuzzle(x,y,z);
  const p=currentRoomPuzzle, info=roomInfo(x,y,z), t=p.type;
  let body="";
  if(t===0)body=`<p>Teclado numérico del 1 al 10. Tienes <b>${p.attempts} intentos</b>. Pista mayor/menor.</p>
    <input id="in-num" type="number" min="1" max="10" placeholder="1 – 10"><div class="hint" id="room-hint"></div>
    <button id="ok">PROBAR</button>`;
  if(t===1)body=`<p>Completa la secuencia:</p><div id="seq-code">${p.seq.join(" – ")} – ?</div>
    <input id="in-num" type="number" placeholder="Siguiente número"><button id="ok">RESPONDER</button>`;
  if(t===2)body=`<p>Memoriza este código, se ocultará en <b><span id="cd">5</span>s</b>:</p>
    <div id="seq-code">${p.code}</div>
    <input id="in-num" placeholder="Escribe el código" maxlength="4" style="display:none">
    <button id="ok" style="display:none">CONFIRMAR</button>`;
  if(t===3)body=`<p>¿Cuál de estos números es <b>primo</b>?</p>
    ${p.opts.map((o,i)=>`<button data-v="${o}" class="pick">${o}</button>`).join("")}`;
  if(t===4)body=`<p>Pulsa el botón solo cuando se ponga <b style="color:#1de07a">VERDE</b>. Tienes 1.5s.</p>
    <button id="reflex" style="background:#a00;width:100%;font-size:20px">🔴 ESPERA…</button><div class="hint" id="room-hint"></div>`;
  openModal(`<h3>◈ RETO DE SALA — ${ROOM_NAMES[t]}</h3>
    <p>${ROOM_DESC[t]}${info.trap?' <b style="color:#ff7a7a">⚠ TRAMPA ACTIVA: fallar cuesta 1 vida.</b>':''}</p>${body}
    <div><button class="ghost" id="giveup">Rendirse (pierdes 1 vida)</button></div>`);
  document.getElementById("giveup").onclick=()=>{damage("Te rindes ante la sala.", pendingRoomDir);};

  if(t===0){
    let left=p.attempts;
    document.getElementById("ok").onclick=()=>{
      const v=parseInt(document.getElementById("in-num").value,10);
      if(!v||v<1||v>10){toast("Escribe 1–10");return;}
      if(v===p.target)return roomSolved();
      left--;
      document.getElementById("room-hint").textContent=
        left<=0?"":(v<p.target?"Mayor… te quedan "+left:"Menor… te quedan "+left);
      if(left<=0)return roomFailed("El número era "+p.target);
    };
  }
  if(t===1){
    document.getElementById("ok").onclick=()=>{
      const v=parseInt(document.getElementById("in-num").value,10);
      if(v===p.answer)return roomSolved();
      return roomFailed(`Era ${p.answer} (progresión +${p.seq[1]-p.seq[0]}).`);
    };
  }
  if(t===2){
    let n=5; const cd=setInterval(()=>{n--;const e=document.getElementById("cd");if(e)e.textContent=n;
      if(n<=0){clearInterval(cd);const s=document.getElementById("seq-code");if(s)s.textContent="⁇ ⁇ ⁇ ⁇";
        const i=document.getElementById("in-num"),b=document.getElementById("ok");if(i)i.style.display="block";if(b)b.style.display="inline-block";}},1000);
    document.getElementById("ok").onclick=()=>{
      if(document.getElementById("in-num").value.trim()===p.code)return roomSolved();
      return roomFailed("El código era "+p.code);
    };
  }
  if(t===3){
    M.querySelectorAll(".pick").forEach(b=>b.onclick=()=>{
      if(parseInt(b.dataset.v,10)===p.prime)return roomSolved();
      return roomFailed("El primo era "+p.prime);
    });
  }
  if(t===4){
    const btn=document.getElementById("reflex"); let state="red",t0=0,timer;
    timer=setTimeout(()=>{if(!document.body.contains(btn))return;state="green";btn.style.background="#1de07a";btn.textContent="🟢 ¡AHORA!";t0=performance.now();
      setTimeout(()=>{if(state==="green"){state="done";roomFailed("Demasiado lento (>1.5s).");}},1500);},1500+Math.random()*2000);
    btn.onclick=()=>{
      if(state==="red"){clearTimeout(timer);return roomFailed("Te adelantaste. Era esperar al verde.");}
      if(state==="green"){const dt=(performance.now()-t0)/1000;state="done";
        if(dt<=1.5){toast(`⚡ ${dt.toFixed(2)}s`);return roomSolved();} return roomFailed("Lento: "+dt.toFixed(2)+"s");}
    };
  }
}
function roomSolved(){
  solvedRooms.add(key(...pos)); roomUnlocked=true;
  const chained=pendingRoomDir; pendingRoomDir=null;
  log(`✔ Sala [${pos}] superada (${ROOM_NAMES[currentRoomPuzzle.type]})`);
  refreshAll();
  if(chained){ toast("✔ Reto de sala superado. Ahora el reto matemático de la puerta."); openDoorMath(chained); }
  else { toast("✔ Reto de sala superado."); closeModal(); }
}
function roomFailed(msg){
  const [x,y,z]=pos, info=roomInfo(x,y,z);
  const chained=pendingRoomDir;
  log(`✖ Fallo sala [${pos}]: ${msg}`);
  if(info.trap){damage(msg, chained);}
  else{toast("✖ "+msg+" Reintenta.");openRoomChallenge(chained);}
}
function damage(msg, chainedDir){
  lives--;
  log(`♥ DAÑO: ${msg} (vidas: ${lives})`);
  if(lives<=0){refreshHUD();gameOver(msg);return;}
  toast("♥ -1 vida: "+msg);
  // tras daño, se desbloquea la sala para no bloquear la demo y se sigue a la puerta
  solvedRooms.add(key(...pos)); roomUnlocked=true; pendingRoomDir=null; refreshAll();
  if(chainedDir||pendingDir){ closeModal(); if(playing) openDoorMath(chainedDir||pendingDir); }
}

// --- COMPÁS: al recogerlo se activa la brújula ---
function collectCompass(){
  if(compassCollected||!playing) return;
  compassCollected=true;
  if(compassGroup) compassGroup.visible=false;
  document.getElementById("pill-compass").style.display="";
  document.getElementById("btn-compass").style.display="none";
  log("🧭 Compás recogido: brújula activada");
  toast("🧭 ¡Compás recogido! Brújula activada.");
  refreshHUD();
}

// --- RETO DE PUERTA (matemático, desactivable) ---
function isOutside(nx,ny,nz){ return nx<0||nx>=SIZE||ny<0||ny>=SIZE||nz<0||nz>=SIZE; }
function tryDoor(dir){
  if(!playing||traversing)return;
  const [x,y,z]=pos,[dx,dy,dz]=DIRS[dir].d;
  const nx=x+dx,ny=y+dy,nz=z+dz;
  // al exterior solo se puede salir desde el cubo de salida (puerta blanca)
  if(isOutside(nx,ny,nz)&&!isExit(x,y,z)){return;}
  if(!doorChallengesEnabled){ crossDoor(dir); return; }
  openDoorMath(dir);
}
// decide entre cruzar a otra sala o escapar al exterior
function crossDoor(dir){
  const [x,y,z]=pos,[dx,dy,dz]=DIRS[dir].d;
  if(isOutside(x+dx,y+dy,z+dz)){ escapeSequence(dir); return; }
  traverse(dir);
}
// secuencia de escape por la puerta blanca: abrir, avanzar y victoria
async function escapeSequence(dir){
  if(traversing||!playing) return;
  traversing=true;
  try{
    const f=faceFor(dir), y0=yaw, p0=pitch;
    let dy=0;
    if(f.yaw!==null&&f.yaw!==undefined){ dy=f.yaw-y0; while(dy>Math.PI)dy-=Math.PI*2; while(dy<-Math.PI)dy+=Math.PI*2; }
    await tween(260,k=>{ if(f.yaw!==null&&f.yaw!==undefined)yaw=y0+dy*k; if(f.pitch!==null&&f.pitch!==undefined)pitch=p0+(f.pitch-p0)*k; });
    // la puerta blanca estaba oculta: se revela solo para la animación de escape
    { const o=doorMeshes[dir]; if(o&&o.group){ paintDoorWhite(dir); o.group.visible=true; } }
    await tween(480,k=>setDoorOpen(dir,k));
    const fadeEl=document.getElementById("fade");
    const dv=DIRS[dir].d, dist=3.82;
    if(fadeEl) fadeEl.style.background="#fff"; // escape en blanco, no en negro
    await tween(650,k=>{ camera.position.set(dv[0]*dist*k,dv[1]*dist*k,dv[2]*dist*k); if(fadeEl)fadeEl.style.opacity=k.toFixed(3); });
    camera.position.set(0,0,0);
    log(`◯ Escape por pared blanca ${DIRS[dir].label} desde [${pos}]`);
    win();
    if(fadeEl){ fadeEl.style.opacity=0; fadeEl.style.background="#000"; }
  }finally{ traversing=false; }
}
function openDoorMath(dir){
  pendingDir=dir; doorPuzzle=genDoorMath(pos);
  const names=["BÁSICA","MEDIA","ALTA","EXTREMA"];
  openModal(`<h3>▣ PUERTA ${DIRS[dir].label} <span class="hint">[${DIRS[dir].wall}] niv.${names[doorPuzzle.lvl]}</span></h3>
    <p>Para abrir la escotilla resuelve:<br><b style="font-size:22px">${doorPuzzle.q}</b></p>
    <input id="in-door" type="number" placeholder="Respuesta" autocomplete="off">
    <div><button id="ok">ABRIR PUERTA</button><button class="ghost" id="cancel">Atrás</button></div>
    <div class="hint">Cada cruce genera una operación nueva. Dificultad ↑ lejos del núcleo.</div>`);
  document.getElementById("cancel").onclick=closeModal;
  const inp=document.getElementById("in-door"); inp.focus();
  inp.addEventListener("keydown",e=>{if(e.key==="Enter")document.getElementById("ok").click();});
  document.getElementById("ok").onclick=()=>{
    const v=parseFloat(inp.value);
    if(Math.abs(v-doorPuzzle.a)<1e-9){closeModal();crossDoor(pendingDir);}
    else{const oldA=doorPuzzle.a; log(`✖ Puerta ${DIRS[dir].label}: ${doorPuzzle.q} ≠ ${inp.value||"∅"} (era ${oldA})`);
      doorPuzzle=genDoorMath(pos);
      toast(`✖ Incorrecto (era ${oldA}). Nueva operación generada.`,2600);
      openModal(`<h3>✖ Puerta bloqueada</h3><p>Fallaste. Nueva operación:</p>
        <p><b style="font-size:22px">${doorPuzzle.q}</b></p>
        <input id="in-door2" type="number" placeholder="Respuesta"><div>
        <button id="ok2">REINTENTAR</button><button class="ghost" id="cancel2">Atrás</button></div>`);
      document.getElementById("cancel2").onclick=closeModal;
      document.getElementById("ok2").onclick=()=>{
        const v2=parseFloat(document.getElementById("in-door2").value);
        if(Math.abs(v2-doorPuzzle.a)<1e-9){closeModal();crossDoor(pendingDir);}
        else{toast("✖ Sigue bloqueada. Puerta regenerada.");closeModal();}
      };
    }
  };
}
function move(dir){
  const [dx,dy,dz]=DIRS[dir].d;
  pos=[pos[0]+dx,pos[1]+dy,pos[2]+dz];
  moves++; visited.add(key(...pos)); pathOrder.push([...pos]);
  roomUnlocked=true;
  log(`→ ${DIRS[dir].label} a [${pos}]`);
  // texturas ya correctas tras el world-shift: solo aristas, luz, detalles y HUD
  applyRoomDesign(pos[0],pos[1],pos[2],true);
  refreshDoors(); updateCompass(); refreshHUD();
  // entrar al cubo de salida NO gana: hay que pulsar su pared blanca
  toast(isExit(...pos)
    ?"Sala límite: pulsa la pared blanca para escapar."
    :"Nueva sala "+roomStyle(...pos).label+". Elige puerta.");
}

// --- flujo ---
function refreshAll(){refresh3D();refreshHUD();}
function win(){
  playing=false;clearInterval(timerInt);refreshAll();
  openModal(`<h3>★ HAS ESCAPADO DEL CUBO ★</h3>
    <p>De [${pos}] al exterior en <b>${moves} pasos</b> y <b>${fmtTime(elapsed)}</b>, con <b>${lives} vidas</b>.<br>
    Laberinto 5×5×5 superado. El Cubo te deja ir… por ahora.</p>
    <button onclick="location.reload()">JUGAR OTRA VEZ</button>`);
  log("★ WIN");
}
function gameOver(msg){
  playing=false;clearInterval(timerInt);
  openModal(`<h3 style="color:#ff7a7a">✕ ATRAPADO EN EL CUBO</h3><p>${msg}<br>Sobreviviste ${moves} pasos.</p>
    <button onclick="location.reload()">REINTENTAR</button>`);
}
document.querySelectorAll(".door-btn[data-dir]").forEach(b=>b.onclick=()=>tryDoor(b.dataset.dir));
document.getElementById("btn-compass").onclick=collectCompass;
document.getElementById("chk-showcompass").addEventListener("change",e=>{
  showCompassOnMap=e.target.checked;
  log(showCompassOnMap?"Minimapa: compás VISIBLE":"Minimapa: compás OCULTO");
  drawMinimap3D();
});
document.getElementById("chk-light").addEventListener("change",e=>{
  centerLightEnabled=e.target.checked;
  if(centerLight) centerLight.visible=centerLightEnabled;
  log(centerLightEnabled?"Luz central ENCENDIDA":"Luz central APAGADA");
  toast(centerLightEnabled?"Luz central encendida":"Luz central apagada");
});
document.getElementById("chk-doors").addEventListener("change",e=>{
  doorChallengesEnabled=e.target.checked;
  log(doorChallengesEnabled?"Retos de puerta ACTIVADOS":"Retos de puerta DESACTIVADOS (navegación libre)");
  toast(doorChallengesEnabled?"Retos activados":"Modo libre: sin cálculos");
  refreshHUD();
});
document.getElementById("btn-start").onclick=()=>{
  // salida aleatoria en borde + inicio aleatorio libre (>=5 cubos de la salida)
  EXIT=randomBorderExit();
  let tries=0;
  do{
    pos=[Math.floor(Math.random()*SIZE),Math.floor(Math.random()*SIZE),Math.floor(Math.random()*SIZE)];
    tries++;
  }while(manhattan(pos,EXIT)<5 && tries<200);
  solvedRooms.clear(); visited.clear(); pathOrder=[];
  lives=3; moves=0; elapsed=0;
  // compás escondido: sala al azar distinta del inicio y de la salida (sin marca en minimapa)
  compassCollected=false; compassPos=null;
  { let t=0;
    do{
      compassPos=[Math.floor(Math.random()*SIZE),Math.floor(Math.random()*SIZE),Math.floor(Math.random()*SIZE)];
      t++;
    }while((manhattan(compassPos,EXIT)===0||manhattan(pos,compassPos)<2)&&t<200);
  }
  document.getElementById("pill-compass").style.display="none";
  document.getElementById("btn-compass").style.display="none";
  document.getElementById("log").innerHTML="";
  document.getElementById("start").style.display="none";
  playing=true; startTime=Date.now();
  visited.add(key(...pos)); pathOrder.push([...pos]); roomUnlocked=true;
  timerInt=setInterval(()=>{elapsed=(Date.now()-startTime)/1000;document.getElementById("h-time").textContent=fmtTime(elapsed);},500);
  log(`Aparición aleatoria en [${pos}]. Salida en borde, dist. ${manhattan(pos,EXIT)}`);
  refreshAll();
  toast("Elige una puerta y resuelve su cálculo para avanzar.");
};

initThree();
try{ initMinimap(); }catch(e){ console.warn("minimapa 3D no disponible", e); }
refresh3D();refreshHUD();
})();
