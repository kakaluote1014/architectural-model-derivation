/* Small procedural human, authored here; no external model or animation assets. */
(function(){'use strict';
 window.createActivityHuman=function(scene,route){
  const root=new THREE.Group(),color=route.actor?.color??'#b87938',cloth=new THREE.MeshStandardMaterial({color,roughness:.9}),skin=new THREE.MeshStandardMaterial({color:'#ccb491',roughness:.9}),shoe=new THREE.MeshStandardMaterial({color:'#45534c',roughness:.95});
  const part=(geometry,material)=>{const m=new THREE.Mesh(geometry,material);root.add(m);return m;};
  const head=part(new THREE.SphereGeometry(.125,12,10),skin),torso=part(new THREE.CapsuleGeometry(.155,.34,4,10),cloth),pelvis=part(new THREE.SphereGeometry(.15,10,8),cloth);pelvis.scale.set(1,.75,.8);
  const segment=(radius,material)=>part(new THREE.CylinderGeometry(radius,radius,1,7),material);
  const legs=[-1,1].map(side=>({side,upper:segment(.07,cloth),lower:segment(.055,cloth),foot:part(new THREE.BoxGeometry(.12,.07,.24),shoe)}));
  const arms=[-1,1].map(side=>({side,upper:segment(.045,cloth),lower:segment(.035,skin)}));
  const up=new THREE.Vector3(0,1,0),unit=(a,b,mesh)=>{const v=b.clone().sub(a);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.scale.y=v.length();mesh.quaternion.setFromUnitVectors(up,v.normalize());};
  const ring=part(new THREE.RingGeometry(.22,.27,28),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.65,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.012;
  root.scale.setScalar((route.actor?.heightM??1.7)/1.7);scene.add(root);
  let contacts=[];
  function pose(sample,groundHeight){const sit=sample.sit,walk=sample.moving?1:0,phase=sample.phase,bob=walk*.012*Math.sin(phase*2),hipY=.89-.43*sit+bob;contacts=[];
   torso.position.set(0,hipY+.29,0);torso.rotation.x=-sit*.08;head.position.set(0,hipY+.67,.015);pelvis.position.set(0,hipY,0);
   for(const l of legs){const p=phase+(l.side===1?Math.PI:0),swing=Math.sin(p)*walk*(1-sit),hip=new THREE.Vector3(l.side*.10,hipY,0),ankle=new THREE.Vector3(l.side*.10,.07+Math.max(0,swing)*.10,swing*.23+sit*.40),scale=root.scale.x;
    const footWorld=[sample.position[0]+scale*(ankle.x*Math.cos(sample.yaw)+ankle.z*Math.sin(sample.yaw)),sample.position[1],sample.position[2]+scale*(ankle.z*Math.cos(sample.yaw)-ankle.x*Math.sin(sample.yaw))];const ground=groundHeight?.(footWorld);if(Number.isFinite(ground))ankle.y=(ground-sample.position[1])/scale+.07+Math.max(0,swing)*.10;contacts.push({supportKnown:Number.isFinite(ground),soleGapM:Math.max(0,swing)*.10*scale});
    const d=ankle.clone().sub(hip),mid=hip.clone().add(ankle).multiplyScalar(.5),bend=Math.sqrt(Math.max(.0005,.44*.44-d.lengthSq()/4));const forward=new THREE.Vector3(0,d.z,-d.y).normalize();const knee=mid.addScaledVector(forward,bend);unit(hip,knee,l.upper);unit(knee,ankle,l.lower);l.foot.position.copy(ankle).add(new THREE.Vector3(0,-.035,.045));
   }
   for(const a of arms){const swing=Math.sin(phase+(a.side===1?0:Math.PI))*walk*.18,talk=sample.action==='talk'?Math.sin(sample.distance+sample.u*3)*.08:0,shoulder=new THREE.Vector3(a.side*.20,hipY+.45,0),elbow=new THREE.Vector3(a.side*.23,hipY+.19,swing+sit*.18+talk),wrist=new THREE.Vector3(a.side*.12,hipY-.02+sit*.13,swing+sit*.37+talk);unit(shoulder,elbow,a.upper);unit(elbow,wrist,a.lower);}
   root.position.fromArray(sample.position);root.rotation.y=sample.yaw;root.updateMatrixWorld();
  }
  return {root,pose,contacts:()=>contacts,signature:()=>root.children.map(m=>[...m.position.toArray(),...m.quaternion.toArray(),...m.scale.toArray()])};
 };
})();
