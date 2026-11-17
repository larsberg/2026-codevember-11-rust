import { BoxGeometry,CatmullRomCurve3,CylinderGeometry,Group,LatheGeometry,Mesh,MeshStandardMaterial,PointLight,TorusGeometry,TubeGeometry,Vector2,Vector3 } from 'three';

// Reference task-lamp silhouette: weighted disc, paired lower links, elbow,
// slender upper link and a cylindrical laser head. Only the head pivots.
export function createLaserStands(scene,length,scale,materials) {
  const group=new Group();group.name='Single black task-lamp laser';scene.add(group);
  const geometries=[],up=new Vector3(0,1,0),coat=materials.pistons,hardware=materials.joints;
  function part(parent,geometry,material=coat) {geometries.push(geometry);const m=new Mesh(geometry,material);m.castShadow=m.receiveShadow=true;parent.add(m);return m;}
  const basePosition=new Vector3(length*.57,0,1.6*scale);
  const baseProfile=[[0,0],[.69,0],[.75,.018],[.76,.045],[.75,.075],[.7,.095],[0,.095]].map(([r,y])=>new Vector2(r*scale,y*scale));
  const base=part(group,new LatheGeometry(baseProfile,48));base.position.copy(basePosition);base.name='Weighted round lamp base';
  const lower=basePosition.clone().add(new Vector3(0,.6*scale,0));
  const elbow=basePosition.clone().add(new Vector3(.9*scale,2.15*scale,-.1*scale));
  const pivot=basePosition.clone().add(new Vector3(-.5*scale,3.6*scale,-.1*scale));
  function bar(a,b,width,depth=width) {
    const d=b.clone().sub(a),m=part(group,new BoxGeometry(width,d.length(),depth));
    m.position.copy(a).lerp(b,.5);m.quaternion.setFromUnitVectors(up,d.normalize());return m;
  }
  const post=part(group,new CylinderGeometry(.095*scale,.13*scale,.52*scale,16));post.position.copy(basePosition).add(new Vector3(0,.35*scale,0));
  const lowerAxis=elbow.clone().sub(lower).normalize(),spacing=new Vector3(lowerAxis.y,-lowerAxis.x,0).normalize().multiplyScalar(.16*scale);
  for(const sign of [-1,1])bar(lower.clone().addScaledVector(spacing,sign),elbow.clone().addScaledVector(spacing,sign),.085*scale,.09*scale);
  bar(elbow,pivot,.1*scale,.13*scale);
  for(const p of [lower,elbow,pivot]) {
    const hinge=part(group,new CylinderGeometry(.16*scale,.16*scale,.2*scale,20),hardware);hinge.rotation.x=Math.PI/2;hinge.position.copy(p);
    const pin=part(group,new CylinderGeometry(.055*scale,.055*scale,.225*scale,16),coat);pin.rotation.x=Math.PI/2;pin.position.copy(p);
  }
  for(const sign of [-1,1]) {
    const a=lower.clone().add(new Vector3(-.08*scale,.04*scale,sign*.1*scale)),b=lower.clone().lerp(elbow,.28).addScaledVector(spacing,-.8);
    const d=b.clone().sub(a),rotation=new Group();rotation.quaternion.setFromUnitVectors(up,d.clone().normalize());
    const points=Array.from({length:65},(_,i)=>{const t=i/64,angle=t*Math.PI*12;return new Vector3(Math.cos(angle)*.065*scale,t*d.length(),Math.sin(angle)*.065*scale).applyQuaternion(rotation.quaternion).add(a);});
    const spring=part(group,new TubeGeometry(new CatmullRomCurve3(points),64,.012*scale,5,false),hardware);spring.name='Balance spring';
  }
  const head=new Group();head.name='Laser 1';head.position.copy(pivot);head.scale.setScalar(scale);group.add(head);
  const optics=new Group();optics.name='Cylindrical laser head';head.add(optics);
  const shellProfile=[[1,-.8],[1,.34],[.94,.34],[.94,-.8],[1,-.8]].map(([r,y])=>new Vector2(r,y));
  const shell=part(optics,new LatheGeometry(shellProfile,48));shell.name='Cylindrical black housing';
  const back=part(optics,new CylinderGeometry(.94,.94,.035,48));back.position.y=.325;
  const lip=part(optics,new TorusGeometry(.97,.025,8,48));lip.rotation.x=Math.PI/2;lip.position.y=-.8;
  const emitterMaterial=new MeshStandardMaterial({color:'#101214',metalness:.2,roughness:.4,emissive:'#ff6b2a',emissiveIntensity:.12});
  const face=part(optics,new CylinderGeometry(.93,.93,.02,48),hardware);face.position.y=-.765;
  const emitter=part(optics,new CylinderGeometry(.095,.095,.025,24),emitterMaterial);emitter.position.y=-.782;
  const light=new PointLight('#ff9d37',0,2.5*scale,2);group.add(light);
  const station={pivot,head,optics,light,nozzle:new Vector3(),headRadius:0,
    setFanRadius(radius){this.headRadius=radius*.25;optics.scale.set(this.headRadius/scale,1,this.headRadius/scale);}};
  station.setFanRadius(.28*5*scale);
  return {group,stations:[station],basePosition,dispose(){scene.remove(group);for(const geometry of geometries)geometry.dispose();emitterMaterial.dispose();}};
}
