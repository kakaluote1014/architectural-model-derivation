(function(){
  'use strict';
  const $=id=>document.getElementById(id), Q=new URLSearchParams(location.search), FILM=Q.has('film'), DURATION=48;
  if(FILM)document.body.classList.add('film');
  const CHAPTERS=[
    {t:0,title:'从家门，<br>到树下。',short:'社区定位',desc:'在社区中找到B组南排住宅，跟随模型，走进日常生活。',caption:'B组南排住宅，是这次讲解的主角。'},
    {t:4.5,title:'四棵树，<br>一处前场。',short:'树下前场',desc:'住宅的南侧，棋桌、长椅与活动设施，共同组成日常停留的地方。',caption:'住宅之外，先看人与人相遇的地方。'},
    {t:10,title:'把楼层，<br>逐层打开。',short:'分层展开',desc:'三层住宅、外廊与屋面依次拉开，让原本重叠的关系变得清楚。',caption:'原有构件按层展开；结束后回到原位。'},
    {t:18.5,title:'走近一户，<br>看清内部。',short:'户型内部',desc:'打开首层中间户，依照模型与原工作数据，辨认起居、卧室和服务空间。',caption:'卧室、客餐与服务空间，在同一个户型中组织。'},
    {t:27,title:'沿着外廊，<br>回到地面。',short:'外廊与楼梯',desc:'从二层入户口走向外廊，沿现有楼梯下行，再把视线带向住宅前场。',caption:'入户口 → 外廊 → 楼梯侧门 → 前场；路径为压缩时间示意。'},
    {t:40,title:'归位之后，<br>生活继续。',short:'整体归位',desc:'楼层与屋面回到原位，镜头重新落到树下；空间的关系，留在完整建筑里。',caption:'从家门，到树下。让建筑讲清日常生活。'}
  ];
  const {clamp,lerp,tween,ease}=OM;
  const stage=$('stage'), canvas=$('scene');
  let renderer;
  try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true,alpha:false});}
  catch(error){$('fallback').hidden=false;throw error;}
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
  renderer.setClearColor(0xf3f2eb,1);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.18;
  const scene=new THREE.Scene();
  scene.fog=new THREE.Fog(0xf3f2eb,240,520);
  const camera=new THREE.PerspectiveCamera(35,1,1,900);
  const ambient=new THREE.HemisphereLight(0xfffcf2,0x68766b,2.25);scene.add(ambient);
  const sun=new THREE.DirectionalLight(0xfff6e0,2.1);sun.position.set(-32,65,42);sun.target.position.set(0,0,3);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-62,right:62,top:62,bottom:-62,near:1,far:170});sun.shadow.bias=-.0007;sun.shadow.normalBias=.035;scene.add(sun,sun.target);
  const fill=new THREE.DirectionalLight(0xe0eaf1,.55);fill.position.set(40,25,-35);scene.add(fill);
  const root=new THREE.Group();scene.add(root);
  const meshes=[],floorColors=[0x8eaa86,0xbfa06e,0x749a9b,0x506853],paper=new THREE.Color(0xf3f2eb),accent=new THREE.Color(0xc39959);
  const decode=s=>{const bytes=Uint8Array.from(atob(s),c=>c.charCodeAt(0));return new Float32Array(bytes.buffer)};
  for(const src of SU_DATA.meshes){
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(decode(src.positions_b64),3));geometry.computeVertexNormals();geometry.computeBoundingSphere();
    const color=new THREE.Color(...src.color.map(c=>c/255)).convertSRGBToLinear();
    const glass=src.alpha<.99;
    const material=new THREE.MeshStandardMaterial({color,roughness:glass?.3:.88,metalness:0,side:THREE.DoubleSide,transparent:true,opacity:glass?Math.max(src.alpha,.28):1,depthWrite:!glass,polygonOffset:src.kind==='landscape',polygonOffsetFactor:-1,polygonOffsetUnits:-1});
    const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=src.zone!=='context'&&!glass;mesh.receiveShadow=true;root.add(mesh);
    const object={mesh,src,baseColor:color.clone(),baseOpacity:material.opacity,edge:null};
    if(src.zone==='south'||src.zone==='north'){
      const edges=new THREE.EdgesGeometry(geometry,35),line=new THREE.LineSegments(edges,new THREE.LineBasicMaterial({color:0x435448,transparent:true,opacity:.3,depthWrite:false}));
      line.renderOrder=2;mesh.add(line);object.edge=line;
    }
    meshes.push(object);
  }
  const base=new THREE.Mesh(new THREE.PlaneGeometry(650,650),new THREE.ShadowMaterial({color:0x4f5b44,opacity:.12}));base.rotation.x=-Math.PI/2;base.position.y=-.19;base.receiveShadow=true;scene.add(base);

  // Annotation geometry is separate from the source architecture.
  const annotation=new THREE.Group();scene.add(annotation);
  function line(points,color=0xb08c4a){return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p))),new THREE.LineBasicMaterial({color,transparent:true,opacity:.8,depthWrite:false}));}
  const locator=line([[-22.8,.04,21.3],[22.8,.04,21.3],[22.8,.04,-25.8],[-22.8,.04,-25.8],[-22.8,.04,21.3]],0xb08c4a);annotation.add(locator);
  const toWorld=([x,y,z=0])=>new THREE.Vector3((x-90500)/1000,z/1000,(110000-y)/1000);
  const selected=SPACE_DATA.floors[0],roomMeshes=[],roomLabels=[];
  const roomColor=name=>name.includes('卧室')?0xc2a57b:name.includes('客餐')?0x8da88a:name.includes('厨')||name.includes('卫浴')?0x86a6a5:0xc5c7b1;
  for(const room of selected.home.rooms){
    const [x,y,w,d]=room.rect_mm,world=toWorld([selected.origin_project_mm[0]+x+w/2,selected.origin_project_mm[1]+y+d/2,45]);
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w/1000,d/1000),new THREE.MeshBasicMaterial({color:roomColor(room.name),transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}));
    mesh.rotation.x=-Math.PI/2;mesh.position.copy(world);mesh.renderOrder=3;annotation.add(mesh);roomMeshes.push(mesh);
    if(['卧室一','卧室二','厨房','卫浴','客餐 / 居家工作'].includes(room.name))roomLabels.push({text:room.name==='客餐 / 居家工作'?'客餐 / 工作':room.name,pos:world.clone().add(new THREE.Vector3(0,.13,0))});
  }
  const entryX=80900;
  const routePoints=[[-9.6,3.13,1],[-9.6,3.13,0],[-9.6,3.13,-1],[9,3.13,-1],[9,3.13,0.7],[12.45,3.13,0.7],[12.45,3.13,2],[12.45,2.963333333333333,2.14],[12.45,2.796666666666667,2.42],[12.45,2.63,2.7],[12.45,2.4633333333333334,2.98],[12.45,2.2966666666666664,3.26],[12.45,2.13,3.54],[12.45,1.9633333333333332,3.82],[12.45,1.7966666666666666,4.1],[12.45,1.63,5],[10.95,1.63,5],[10.95,1.4633333333333332,4.1],[10.95,1.2966666666666666,3.82],[10.95,1.13,3.54],[10.95,0.9633333333333334,3.26],[10.95,0.7966666666666666,2.98],[10.95,0.63,2.7],[10.95,0.4633333333333333,2.42],[10.95,0.29666666666666663,2.14],[10.95,0.13,2],[10.95,0.13,0.7],[9,0.13,0.7],[9,0.13,-1],[7,0.13,-1],[7,0.13,-2.6],[14.5,0.13,-2.6],[14.5,0.13,11.5],[1,0.13,11.5],[1,0.13,14.3]].map(p=>new THREE.Vector3(...p));
  const routeCurve=new THREE.CurvePath();for(let i=1;i<routePoints.length;i++)if(routePoints[i].distanceTo(routePoints[i-1])>.001)routeCurve.add(new THREE.LineCurve3(routePoints[i-1],routePoints[i]));
  const tubeGeometry=new THREE.TubeGeometry(routeCurve,520,.065,6,false);
  const routeMesh=new THREE.Mesh(tubeGeometry,new THREE.MeshBasicMaterial({color:0xb87b2f,transparent:true,opacity:.92,depthTest:false}));routeMesh.renderOrder=12;annotation.add(routeMesh);
  const actor=new THREE.Group(),bodyMaterial=new THREE.MeshStandardMaterial({color:0xb8813d,roughness:.9});
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(.19,.64,4,8),bodyMaterial);body.position.y=1.02;actor.add(body);
  const head=new THREE.Mesh(new THREE.SphereGeometry(.15,12,10),new THREE.MeshStandardMaterial({color:0xd3b38b}));head.position.y=1.62;actor.add(head);
  const legs=[];for(const x of [-.1,.1]){const pivot=new THREE.Group();pivot.position.set(x,.68,0);const leg=new THREE.Mesh(new THREE.CapsuleGeometry(.065,.49,3,6),bodyMaterial);leg.position.y=-.29;pivot.add(leg);actor.add(pivot);legs.push(pivot);}
  actor.children.forEach(m=>{if(m.isMesh)m.castShadow=true});annotation.add(actor);
  const ring=new THREE.Mesh(new THREE.RingGeometry(.29,.39,32),new THREE.MeshBasicMaterial({color:0xb58a4e,transparent:true,opacity:.7,side:THREE.DoubleSide,depthTest:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.02;actor.add(ring);
  const floorLabels=[0,1,2,3].map((level)=>({text:level===3?'屋面 +9.000':`${level+1}F  ${level===0?'±0.000':'+'+(level*3).toFixed(3)}`,level}));
  const allLabels=[];
  function makeLabel(text,type=''){const el=document.createElement('div');el.className='label '+type;el.innerHTML=text;$('labels').append(el);allLabels.push(el);return el;}
  const targetLabel=makeLabel('B组南排住宅','target');floorLabels.forEach(x=>x.el=makeLabel(x.text,'floor'));roomLabels.forEach(x=>x.el=makeLabel(x.text,'room'));
  const frontLabel=makeLabel('四树活动前场<small>棋桌 · 休息 · 活动</small>');
  const stairLabel=makeLabel('现有楼梯<small>沿模型踏步下行</small>');
  const entryLabel=makeLabel('二层入户口<small>连接公共外廊</small>');
  const sceneCenter=new THREE.Vector3(),lookAt=new THREE.Vector3(),vec=new THREE.Vector3();
  let width=1,height=1,currentTime=0,playing=false,lastTimestamp=null,manualMode=false;
  const defaults={explode:null,roof:false,route:false,white:false,rooms:false,yaw:0,pitch:0,zoom:1};let manual={...defaults};
  const keys=[
    {t:0,eye:[105,188,230],target:[-2,0,35]},
    {t:1.3,eye:[105,188,230],target:[-2,0,35]},
    {t:4.5,eye:[24,26,52],target:[-3,3,5]},
    {t:6.4,eye:[20,24,51],target:[-2,3,9]},
    {t:9.8,eye:[20,24,51],target:[-2,3,9]},
    {t:12.9,eye:[31,32,51],target:[-4,8,4]},
    {t:17.1,eye:[31,32,51],target:[-4,8,4]},
    {t:20.8,eye:[-9,24,9],target:[-9,.4,5]},
    {t:26,eye:[-9,24,9],target:[-9,.4,5]},
    {t:28.8,eye:[19,24,-22],target:[2,2,1]},
    {t:32.4,eye:[25,17,-7],target:[10,2,3]},
    {t:35.1,eye:[24,15,11],target:[11,1,5]},
    {t:39.5,eye:[24,24,49],target:[0,2,8]},
    {t:43,eye:[19,25,53],target:[-2,3,9]},
    {t:48,eye:[19,25,53],target:[-2,3,9]}
  ];
  function cameraAt(t){
    let i=0;while(i<keys.length-2&&t>keys[i+1].t)i++;
    const a=keys[i],b=keys[i+1],u=ease.sineInOut(clamp((t-a.t)/(b.t-a.t)));
    return {eye:a.eye.map((v,j)=>lerp(v,b.eye[j],u)),target:a.target.map((v,j)=>lerp(v,b.target[j],u))};
  }
  function chapterAt(t){let i=CHAPTERS.length-1;while(i>0&&t<CHAPTERS[i].t)i--;return i;}
  const chapterButtons=CHAPTERS.map((c,i)=>{const button=document.createElement('button');button.innerHTML=`<span class="num">0${i+1}</span><span class="name">${c.short}</span>`;button.addEventListener('click',()=>{pause();manualMode=false;manual={...defaults};currentTime=c.t+(i===0?0:.3);renderAt(currentTime,true)});$('chapterNav').append(button);return button});
  function showLabel(el,pos,opacity){
    el.style.display=opacity>.015?'block':'none';if(opacity<=.015)return;
    vec.copy(pos).project(camera);const x=(vec.x*.5+.5)*width,y=(-vec.y*.5+.5)*height;
    if(vec.z>1||vec.z< -1||x< -60||x>width+60||y< -60||y>height+60){el.style.display='none';return}
    el.style.left=Math.min(width-65,Math.max(65,x))+'px';el.style.top=Math.min(height-75,Math.max(40,y))+'px';el.style.opacity=opacity;
  }
  function opacityFor(src,state){
    let op=1;
    if(src.zone==='context')op=lerp(1,.08,state.focus);
    if(src.zone==='north')op=lerp(1,.09,state.focus);
    if(src.zone==='forecourt')op=lerp(1,.08,state.rooms);
    if(src.zone==='south'){
      if(src.level>0)op*=1-state.rooms;
      if(src.kind==='roof')op*=1-Math.max(state.rooms,state.openRoof,state.route*.98);
      if(src.kind==='wall'||src.kind==='window_detail')op*=1-state.route*.87;
    }
    return op;
  }
  function renderAt(time,useManual=false){
    const t=clamp(time,0,DURATION),chapter=chapterAt(t),roomPhase=tween(t,18.5,20,ease.cubicInOut)*(1-tween(t,26,28.5,ease.cubicInOut));
    const routePhase=tween(t,27,28.5,ease.cubicOut)*(1-tween(t,38.7,40.3,ease.cubicInOut));
    const exploded=tween(t,10.2,13,ease.cubicOut)*(1-tween(t,17.6,20,ease.cubicInOut));
    const focus=tween(t,9.7,12.5,ease.cubicInOut)*(1-tween(t,38.2,41,ease.cubicInOut));
    const state={explode:exploded,rooms:roomPhase,route:routePhase,focus,openRoof:0,white:false};
    if(useManual&&manualMode){state.explode=manual.explode??exploded;state.rooms=manual.rooms?1:0;state.route=manual.route?1:0;state.focus=Math.max(state.explode,state.rooms,state.route);state.openRoof=manual.roof?1:0;state.white=manual.white;}
    for(const object of meshes){
      const {src,mesh,baseColor,baseOpacity,edge}=object;
      const op=opacityFor(src,state);mesh.visible=op>.008;mesh.material.opacity=baseOpacity*op;
      mesh.position.set(0,src.zone==='south'?src.level*3.2*state.explode:0,0);
      mesh.material.color.copy(baseColor);
      if(src.zone==='context'||src.zone==='north')mesh.material.color.lerp(paper,.12+state.focus*.36);
      if(state.white&&src.zone!=='context'&&src.zone!=='forecourt')mesh.material.color.set(src.alpha<.99?0xb7c7be:0xe4e6d9).convertSRGBToLinear();
      if(src.zone==='south'&&state.explode>.01&&src.alpha>.99)mesh.material.color.lerp(new THREE.Color(floorColors[src.level]),state.explode*.13);
      if(state.route>.01&&src.zone==='south'&&(src.kind==='stair'||src.kind==='walkway'))mesh.material.color.lerp(new THREE.Color(0xb6914c),state.route*.5);
      if(edge){edge.material.opacity=(src.zone==='south'?.3:.16)*op;edge.visible=mesh.visible;}
    }
    roomMeshes.forEach(m=>{m.visible=state.rooms>.01;m.material.opacity=.76*state.rooms});
    const routeProgress=useManual&&manualMode&&manual.route?1:clamp((t-28)/10.6);
    routeMesh.visible=state.route>.02;routeMesh.material.opacity=.94*state.route;routeMesh.geometry.setDrawRange(0,Math.max(0,Math.floor(routeMesh.geometry.index.count*routeProgress/6)*6));
    actor.visible=state.route>.02;
    if(actor.visible){const pt=routeCurve.getPointAt(routeProgress),next=routeCurve.getPointAt(Math.min(1,routeProgress+.002));actor.position.copy(pt);const dir=next.sub(pt);actor.rotation.y=Math.atan2(dir.x,dir.z);legs.forEach((leg,i)=>leg.rotation.x=routeProgress>=1?0:Math.sin(t*8+i*Math.PI)*.28);}
    locator.visible=t<8;locator.material.opacity=.75*(1-tween(t,4.4,7.7));
    const authored=cameraAt(t);lookAt.fromArray(authored.target);sceneCenter.fromArray(authored.eye).sub(lookAt);
    const fitScale=Math.max(1,1.55/(width/height));sceneCenter.multiplyScalar(fitScale);
    if(useManual&&manualMode){const spherical=new THREE.Spherical().setFromVector3(sceneCenter);spherical.theta+=manual.yaw;spherical.phi=clamp(spherical.phi+manual.pitch,.12,Math.PI*.47);spherical.radius*=manual.zoom;sceneCenter.setFromSpherical(spherical);}
    camera.position.copy(lookAt).add(sceneCenter);camera.lookAt(lookAt);camera.updateMatrixWorld();
    renderer.render(scene,camera);
    $('chapterNumber').textContent=`0${chapter+1}`;$('chapterTitle').innerHTML=CHAPTERS[chapter].title;$('chapterDescription').textContent=CHAPTERS[chapter].desc;$('captionText').textContent=CHAPTERS[chapter].caption;
    $('currentStep').textContent=`0${chapter+1} / ${CHAPTERS[chapter].short}`;$('timeNow').textContent=`00:${Math.floor(t).toString().padStart(2,'0')}`;$('timeline').value=t;
    $('filmProgress').style.transform=`scaleX(${t/DURATION})`;chapterButtons.forEach((b,i)=>b.classList.toggle('active',i===chapter));
    $('explode').value=Math.round(state.explode*100);$('explodeValue').textContent=Math.round(state.explode*100)+'%';
    for(const [id,key]of [['roofToggle','roof'],['routeToggle','route'],['whiteToggle','white'],['roomsToggle','rooms']])$(id).setAttribute('aria-pressed',String(useManual&&manualMode&&manual[key]));
    allLabels.forEach(el=>el.style.display='none');
    showLabel(targetLabel,new THREE.Vector3(-4,10.5,6),t<5.7?1-tween(t,4.8,5.7):0);
    showLabel(frontLabel,new THREE.Vector3(-.5,1.5,16),tween(t,4.7,5.6)*(1-tween(t,9.3,10.1)));
    floorLabels.forEach(x=>showLabel(x.el,new THREE.Vector3(-23.3,x.level*3+x.level*3.2*state.explode+.65,5),state.explode));
    roomLabels.forEach(x=>showLabel(x.el,x.pos,state.rooms));
    showLabel(entryLabel,toWorld([entryX,110000,3650]),state.route*(1-tween(t,32.5,33.5)));
    showLabel(stairLabel,toWorld([102200,108000,4000]),state.route*tween(t,31.2,32.2)*(1-tween(t,36.5,37.5)));
    $('stageNote').textContent=manualMode?'自由观察 · 拖动旋转 · 滚轮缩放':'拖动旋转 · 滚轮缩放';
    window.__debugState={actorVisible:actor.visible,actorPosition:actor.position.toArray(),actorProjection:actor.position.clone().project(camera).toArray(),time:t,chapter,explode:state.explode,rooms:state.rooms,route:state.route,sourceTriangles:SU_DATA.triangles,displayTriangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,manual:useManual&&manualMode,camera:camera.position.toArray()};
    return true;
  }
  function resize(){const rect=stage.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();renderAt(currentTime,true)}
  function pause(){playing=false;lastTimestamp=null;$('play').querySelector('span').textContent='播放讲解';$('play').setAttribute('aria-label','播放自动讲解');$('play').querySelector('path').setAttribute('d','M8 5l11 7-11 7z');}
  function play(){if(currentTime>=DURATION)currentTime=0;manualMode=false;manual={...defaults};playing=true;lastTimestamp=null;$('play').querySelector('span').textContent='暂停讲解';$('play').setAttribute('aria-label','暂停自动讲解');$('play').querySelector('path').setAttribute('d','M7 5h4v14H7zM14 5h4v14h-4z');}
  function manualAction(){pause();manualMode=true;}
  $('play').addEventListener('click',()=>playing?pause():play());$('restart').addEventListener('click',()=>{currentTime=0;play();renderAt(0,true)});
  $('timeline').addEventListener('input',event=>{pause();manualMode=false;manual={...defaults};currentTime=+event.target.value;renderAt(currentTime,true)});
  $('explode').addEventListener('input',event=>{const value=+event.target.value/100;manualAction();manual.explode=value;renderAt(currentTime,true)});
  for(const [id,key]of [['roofToggle','roof'],['routeToggle','route'],['whiteToggle','white'],['roomsToggle','rooms']])$(id).addEventListener('click',()=>{manualAction();manual[key]=!manual[key];if(key==='rooms'&&manual.rooms){currentTime=23;manual.explode=0;manual.roof=true;}if(key==='route'&&manual.route){currentTime=32;manual.explode=0;}renderAt(currentTime,true)});
  $('resetView').addEventListener('click',()=>{pause();manual={...defaults};manualMode=false;currentTime=6.8;renderAt(currentTime,true)});
  $('freeMode').addEventListener('click',()=>{manualAction();renderAt(currentTime,true)});
  $('homeLink').addEventListener('click',event=>{event.preventDefault();pause();manual={...defaults};manualMode=false;currentTime=0;renderAt(currentTime,true)});
  let dragging=null;
  canvas.addEventListener('pointerdown',event=>{manualAction();dragging={x:event.clientX,y:event.clientY,yaw:manual.yaw,pitch:manual.pitch};canvas.setPointerCapture(event.pointerId)});
  canvas.addEventListener('pointermove',event=>{if(!dragging)return;manual.yaw=dragging.yaw-(event.clientX-dragging.x)*.006;manual.pitch=dragging.pitch-(event.clientY-dragging.y)*.004;renderAt(currentTime,true)});
  canvas.addEventListener('pointerup',()=>dragging=null);canvas.addEventListener('pointercancel',()=>dragging=null);
  canvas.addEventListener('wheel',event=>{event.preventDefault();manualAction();manual.zoom=clamp(manual.zoom*Math.exp(event.deltaY*.001),.4,3);renderAt(currentTime,true)},{passive:false});
  window.addEventListener('keydown',event=>{if(event.target.tagName==='INPUT')return;if(event.code==='Space'){event.preventDefault();playing?pause():play()}if(event.code==='ArrowRight'||event.code==='ArrowLeft'){pause();currentTime=clamp(currentTime+(event.code==='ArrowRight'?1:-1),0,DURATION);renderAt(currentTime,true)}});
  window.addEventListener('resize',resize);
  function tick(stamp){if(playing){if(lastTimestamp!==null)currentTime=Math.min(DURATION,currentTime+(stamp-lastTimestamp)/1000);lastTimestamp=stamp;renderAt(currentTime,true);if(currentTime>=DURATION)pause()}requestAnimationFrame(tick)}
  window.__seek=async t=>{currentTime=clamp(t,0,DURATION);renderAt(currentTime,false);await new Promise(requestAnimationFrame);renderAt(currentTime,false);renderer.getContext().finish();return true};
  window.__meta={dur:DURATION,fps:30,cuts:[],inFrame:{scene:[0,DURATION,'whole'],chapterTitle:[0,DURATION,'whole']},chapters:CHAPTERS.map(c=>({time:c.t,title:c.short}))};
  window.__motion=(a,b)=>{const x=cameraAt(a),y=cameraAt(b);const travel=Math.sqrt(x.eye.reduce((sum,v,i)=>sum+(v-y.eye[i])**2,0));return Math.max(travel*12,Math.abs(tween(a,10.2,13,ease.cubicOut)-tween(b,10.2,13,ease.cubicOut))*320)};
  window.__track=()=>({model:{x:stage.offsetLeft,y:stage.offsetTop,w:width,h:height,op:1},chapter:{x:38,y:document.querySelector('.story-panel').offsetTop,w:265,h:270,op:1}});
  window.__ready=document.fonts.ready.then(()=>{currentTime=Q.has('t')?+Q.get('t'):0;resize();$('loadStatus').style.display='none';if(Q.has('play'))play();requestAnimationFrame(tick);return true});
})();
