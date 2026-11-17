import { Bone, Float32BufferAttribute, Object3D, Quaternion, Skeleton, Uint16BufferAttribute, Vector3 } from 'three';
import { createPhysics,PHYSICS_STEP } from './physics.js';
import { createRustTubeGeometry,createTubeWallBoxes,TUBE_PROFILE } from './tube-geometry.js';
export { initPhysics } from './physics.js';

// Five-hull/spherical-joint skinning from 10-caustic's October 29 rig,
// fitted here to seven longitudinal hollow tube sections and a Three.js Skeleton.
export class RustSimulation {
  constructor(settings) {
    this.settings=settings;this.floor=0;this.time=0;this.object=new Object3D();
    this.profile=TUBE_PROFILE;this.radius=TUBE_PROFILE.height/2;this.length=settings.rust.size;this.scale=this.length/7;
    this.object.position.y=this.radius+.025;
    this.geometry=createRustTubeGeometry(this.length);
    this.sparkEntries=[];this.recoilImpulses=0;this.rig=[];
    this.audioLanding={speed:0,point:new Vector3()};
    this.reaction={index:3,targetIndex:3,energy:0,lastStrike:-Infinity,normal:new Vector3(0,0,1)};
    this.physics=createPhysics(settings.physics);
    this.ground=this.physics.addBody({body:{type:'static',position:{x:0,y:-this.scale,z:0}},shapes:[{type:'box',halfExtents:{x:1000,y:this.scale,z:1000},enableHitEvents:true}]});
    this.restCenters=Array.from({length:7},(_,i)=>((i+.5)/7-.5)*this.length);
    const step=this.restCenters[1]-this.restCenters[0],p=this.geometry.attributes.position;
    for(let i=0;i<7;i++) {
      const x=this.restCenters[i],shapes=createTubeWallBoxes(step);
      for(const shape of shapes)shape.density=settings.physics.mass;
      const entry=this.physics.addBody({body:{type:'dynamic',position:{x,y:this.object.position.y,z:0},linearDamping:.35,angularDamping:1.5},shapes});
      const bone=new Bone();bone.name=`Tube bone ${i+1}`;bone.position.x=x;
      this.rig.push({...entry,bone,restX:x});
    }
    this.bones=this.rig.map(entry=>entry.bone);this.skeleton=new Skeleton(this.bones);
    for(let i=1;i<7;i++) {
      const a=this.rig[i-1],b=this.rig[i],anchor=new Vector3((a.restX+b.restX)/2,this.object.position.y,0);
      const frame=entry=>({position:entry.body.getLocalPoint(anchor),rotation:{x:0,y:0,z:0,w:1}});
      this.physics.addSphericalJoint(a,b,{localFrameA:frame(a),localFrameB:frame(b),collideConnected:false,
        enableSpring:true,hertz:1.4,dampingRatio:.75,enableConeLimit:true,coneAngle:Math.PI*.42,
        enableTwistLimit:true,lowerTwistAngle:-Math.PI/3,upperTwistAngle:Math.PI/3});
    }
    const indices=[],weights=[];
    for(let v=0;v<p.count;v++) {
      const [a,b,t]=this.influences(p.getX(v));indices.push(a,b,0,0);weights.push(1-t,t,0,0);
    }
    this.geometry.setAttribute('skinIndex',new Uint16BufferAttribute(indices,4));
    this.geometry.setAttribute('skinWeight',new Float32BufferAttribute(weights,4));
    this.entry=this.rig[3];this.position=new Float64Array(48);
    const floorId=this.ground.shapes[0].getUserData(),rigIds=new Set(this.rig.flatMap(entry=>entry.shapes.map(shape=>shape.getUserData())));
    this.physics.onAfterStep(()=>{
      for(const event of this.physics.world.getContactEvents().hit) {
        const rigContact=(event.shapeUserDataA===floorId&&rigIds.has(event.shapeUserDataB))||(event.shapeUserDataB===floorId&&rigIds.has(event.shapeUserDataA));
        if(rigContact&&event.approachSpeed>this.audioLanding.speed){this.audioLanding.speed=event.approachSpeed;this.audioLanding.point.copy(event.point);}
      }
    });
    this.physics.onBeforeStep(()=>this.drive());this.configure(settings);this.sync();
  }
  influences(x) {
    const u=Math.max(0,Math.min(6,(x-this.restCenters[0])/(this.restCenters[1]-this.restCenters[0])));
    const a=Math.min(5,Math.floor(u)),t=u-a;
    return [a,a+1,t*t*(3-2*t)];
  }
  bind(mesh) {
    for(const bone of this.bones)mesh.add(bone);
    mesh.updateMatrixWorld(true);mesh.bind(this.skeleton);this.sync();
  }
  rotationAt(x) {
    const [a,b,t]=this.influences(x);
    return new Quaternion().copy(this.rig[a].body.getRotation()).slerp(new Quaternion().copy(this.rig[b].body.getRotation()),t);
  }
  deformPoint(rest) {
    const [a,b,t]=this.influences(rest.x),point=new Vector3();
    for(const [index,weight] of [[a,1-t],[b,t]]) {
      const entry=this.rig[index],p=rest.clone().sub(new Vector3(entry.restX,0,0)).applyQuaternion(new Quaternion().copy(entry.body.getRotation())).add(new Vector3().copy(entry.body.getPosition()));
      point.addScaledVector(p,weight);
    }
    return point;
  }
  drive() {
    const center=new Vector3(),velocity=new Vector3();
    for(const entry of this.rig){center.add(new Vector3().copy(entry.body.getPosition()));velocity.add(new Vector3().copy(entry.body.getLinearVelocity()));}
    center.divideScalar(this.rig.length);velocity.divideScalar(this.rig.length);
    const distance=Math.hypot(center.x,center.z),attraction=this.settings.physics.originAttraction??.8;
    const rate=attraction*Math.max(1,this.settings.physics.gravity/9.8);
    // A bounded friction allowance keeps a dropped tube from sticking far from
    // home; shared velocity damping avoids circling and spring overshoot.
    const friction=this.settings.physics.friction*this.settings.physics.gravity;
    const near=Math.min(1,distance/Math.max(1,this.scale*.6));
    const pull=Math.min(Math.max(9.8,this.settings.physics.gravity)*Math.max(1.4,this.settings.physics.friction*1.25),distance*rate+friction*1.15*near)*Math.min(1,attraction/.8);
    const damping=2*Math.sqrt(rate),returnForce=new Vector3();
    if(!this.drag&&distance>1e-6&&attraction>0)returnForce.set(-center.x/distance*pull-velocity.x*damping,0,-center.z/distance*pull-velocity.z*damping);
    const reaction=this.reaction;
    if(this.time-reaction.lastStrike>.06)reaction.energy*=Math.exp(-PHYSICS_STEP*2.5);
    reaction.index+=(reaction.targetIndex-reaction.index)*(1-Math.exp(-PHYSICS_STEP*12));
    const reference=this.rig[Math.round(reaction.index)].body;
    const tangent=new Vector3(1,0,0).applyQuaternion(new Quaternion().copy(reference.getRotation())).normalize();
    const lift=reaction.normal.clone().multiplyScalar(.55).add(new Vector3(0,1,0)).normalize();
    const curlAxis=new Vector3().crossVectors(tangent,lift).normalize();
    for(const [i,entry] of this.rig.entries()) {
      const mass=entry.body.getMass();
      entry.body.applyForceToCenter(returnForce.clone().multiplyScalar(mass),true);
      // Traveling bending torques act through the joint limits and contacts.
      // As in the source rig, all animated poses come from Box3D.
      const lever=(this.restCenters[1]-this.restCenters[0]),strength=mass*this.settings.physics.gravity*lever*1.1;
      const idle=(1-reaction.energy*.7)*(this.drag ? .15 : 1);
      const torque=new Vector3(0,strength*.8*Math.sin(this.time*1.25-i*.85)*idle,strength*Math.sin(this.time*1.55-i*.9)*idle);
      if(reaction.energy>.001) {
        const distance=i-reaction.index,desired=Math.sign(distance)*Math.min(Math.PI*.68,Math.abs(distance)*.65)*reaction.energy;
        const actual=new Vector3(1,0,0).applyQuaternion(new Quaternion().copy(entry.body.getRotation()));
        const angle=Math.atan2(curlAxis.dot(new Vector3().crossVectors(tangent,actual)),tangent.dot(actual));
        const angularSpeed=new Vector3().copy(entry.body.getAngularVelocity()).dot(curlAxis);
        const inertia=mass*(lever*lever+this.profile.width**2)/12;
        const amount=Math.max(-strength*4,Math.min(strength*4,inertia*((desired-angle)*65-angularSpeed*13)));
        torque.addScaledVector(curlAxis,amount);
        const heat=Math.exp(-distance*distance/3);
        entry.body.applyForceToCenter({x:0,y:mass*this.settings.physics.gravity*heat*reaction.energy*1.5,z:0},true);
      }
      entry.body.applyTorque(torque,true);
    }
  }
  configure(settings) {
    this.settings=settings;this.physics.configure(settings.physics);
    for(const entry of this.rig) {
      entry.body.setLinearDamping(settings.physics.damping);entry.body.setAngularDamping(1.5);
      for(const shape of entry.shapes)shape.setDensity(settings.physics.mass,false);entry.body.applyMassFromShapes();
    }
    if(this.drag)this.drag.joint.joint.setMaxSpringForce(this.grabForce());
  }
  grabForce() {return this.rig.reduce((sum,entry)=>sum+entry.body.getMass(),0)*Math.max(9.8,this.settings.physics.gravity)*20;}
  get dragging() {return !!this.drag;}
  beginDrag(index,point) {
    this.endDrag();const entry=this.rig[index];if(!entry)return false;
    const cursor=this.physics.addBody({body:{type:'static',position:point}});
    const joint=this.physics.addMotorJoint(cursor,entry,{localFrameB:{position:entry.body.getLocalPoint(point)},
      linearHertz:4,linearDampingRatio:.9,maxSpringForce:this.grabForce(),
      maxSpringTorque:0,maxVelocityForce:0,maxVelocityTorque:0,collideConnected:false});
    this.drag={cursor,joint};for(const entry of this.rig)entry.body.setAwake(true);return true;
  }
  moveDrag(point) {this.drag?.cursor.body.setTransform(point,{x:0,y:0,z:0,w:1});}
  endDrag() {
    if(!this.drag)return;
    this.physics.removeJoint(this.drag.joint);this.physics.removeBody(this.drag.cursor);this.drag=undefined;
    for(const entry of this.rig)entry.body.setAwake(true);
  }
  laserStrike(point,normal,dt,power) {
    if(!(dt>0))return;
    const closest=[...this.rig].sort((a,b)=>new Vector3().copy(a.body.getPosition()).distanceToSquared(point)-new Vector3().copy(b.body.getPosition()).distanceToSquared(point))[0];
    const reaction=this.reaction;reaction.targetIndex=this.rig.indexOf(closest);
    reaction.energy=Math.min(1,reaction.energy+dt*power*6);reaction.lastStrike=this.time;reaction.normal.copy(normal);
    const mass=closest.body.getMass(),pulse=.4+.6*Math.sin(this.time*53)**2;
    const impulse=new Vector3().copy(normal).multiplyScalar(-mass*dt*power*this.scale*2.2*pulse);
    impulse.y+=mass*dt*this.scale*.8;
    closest.body.applyLinearImpulse(impulse,point,true);this.recoilImpulses++;
  }
  spawnSpark(index,point,velocity) {
    let entry=this.sparkEntries[index];
    if(!entry)entry=this.sparkEntries[index]=this.physics.addBody({body:{type:'dynamic',position:point,linearDamping:.2},
      shapes:[{type:'sphere',radius:.012*this.scale,density:.00005,restitution:.1,filter:{groupIndex:-32}}]});
    entry.body.setTransform(point,{x:0,y:0,z:0,w:1});entry.body.setLinearVelocity(velocity);entry.body.setAwake(true);
  }
  retireSpark(index) {const entry=this.sparkEntries[index];if(entry)this.physics.removeBody(entry);this.sparkEntries[index]=null;}
  takeAudioLanding() {const event={speed:this.audioLanding.speed,point:this.audioLanding.point.clone()};this.audioLanding.speed=0;return event;}
  sync() {
    this.revision=(this.revision??0)+1;this.center??=new Vector3();this.center.set(0,0,0);
    for(const entry of this.rig) {
      const p=entry.body.getPosition();entry.bone.position.copy(p).sub(this.object.position);entry.bone.quaternion.copy(entry.body.getRotation());
      entry.bone.updateMatrixWorld(true);this.center.add(new Vector3().copy(p));
    }
    this.center.divideScalar(this.rig.length);this.skeleton.update();
    for(let i=0;i<16;i++)this.position.set(this.rig[i%7].body.getPosition()?new Vector3().copy(this.rig[i%7].body.getPosition()).toArray():[0,0,0],i*3);
  }
  update(dt) {this.time+=dt;this.physics.step(dt);this.sync();}
  getCenter(target) {return target.copy(this.center);}
  get stats() {return {bodies:this.physics.entries.length,colliders:this.rig.reduce((sum,entry)=>sum+entry.shapes.length,0),bones:this.bones.length,joints:this.physics.joints.length,dragging:this.dragging,physicsEngine:'Box3D',time:this.time,recoilImpulses:this.recoilImpulses};}
  dispose() {this.endDrag();this.physics.dispose();this.skeleton.dispose();this.geometry.dispose();}
}
