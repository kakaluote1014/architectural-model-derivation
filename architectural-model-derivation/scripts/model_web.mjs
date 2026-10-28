#!/usr/bin/env node
// Standard-library-only geometry inspector and offline page builder.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const asset=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../assets/web');
const args=process.argv.slice(2),command=args.shift(),opt={};
for(let i=0;i<args.length;i+=2){if(!args[i].startsWith('--')||!args[i+1])throw Error('Expected --key value');opt[args[i].slice(2)]=args[i+1];}
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const write=(p,d)=>fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n');
const vector=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
const keys=['explode','roof','traffic','functions','focus'];
function inspect(d){
 assert(Array.isArray(d.meshes)&&d.meshes.length,'No triangle meshes');
 const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]},groups={},materials=new Set();let triangles=0;
 for(const m of d.meshes){assert(Array.isArray(m.positions)&&m.positions.length>0&&m.positions.length%9===0,'positions must contain complete triangles');
  assert(vector(m.color)&&m.color.every(v=>v>=0&&v<=255),'color must be RGB 0..255');
  assert(m.alpha===undefined||(Number.isFinite(m.alpha)&&m.alpha>=0&&m.alpha<=1),'alpha must be 0..1');
  m.positions.forEach((v,i)=>{assert(Number.isFinite(v),'Non-finite vertex');let a=i%3;bounds.min[a]=Math.min(bounds.min[a],v);bounds.max[a]=Math.max(bounds.max[a],v);});
  triangles+=m.positions.length/9;let key=JSON.stringify([m.zone??null,m.level??null,m.kind??null]);groups[key]=(groups[key]||0)+m.positions.length/9;materials.add(JSON.stringify([m.color,m.alpha??1]));
 }
 assert(!d.triangles||d.triangles===triangles,'Declared triangle count mismatch');
 return {meshes:d.meshes.length,triangles,bounds,materials:materials.size,groups,coordinateSystem:d.coordinate_system??null,semanticStatus:'Input metadata only; inspect and confirm mappings.'};
}
function validate(c){
 assert(c.mode==='analysis','v0.1 implements analysis only');assert(typeof c.title==='string'&&c.title.trim(),'title required');
 assert(c.source?.scope&&c.source?.coordinateSystem,'source scope and coordinateSystem required');
 assert(Array.isArray(c.chapters)&&c.chapters.length>0,'chapters required');
 c.chapters.forEach((x,i)=>assert(Number.isFinite(x.t)&&x.t>=0&&(!i?x.t===0:x.t>c.chapters[i-1].t)&&x.title&&x.text&&x.evidence,'Each chapter requires increasing t, title, text, evidence; start at zero'));
 assert(Array.isArray(c.keyframes)&&c.keyframes.length>=2,'At least two keyframes required');
 c.keyframes.forEach((x,i)=>{assert(vector(x.eye)&&vector(x.target)&&x.eye.some((v,j)=>v!==x.target[j]),'Camera eye/target invalid');assert(Number.isFinite(x.t)&&(!i?x.t===0:x.t>c.keyframes[i-1].t),'Increasing camera times required');keys.forEach(k=>assert(Number.isFinite(x.state?.[k])&&x.state[k]>=0&&x.state[k]<=1,`Complete state required: ${k}`));});
 const end=c.keyframes.at(-1);assert(end.t>0&&end.t>=c.chapters.at(-1).t,'Invalid duration');assert(keys.every(k=>end.state[k]===0),'Final state must return all components');
 const ids=new Set(),levels=new Set();for(const f of c.floors??[]){assert(typeof f.id==='string'&&!ids.has(f.id)&&!levels.has(f.level),'Unique floor ids and levels required');ids.add(f.id);levels.add(f.level);assert(Number.isFinite(f.elevation)&&Number.isFinite(f.offset)&&f.label,'Floor label, elevation and offset required');}
 for(const s of c.spaces??[]){assert(vector(s.center)&&Array.isArray(s.size)&&s.size.length===2&&s.size.every(v=>Number.isFinite(v)&&v>0),'Space geometry invalid');assert(s.label&&s.scope&&s.evidence,'Space evidence and scope required');assert(!s.floorId||ids.has(s.floorId),'Unknown space floor');}
 for(const l of c.labels??[])assert(l.text&&vector(l.position)&&(!l.floorId||ids.has(l.floorId)),'Label invalid');
 const routeIds=new Set();for(const r of c.routes??[]){
  assert(typeof r.id==='string'&&!routeIds.has(r.id)&&r.name&&r.evidence&&r.status==='illustrative','Routes require unique id, name, evidence and status=illustrative');routeIds.add(r.id);
  assert(Number.isFinite(r.start)&&Number.isFinite(r.end)&&r.start>=0&&r.end>r.start&&r.end<=end.t,'Route interval outside timeline');
  assert(Array.isArray(r.waypoints)&&r.waypoints.length>=2,'Route needs at least two waypoints');
  assert(r.waypoints[0].t===r.start&&r.waypoints.at(-1).t===r.end,'Waypoints must cover route interval');
  r.waypoints.forEach((p,i)=>{assert(vector(p.p)&&Number.isFinite(p.t)&&(!i||p.t>r.waypoints[i-1].t),'Route requires finite positions and increasing times');assert(['walk','stand','sit','talk'].includes(p.action),'Unknown activity action');assert(['stand','sit'].includes(p.pose??'stand'),'Unknown actor pose');if(p.heading!==undefined)assert(Number.isFinite(p.heading),'Actor heading invalid');if(i){const a=r.waypoints[i-1],dist=Math.hypot(...p.p.map((v,j)=>v-a.p[j]));assert(dist/(p.t-a.t)<=2,'Route exceeds 2m/s; allocate realistic walking time');assert(dist<.001||a.action==='walk'||a.action==='sit','Stationary activity cannot travel');}});
  assert(r.actor?.heightM===undefined||(Number.isFinite(r.actor.heightM)&&r.actor.heightM>=.8&&r.actor.heightM<=2.2),'Actor height outside supported display range');
  assert(r.strideM===undefined||(Number.isFinite(r.strideM)&&r.strideM>0),'Stride must be positive');
 }
}
function makeConfig(d,stats){
 const center=stats.bounds.min.map((v,i)=>(v+stats.bounds.max[i])/2),span=Math.max(...stats.bounds.max.map((v,i)=>v-stats.bounds.min[i]),1),eye=center.map((v,i)=>v+span*[1,.9,1.4][i]);
 const state=Object.fromEntries(keys.map(k=>[k,0]));
 return {title:'建筑空间观察',mode:'analysis',source:{scope:'既有三角网格；来源身份待核对',coordinateSystem:d.coordinate_system||'metres, Y up; caller must confirm'},chapters:[{t:0,title:'整体观察',text:'观察现有几何的构成与关系。对象名称与功能待核对。',evidence:'输入网格，不推断设计历史'}],keyframes:[{t:0,eye,target:center,state},{t:3,eye,target:center,state},{t:9,eye:[center[0]-span,eye[1],eye[2]],target:center,state},{t:12,eye:[center[0]-span,eye[1],eye[2]],target:center,state}]};
}
function build(d,c,stats){
 validate(c);assert(opt.out,'--out required');const output=path.resolve(opt.out);assert(!fs.existsSync(output),'Output already exists; choose a new directory');
 const sourceFiles=(c.sourceFiles??[]).map(p=>path.resolve(path.dirname(path.resolve(opt.config)),p));
 const inputs=[path.resolve(opt.model),path.resolve(opt.config),...sourceFiles];const before=inputs.map(p=>({path:p,sha256:hash(p)}));
 if(c.focusZones?.length)assert(d.meshes.some(m=>c.focusZones.includes(m.zone)),'focusZones matches no meshes');
 for(const f of c.floors??[])assert(d.meshes.some(m=>(!c.focusZones?.length||c.focusZones.includes(m.zone))&&m.level===f.level),`Unmatched floor ${f.id}`);
 let maxError=0;
 const packed=d.meshes.map((m,index)=>{const buffer=Buffer.alloc(m.positions.length*4);m.positions.forEach((v,i)=>{buffer.writeFloatLE(v,i*4);maxError=Math.max(maxError,Math.abs(v-buffer.readFloatLE(i*4)));});return {...Object.fromEntries(Object.entries(m).filter(([k])=>k!=='positions')),id:index,positions_b64:buffer.toString('base64'),triangles:m.positions.length/9};});
 assert(maxError<=.001,`Float32 error ${maxError}m exceeds 1mm; rebase coordinates upstream`);
 const payload={config:c,meshes:packed,triangles:stats.triangles,bounds:stats.bounds,maxCoordinateErrorM:maxError};
 fs.mkdirSync(path.join(output,'dist/vendor'),{recursive:true});
 for(const file of ['index.html','app.js','activity.js','people.js','style.css','vendor/three.min.js','vendor/three.LICENSE.txt'])fs.copyFileSync(path.join(asset,file),path.join(output,'dist',file));
 const serialized=JSON.stringify(payload).replace(/</g,'\\u003c');
 fs.writeFileSync(path.join(output,'dist/model-data.js'),'window.MODEL_DATA='+serialized+';\n');
 const license=fs.readFileSync(path.join(asset,'vendor/three.LICENSE.txt'),'utf8');
 const notices='Three.js 0.160.1 — MIT\n'+license+'\nNo motion.js or AI speech is included. Project geometry is not licensed by the Three.js license.\n';
 fs.writeFileSync(path.join(output,'THIRD_PARTY_NOTICES.txt'),notices);
 let html=fs.readFileSync(path.join(asset,'index.html'),'utf8');
 html=html.replace('<link rel="stylesheet" href="style.css">',()=>'<style>'+fs.readFileSync(path.join(asset,'style.css'),'utf8')+'</style>');
 html=html.replace(/<script src="([^"]+)"><\/script>/g,(_,p)=>'<script>'+fs.readFileSync(path.join(output,'dist',p),'utf8').replace(/<\/script/gi,'<\\/script')+'</script>');
 html=html.replace('</body>',()=>'<pre hidden id="third-party-notices">'+notices.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</pre></body>');
 fs.writeFileSync(path.join(output,'index.html'),html);
 fs.writeFileSync(path.join(output,'shot-script.md'),`# ${c.title}\n\n模式：模型解析；阅读顺序不代表真实设计历史。\n来源：${c.source.scope}\n\n`+c.chapters.map((x,i)=>`## ${x.t}–${c.chapters[i+1]?.t??c.keyframes.at(-1).t}s ${x.title}\n\n${x.text}\n\n依据：${x.evidence}\n`).join('\n'));
 const after=before.map(x=>({...x,sha256After:hash(x.path),unchanged:hash(x.path)===x.sha256}));
 const provenance={version:'0.1.1',mode:'analysis',inputType:'existing_triangle_export',nativeExtractionVerified:false,activityPolicy:'Authored illustrative scenarios; not observed behavior or crowd simulation; spatial checks separately required',routeCount:c.routes?.length??0,source:c.source,meshSourcePath:d.source_path??null,sourceCoordinateSystem:d.coordinate_system??null,originMm:d.origin_mm??c.source.originMm??null,stats,maxCoordinateErrorM:maxError,geometryPolicy:'same triangle sequence and coordinates; float32 only; no topology edits; animation separate',inputs:after,allInputsUnchanged:after.every(x=>x.unchanged)};
 write(path.join(output,'provenance.json'),provenance);assert(provenance.allInputsUnchanged,'Input changed during build');
 console.log(JSON.stringify({output,triangles:stats.triangles,meshes:stats.meshes,maxCoordinateErrorM:maxError,protectedInputs:after.length}));
}
try{
 assert(opt.model,'--model required');const data=read(opt.model),stats=inspect(data);
 if(command==='inspect')console.log(JSON.stringify(stats,null,2));
 else if(command==='init'){assert(opt.config&&!fs.existsSync(opt.config),'--config must name a new file');write(opt.config,makeConfig(data,stats));console.log(path.resolve(opt.config));}
 else if(command==='build'){assert(opt.config,'--config required');build(data,read(opt.config),stats);}
 else throw Error('Commands: inspect | init | build');
}catch(e){console.error(e.message);process.exitCode=1;}
