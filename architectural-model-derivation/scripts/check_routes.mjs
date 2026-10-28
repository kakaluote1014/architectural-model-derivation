#!/usr/bin/env node
// Sampled geometric review. This does not establish accessibility or egress compliance.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),T=require('../assets/web/vendor/three.min.js'),Activity=require('../assets/web/activity.js');
const args=process.argv.slice(2),opt={};for(let i=0;i<args.length;i+=2)opt[args[i].slice(2)]=args[i+1];
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),data=read(opt.model),config=read(opt.config),settings=config.routeChecks??{};
const objects=data.meshes.map(src=>{const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(src.positions,3));g.computeBoundingBox();const mesh=new T.Mesh(g,new T.MeshBasicMaterial({side:T.DoubleSide}));mesh.userData=src;mesh.updateMatrixWorld();return mesh;});
const supports=objects.filter(o=>(settings.supportKinds??['slab','walkway','stair','landscape','context','display-surface']).includes(o.userData.kind)),obstacles=objects.filter(o=>(settings.obstacleKinds??['wall','rail','window_detail']).includes(o.userData.kind));
const ray=new T.Raycaster(),down=new T.Vector3(0,-1,0),routes=[];
for(const route of config.routes??[]){let samples=0,unsupported=[],collisions=[],maxGap=0,maxSpeed=0,length=0;
 for(let i=1;i<route.waypoints.length;i++){const a=route.waypoints[i-1],b=route.waypoints[i],distance=Activity.distance(a.p,b.p);length+=distance;maxSpeed=Math.max(maxSpeed,distance/(b.t-a.t));const count=Math.max(1,Math.ceil(distance/.15));
  for(let j=0;j<=count;j++){const time=a.t+(b.t-a.t)*j/count,s=Activity.sample(route,time),p=new T.Vector3(...s.position);samples++;ray.set(p.clone().addScaledVector(new T.Vector3(0,1,0),.24),down);ray.far=.50;const ground=ray.intersectObjects(supports,false).find(h=>Math.abs(h.point.y-p.y)<=.23);
   if(!ground)unsupported.push({time,position:s.position});else maxGap=Math.max(maxGap,Math.abs(p.y-ground.point.y));
   if(j===count||distance<.001||a.action==='sit')continue;
   const next=Activity.sample(route,time+(b.t-a.t)/count).position,delta=new T.Vector3(next[0]-p.x,0,next[2]-p.z),step=delta.length();if(step<.0001)continue;delta.normalize();const side=new T.Vector3(-delta.z,0,delta.x);
   for(const lateral of [-.18,0,.18])for(const height of [.38,1.0,1.5]){ray.set(p.clone().addScaledVector(side,lateral).add(new T.Vector3(0,height,0)),delta);ray.near=.0005;ray.far=step+.02;const hit=ray.intersectObjects(obstacles,false)[0];if(hit)collisions.push({time,position:s.position,obstacle:hit.object.userData.name,hit:hit.point.toArray()});}
   ray.near=0;
  }
 }
 routes.push({id:route.id,name:route.name,evidence:route.evidence,status:route.status,lengthM:length,maxSpeedMps:maxSpeed,samples,maxSupportGapM:maxGap,unsupportedCount:unsupported.length,collisionCount:collisions.length,unsupported:unsupported.slice(0,12),collisions:collisions.slice(0,12),passed:!unsupported.length&&!collisions.length&&maxSpeed<=2});
}
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const report={source:{model:path.resolve(opt.model),modelSha256:hash(opt.model),config:path.resolve(opt.config),configSha256:hash(opt.config)},scope:'Sampled centerline/0.18m lateral clearance at 0.38/1.0/1.5m heights; support within 0.23m. Not continuous collision detection, limb contact, code compliance or native extraction.',sampleSpacingM:.15,routes,passed:routes.length>0&&routes.every(r=>r.passed)};
if(opt.out){fs.mkdirSync(path.dirname(opt.out),{recursive:true});fs.writeFileSync(opt.out,JSON.stringify(report,null,2));}console.log(JSON.stringify(report));if(!report.passed)process.exitCode=1;
