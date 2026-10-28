/* Offline viewer. All transforms and materials are assigned from base data each render. */
(()=>{'use strict';
 const $=id=>document.getElementById(id),D=window.MODEL_DATA,C=D.config,frames=C.keyframes,duration=frames.at(-1).t;
 const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v)),mix=(a,b,u)=>a+(b-a)*u,smooth=u=>u*u*(3-2*u),fields=['explode','roof','traffic','functions','focus'];
 const focus=m=>!C.focusZones?.length||C.focusZones.includes(m.zone),floors=C.floors??[],floorFor=m=>focus(m)?floors.find(f=>f.level===m.level):null;
 const floorById=id=>floors.find(f=>f.id===id),stage=$('stage'),canvas=$('scene');
 let renderer;
 try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});}catch(e){$('error').hidden=false;$('error').textContent='WebGL未启用，请使用支持WebGL的浏览器打开。';throw e;}
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.setClearColor(0xf1f0e9);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(36,1,.05,10000);
 scene.add(new THREE.HemisphereLight(0xfffae8,0x71836e,2.3));const sun=new THREE.DirectionalLight(0xfff5dc,2);sun.position.set(-40,80,50);scene.add(sun);const fill=new THREE.DirectionalLight(0xd6e2ef,.8);fill.position.set(40,25,-35);scene.add(fill);
 const objects=D.meshes.map(src=>{const bytes=Uint8Array.from(atob(src.positions_b64),x=>x.charCodeAt(0));const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(bytes.buffer),3));geometry.computeVertexNormals();geometry.computeBoundingBox();
  const color=new THREE.Color(...src.color.map(v=>v/255)).convertSRGBToLinear();const material=new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide,roughness:.85,transparent:true,opacity:src.alpha??1,depthWrite:(src.alpha??1)>=.99});const mesh=new THREE.Mesh(geometry,material);scene.add(mesh);return {src,mesh,color,opacity:src.alpha??1,floor:floorFor(src)};
 });
 const spaces=(C.spaces??[]).map(s=>{const mesh=new THREE.Mesh(new THREE.PlaneGeometry(...s.size),new THREE.MeshBasicMaterial({color:s.color??'#c4a36f',transparent:true,opacity:.7,side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3}));mesh.rotation.x=-Math.PI/2;scene.add(mesh);return {src:s,mesh};});
 const focusedBox=new THREE.Box3();objects.filter(o=>focus(o.src)).forEach(o=>focusedBox.union(o.mesh.geometry.boundingBox));const center=focusedBox.getCenter(new THREE.Vector3());
 const annotation=[...(C.labels??[]).map(l=>({...l,type:'fixed'})),...floors.map(f=>({text:`${f.label} · ${f.elevation.toFixed(3)} m`,position:[focusedBox.min.x,f.elevation+.5,center.z],floorId:f.id,type:'floor'})),...(C.spaces??[]).map(s=>({text:s.label,position:s.center,floorId:s.floorId,type:'space'}))].map(l=>{const el=document.createElement('span');el.className='label';el.textContent=l.text;$('labels').append(el);return {...l,el};});
 const routes=(C.routes??[]).map(src=>{const human=createActivityHuman(scene,src),points=src.waypoints.map(p=>new THREE.Vector3(...p.p).add(new THREE.Vector3(0,.025,0))),color=src.actor?.color??'#b87938';
  const full=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineDashedMaterial({color,transparent:true,opacity:.25,dashSize:.3,gapSize:.2,depthTest:false}));full.computeLineDistances();full.renderOrder=10;scene.add(full);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array((points.length+1)*3),3));const trail=new THREE.Line(geometry,new THREE.LineBasicMaterial({color,transparent:true,opacity:.95,depthTest:false}));trail.frustumCulled=false;trail.renderOrder=11;scene.add(trail);
  const label=document.createElement('span');label.className='label actor-label';$('labels').append(label);const option=document.createElement('option');option.value=src.id;option.textContent=src.name;$('routeSelect').append(option);return {src,human,full,trail,label,sample:null};
 });
 let showPeople=true,showPaths=true,selectedRoute='all';
 const supportRay=new THREE.Raycaster(),supportObjects=objects.filter(o=>(C.routeChecks?.supportKinds??['slab','stair','walkway','landscape','context','display-surface']).includes(o.src.kind)&&o.src.kind!=='furniture').map(o=>o.mesh),down=new THREE.Vector3(0,-1,0);
 const groundHeight=p=>{supportRay.set(new THREE.Vector3(p[0],p[1]+.3,p[2]),down);supportRay.far=.65;const h=supportRay.intersectObjects(supportObjects,false).find(h=>Math.abs(h.point.y-p[1])<.3);return h?.point.y;};
 let time=0,playing=false,last=null,manual=null,orbit={yaw:0,pitch:0,zoom:1},white=false;
 const freshOrbit=()=>orbit={yaw:0,pitch:0,zoom:1};
 function poseAt(t){let i=0;while(i<frames.length-2&&t>frames[i+1].t)i++;const a=frames[i],b=frames[i+1],u=smooth(clamp((t-a.t)/(b.t-a.t)));return {eye:a.eye.map((v,j)=>mix(v,b.eye[j],u)),target:a.target.map((v,j)=>mix(v,b.target[j],u)),state:Object.fromEntries(fields.map(k=>[k,mix(a.state[k],b.state[k],u)]))};}
 const chapterAt=t=>{let i=C.chapters.length-1;while(i>0&&t<C.chapters[i].t)i--;return i;};
 function pause(){playing=false;last=null;$('play').textContent='播放';}
 function play(){if(time>=duration)time=0;manual=null;freshOrbit();white=false;playing=true;last=null;$('play').textContent='暂停';render();}
 function seek(t){pause();time=clamp(t,0,duration);manual=null;freshOrbit();white=false;render();}
 function manualAction(){pause();if(!manual)manual={...poseAt(time).state};}
 const buttons=C.chapters.map((c,i)=>{const b=document.createElement('button');b.textContent=`${String(i+1).padStart(2,'0')} ${c.title}`;b.addEventListener('click',()=>seek(c.t));$('chapters').append(b);return b;});
 const format=t=>`${Math.floor(t/60).toString().padStart(2,'0')}:${Math.floor(t%60).toString().padStart(2,'0')}`;
 function render(){const pose=poseAt(time),s=manual??pose.state,chapter=chapterAt(time),inspectionFloor=floorById(C.inspectionFloorId)??floors[0];
  for(const o of objects){const {src,mesh,color,opacity,floor}=o;let op=focus(src)?1:mix(1,.08,s.focus);if(focus(src)){if((C.roofKinds??[]).includes(src.kind))op*=1-Math.max(s.roof,s.functions);if(inspectionFloor&&floor&&floor.elevation>inspectionFloor.elevation)op*=1-s.functions;}
   if(focus(src)&&['wall','window_detail'].includes(src.kind))op*=1-s.traffic*.80;
   mesh.position.set(0,(floor?.offset??0)*s.explode,0);mesh.visible=op>.005;mesh.material.opacity=opacity*op;mesh.material.color.copy(color);if(white)mesh.material.color.set('#e5e6db').convertSRGBToLinear();else if(focus(src)&&(C.trafficKinds??[]).includes(src.kind))mesh.material.color.lerp(new THREE.Color('#c08034').convertSRGBToLinear(),s.traffic*.85);
  }
  spaces.forEach(({src,mesh})=>{mesh.visible=s.functions>.005;mesh.material.opacity=.72*s.functions;mesh.position.fromArray(src.center);mesh.position.y+=(floorById(src.floorId)?.offset??0)*s.explode;});
  scene.updateMatrixWorld(true);
  for(const r of routes){const sample=Activity.sample(r.src,time),eligible=sample.visible&&(selectedRoute==='all'||selectedRoute===r.src.id)&&s.explode<.02&&s.functions<.02;r.sample=sample;r.human.pose(sample,groundHeight);r.human.root.visible=eligible&&showPeople;r.full.visible=r.trail.visible=eligible&&showPaths;
   const attr=r.trail.geometry.attributes.position;for(let i=0;i<=sample.segment;i++)attr.setXYZ(i,...r.src.waypoints[i].p.map((v,j)=>v+(j===1?.027:0)));attr.setXYZ(sample.segment+1,...sample.position.map((v,j)=>v+(j===1?.027:0)));attr.needsUpdate=true;r.trail.geometry.setDrawRange(0,sample.segment+2);
  }
  const target=new THREE.Vector3(...pose.target),delta=new THREE.Vector3(...pose.eye).sub(target);const fit=Math.max(1,1.35/camera.aspect);delta.multiplyScalar(fit);const sphere=new THREE.Spherical().setFromVector3(delta);sphere.theta+=orbit.yaw;sphere.phi=clamp(sphere.phi+orbit.pitch,.08,Math.PI-.08);sphere.radius*=orbit.zoom;camera.position.copy(target).add(new THREE.Vector3().setFromSpherical(sphere));camera.lookAt(target);camera.updateMatrixWorld();renderer.render(scene,camera);
  const r=stage.getBoundingClientRect(),placed=[];
  for(const l of annotation){const visible=(l.type==='floor'?s.explode>.02:l.type==='space'?s.functions>.02:true)&&time>=(l.visibleFrom??0)&&time<(l.visibleUntil??Infinity);const p=new THREE.Vector3(...l.position);p.y+=(floorById(l.floorId)?.offset??0)*s.explode;p.project(camera);let x=(p.x+1)*r.width/2,y=(1-p.y)*r.height/2;let show=visible&&p.z>=-1&&p.z<=1&&x>10&&x<r.width-10&&y>40&&y<r.height-25;
   // Prefer a few readable labels to a pile of overlapping text.
   if(show&&placed.some(q=>Math.abs(q[0]-x)<95&&Math.abs(q[1]-y)<26))show=false;
   l.el.style.display=show?'block':'none';if(show){x=clamp(x,70,r.width-70);l.el.style.left=x+'px';l.el.style.top=y+'px';placed.push([x,y]);}
  }
  const actionNames={walk:'行走',upstairs:'上楼',downstairs:'下楼',stand:'停留',talk:'交流',sit:'休息', 'sit-transition':'坐下'};
  const actorLabels=[];for(const actor of routes){const p=new THREE.Vector3(...actor.sample.position).add(new THREE.Vector3(0,actor.sample.sit>.5?1.25:1.9,0)).project(camera),x=(p.x+1)*r.width/2;let y=(1-p.y)*r.height/2;while(actorLabels.some(q=>Math.abs(q[0]-x)<110&&Math.abs(q[1]-y)<25))y-=26;const visible=actor.human.root.visible&&p.z>=-1&&p.z<=1&&x>30&&x<r.width-30&&y>50&&y<r.height-20;actor.label.style.display=visible?'block':'none';if(visible)actorLabels.push([x,y]);actor.label.style.left=x+'px';actor.label.style.top=y+'px';actor.label.textContent=`${actor.src.actor?.name??actor.src.name} · ${actionNames[actor.sample.action]}`;}
  $('activityStatus').textContent=routes.length?(s.explode>=.02?'楼层归位后显示人物与流线':s.functions>=.02?'当前观察室内；活动情景暂隐':'活动情景示意 · 非真实行为记录'):'未配置活动情景';
  $('chapterTitle').textContent=C.chapters[chapter].title;$('description').textContent=C.chapters[chapter].text;$('caption').textContent=s.functions>.02?(C.functionNote??'功能色块为有来源的辅助示意，不作为完成面净面积。'):C.chapters[chapter].text;
  buttons.forEach((b,i)=>{b.classList.toggle('active',i===chapter);b.setAttribute('aria-current',i===chapter?'step':'false');});$('clock').textContent=`${format(time)} / ${format(duration)}`;$('chapterIndex').textContent=`${chapter+1} / ${C.chapters.length}`;$('timeline').value=time;$('explode').value=s.explode*100;
  for(const key of ['roof','traffic','functions'])$(key).setAttribute('aria-pressed',String(s[key]>.5));$('white').setAttribute('aria-pressed',String(white));
  window.__debug={time,playing,chapter,state:{...s},white,orbit:{...orbit},camera:camera.position.toArray(),target:pose.target,geometryToken:D.triangles+':'+D.maxCoordinateErrorM,sourceTriangles:D.triangles,renderedTriangles:renderer.info.render.triangles,drawCalls:renderer.info.render.calls,objects:objects.map(o=>({id:o.src.id,y:o.mesh.position.y,visible:o.mesh.visible,opacity:o.mesh.material.opacity,color:o.mesh.material.color.getHexString()})),spaces:spaces.map(o=>({position:o.mesh.position.toArray(),visible:o.mesh.visible})),visibleLabels:annotation.filter(l=>l.el.style.display!=='none').map(l=>({text:l.text,position:l.position,floorId:l.floorId})),activities:routes.map(r=>({id:r.src.id,visible:r.human.root.visible,pathVisible:r.trail.visible,position:r.human.root.position.toArray(),yaw:r.human.root.rotation.y,pose:r.sample.action,sit:r.sample.sit,phase:r.sample.phase,speed:r.sample.speed,feet:r.human.contacts(),rig:r.human.signature(),trailCount:r.trail.geometry.drawRange.count,projected:new THREE.Vector3(...r.sample.position).project(camera).toArray()})),activityControls:{showPeople,showPaths,selectedRoute},config:C,duration};
 }
 function resize(){const r=stage.getBoundingClientRect();renderer.setSize(Math.max(r.width,1),Math.max(r.height,1),false);camera.aspect=r.width/Math.max(r.height,1);camera.updateProjectionMatrix();render();}
 $('projectTitle').textContent=C.title;document.title=C.title+' · 空间解析';$('source').textContent=C.source.scope;$('timeline').max=duration;
 $('explode').disabled=floors.length<2;$('roof').disabled=!objects.some(o=>focus(o.src)&&(C.roofKinds??[]).includes(o.src.kind));$('traffic').disabled=!objects.some(o=>focus(o.src)&&(C.trafficKinds??[]).includes(o.src.kind));$('functions').disabled=!spaces.length&&!C.labels?.length;
 for(const id of ['activityToggle','pathToggle','routeSelect'])$(id).disabled=!routes.length;
 $('activityToggle').addEventListener('click',()=>{pause();showPeople=!showPeople;$('activityToggle').setAttribute('aria-pressed',String(showPeople));render();});$('pathToggle').addEventListener('click',()=>{pause();showPaths=!showPaths;$('pathToggle').setAttribute('aria-pressed',String(showPaths));render();});$('routeSelect').addEventListener('change',e=>{selectedRoute=e.target.value;const route=routes.find(r=>r.src.id===selectedRoute);seek(route?route.src.start:0);});
 $('play').addEventListener('click',()=>playing?pause():play());$('restart').addEventListener('click',()=>{time=0;play();});$('timeline').addEventListener('input',e=>seek(+e.target.value));$('reset').addEventListener('click',()=>seek(0));
 $('explode').addEventListener('input',e=>{manualAction();manual.explode=+e.target.value/100;render();});for(const k of ['roof','traffic','functions'])$(k).addEventListener('click',()=>{manualAction();manual[k]=manual[k]>.5?0:1;if(manual[k]===1&&Number.isFinite(C.controlTimes?.[k])){time=clamp(C.controlTimes[k],0,duration);manual.focus=1;freshOrbit();}render();});$('white').addEventListener('click',()=>{manualAction();white=!white;render();});
 const pointers=new Map();let gesture=null;
 function gestureStart(){const ps=[...pointers.values()];gesture=ps.length>=2?{type:'pinch',distance:Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y),zoom:orbit.zoom}:{type:'drag',x:ps[0]?.x,y:ps[0]?.y,yaw:orbit.yaw,pitch:orbit.pitch};}
 canvas.addEventListener('pointerdown',e=>{manualAction();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});canvas.setPointerCapture(e.pointerId);gestureStart();render();});
 canvas.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});const ps=[...pointers.values()];if(gesture.type==='pinch'&&ps.length>=2){const distance=Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y);orbit.zoom=clamp(gesture.zoom*gesture.distance/Math.max(1,distance),.25,4);}else if(gesture.type==='drag'){orbit.yaw=gesture.yaw-(e.clientX-gesture.x)*.006;orbit.pitch=gesture.pitch-(e.clientY-gesture.y)*.004;}render();});
 for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{pointers.delete(e.pointerId);gestureStart();});
 canvas.addEventListener('wheel',e=>{e.preventDefault();manualAction();orbit.zoom=clamp(orbit.zoom*Math.exp(e.deltaY*.001),.25,4);render();},{passive:false});
 window.addEventListener('keydown',e=>{if(['INPUT','BUTTON','SUMMARY'].includes(e.target.tagName))return;if(e.code==='Space'){e.preventDefault();playing?pause():play();}if(e.code==='ArrowRight'||e.code==='ArrowLeft'){e.preventDefault();seek(time+(e.code==='ArrowRight'?1:-1));}});
 // QA observes the actual GPU geometry buffers, not just configuration metadata.
 window.__geometry=()=>{let hash=2166136261,count=0;for(const o of objects){const a=o.mesh.geometry.attributes.position.array,b=new Uint8Array(a.buffer,a.byteOffset,a.byteLength);count+=a.length;for(const v of b)hash=Math.imul(hash^v,16777619)>>>0;}return {floatCount:count,checksum:hash};};
 new ResizeObserver(resize).observe(stage);resize();window.__ready=true;
 function tick(stamp){if(playing){if(last!==null)time=Math.min(duration,time+(stamp-last)/1000);last=stamp;render();if(time>=duration){pause();render();}}requestAnimationFrame(tick);}requestAnimationFrame(tick);
})();
