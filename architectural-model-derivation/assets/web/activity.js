/* Deterministic activity scheduling, shared by the browser and Node validation. */
(function(root){'use strict';
 const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
 const clamp=u=>Math.max(0,Math.min(1,u)),smooth=u=>u*u*(3-2*u),lerp=(a,b,u)=>a+(b-a)*u;
 function sample(route,time){const points=route.waypoints;let i=0;while(i<points.length-2&&time>=points[i+1].t)i++;
  const a=points[i],b=points[i+1],u=clamp((time-a.t)/(b.t-a.t)),length=distance(a.p,b.p),moving=length>.001&&a.action==='walk';
  const progress=moving?u:smooth(u),position=a.p.map((v,j)=>lerp(v,b.p[j],progress));
  let travelled=0;for(let j=1;j<=i;j++)travelled+=distance(points[j-1].p,points[j].p);travelled+=length*progress;
  let yaw=Number.isFinite(a.heading)?a.heading:Math.atan2(b.p[0]-a.p[0],b.p[2]-a.p[2]);
  if(moving&&i>0&&!Number.isFinite(a.heading)){const prev=points[i-1],previous=Math.atan2(a.p[0]-prev.p[0],a.p[2]-prev.p[2]);const delta=Math.atan2(Math.sin(yaw-previous),Math.cos(yaw-previous));yaw=previous+delta*smooth(clamp((time-a.t)/Math.min(.22,(b.t-a.t)*.4)));}
  const sit=lerp(a.pose==='sit'?1:0,b.pose==='sit'?1:0,smooth(u));
  const vertical=b.p[1]-a.p[1],action=sit>.95?'sit':sit>.01?'sit-transition':moving?(Math.abs(vertical)>.035?(vertical>0?'upstairs':'downstairs'):'walk'):(a.action==='talk'?'talk':'stand');
  return {visible:time>=route.start&&time<route.end,position,yaw,sit,action,moving,phase:travelled/(route.strideM??.72)*Math.PI*2,distance:travelled,segment:i,u:progress,label:a.label??route.name,speed:moving?length/(b.t-a.t):0};
 }
 const api={sample,distance};root.Activity=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
