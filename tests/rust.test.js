import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Vector3, Raycaster, Mesh, MeshBasicMaterial } from 'three';
import { createRustGeometry, RustMask, MASK_WIDTH, MASK_HEIGHT, TILE } from '../src/rust-mask.js';
import { defaultSetup, validateSetup } from '../src/settings.js';
import { initPhysics, RustSimulation } from '../src/rust-simulation.js';
import { createRustView } from '../src/rust-view.js';

test('atlas isolates opposite faces and UV ray hits clean only the hit surface', () => {
  const geometry=createRustGeometry(5,.24), mask=new RustMask(geometry,1);
  const mesh=new Mesh(geometry,new MeshBasicMaterial());mesh.updateMatrixWorld();
  const front=new Raycaster(new Vector3(0,0,8),new Vector3(0,0,-1)).intersectObject(mesh)[0];
  const back=new Raycaster(new Vector3(0,0,-8),new Vector3(0,0,1)).intersectObject(mesh)[0];
  assert.ok(front.uv.distanceTo(back.uv)>.2);
  const hit={localPoint:front.point,localNormal:front.face.normal};
  mask.step(.5,0,hit,.4,4);
  assert.equal(mask.valueAt(front.uv),0);assert.equal(mask.valueAt(back.uv),1);
  mask.step(2,.1,null,.4,4);assert.ok(Math.abs(mask.valueAt(front.uv)-.2)<1e-5);
  assert.equal(mask.data.length,MASK_WIDTH*MASK_HEIGHT*4);
  mask.dispose();geometry.dispose();mesh.material.dispose();
});

test('a brush crossing a chamfer seam cleans both adjacent atlas islands', () => {
  const geometry=createRustGeometry(5,.24),mask=new RustMask(geometry,1);
  const center=new Vector3(2.26+.24/Math.sqrt(2),0,2.26+.24/Math.sqrt(2));
  mask.step(.5,0,{localPoint:center,localNormal:new Vector3(1,0,1).normalize()},.42,4);
  const faces=new Set();
  for(let i=0;i<mask.amount.length;i++) if(mask.valid[i]&&mask.amount[i]<.1) {
    faces.add(Math.floor((i%MASK_WIDTH)/TILE)+3*Math.floor(Math.floor(i/MASK_WIDTH)/TILE));
  }
  assert.ok(faces.size>=2,`cleaned ${faces.size} island(s)`);
  mask.dispose();geometry.dispose();
});

test('shared setup survives a subject rebuild, material and environment edits apply live', async () => {
  await initPhysics();const settings=defaultSetup();settings.lighting.environment.intensity=1.7;
  settings.materials.panels.roughness=.11;settings.materials.struts.color='#b35a22';settings.drafting.ink=false;
  for(let i=0;i<2;i++) {
    const sim=new RustSimulation(settings),scene=new Scene(),view=createRustView(scene,sim);
    view.configure(settings);assert.equal(view.materials.panels.roughness,.11);
    assert.equal(view.materials.panels.envMapIntensity,1.7);
    assert.equal(view.materials.struts.color.getHexString(),'b35a22');
    for(let j=0;j<120;j++)sim.update(1/60);
    assert.ok(sim.center.y>0 && sim.center.y<settings.rust.chamfer*3);
    assert.ok(sim.entry.body.getMass()>0);assert.equal(sim.stats.physicsEngine,'Box3D');
    view.dispose();sim.dispose();settings.rust.size=80;
  }
});

test('legacy saves acquire Rust defaults while retaining shared edits; invalid mask controls reject', () => {
  const legacy={version:17,studio:{background:'#eeeecc',exposure:1.2},camera:{yaw:45},audio:{enabled:false},fold:{sections:10}};
  const setup=validateSetup(legacy);
  assert.equal(setup.rust.size,70);assert.equal(setup.studio.background,'#eeeecc');assert.equal(setup.camera.yaw,45);assert.equal(setup.audio.enabled,false);
  assert.deepEqual(validateSetup(JSON.parse(JSON.stringify(setup))),setup);
  assert.throws(()=>validateSetup({...setup,rust:{...setup.rust,power:NaN}}));
  assert.equal(defaultSetup().studio.exposure,.9);
});


test('automatic gun sweeps real surface UVs and emits visible laser lines and spark trails', async () => {
  await initPhysics();const settings=defaultSetup(),sim=new RustSimulation(settings),view=createRustView(new Scene(),sim);
  view.configure(settings);view.update(null);
  const first=view.automaticTarget(0),next=view.automaticTarget(2);
  assert.ok(first?.uv && next?.uv);assert.ok(first.uv.distanceTo(next.uv)>.02);
  view.setTarget(first,true);view.update(null,.1,true);
  assert.ok(view.mask.cleaned>0);assert.equal(view.group.getObjectByName('Laser scan lines').visible,true);
  assert.equal(view.group.getObjectByName('Flat laser fan').visible,true);
  const lines=view.group.getObjectByName('Laser scan lines').geometry.attributes.position.array;
  assert.ok(lines.some(v=>Math.abs(v)>.1));
  view.setTarget(null,false);view.update(null,0,false);
  assert.equal(view.group.getObjectByName('Laser scan lines').visible,false);
  assert.equal(settings.rust.growth,.036);assert.equal(settings.bloom.enabled,true);
  view.dispose();sim.dispose();
});


test('the flat fan cleans a wide strip while leaving metal above and below untouched', () => {
  const geometry=createRustGeometry(5,.24),mask=new RustMask(geometry,1);
  const mesh=new Mesh(geometry,new MeshBasicMaterial());mesh.updateMatrixWorld();
  const sample=(x,y)=>new Raycaster(new Vector3(x,y,8),new Vector3(0,0,-1)).intersectObject(mesh)[0];
  const center=sample(0,0),side=sample(1,0),above=sample(0,.4);
  mask.step(.5,0,{localPoint:center.point,localNormal:center.face.normal,fanTangent:new Vector3(1,0,0),fanHalfWidth:1.4},.084,4);
  assert.equal(mask.valueAt(center.uv),0);assert.equal(mask.valueAt(side.uv),0);assert.equal(mask.valueAt(above.uv),1);
  mask.dispose();geometry.dispose();mesh.material.dispose();
});

test('fan rotates across the surface trajectory and clips every emitted ray to a real hit', async () => {
  await initPhysics();const settings=defaultSetup();settings.rust.radius=.8;
  const sim=new RustSimulation(settings),view=createRustView(new Scene(),sim);
  view.configure(settings);view.update(null);
  const axes=[];let clipped=false;
  for(const time of [0,2,5,9,14]) {
    const hit=view.automaticTarget(time);assert.ok(hit);
    view.setTarget(hit,true);view.update(null,0,true);
    const travel=hit.travelDirection.clone().addScaledVector(hit.localNormal,-hit.travelDirection.dot(hit.localNormal)).normalize();
    assert.ok(Math.abs(travel.dot(hit.fanTangent))<1e-8);
    axes.push(hit.fanTangent.clone());
    const lines=view.group.getObjectByName('Laser scan lines').geometry;
    const data=lines.attributes.position;clipped ||= lines.drawRange.count<50;
    for(let i=0;i<lines.drawRange.count;i+=2) {
      const start=new Vector3().fromBufferAttribute(data,i),end=new Vector3().fromBufferAttribute(data,i+1);
      const impact=new Raycaster(start,end.clone().sub(start).normalize()).intersectObject(view.cube)[0];
      assert.ok(impact,'no ray may terminate in empty space');
      assert.ok(impact.point.distanceTo(end)<.01,'ray stops at the first surface');
    }
  }
  assert.ok(clipped,'oversized fan discards rays outside the cube');
  assert.ok(axes.some(axis=>Math.abs(axis.dot(axes[0]))<.95),'fan changes orientation during turns');
  view.dispose();sim.dispose();
});

test('seven physics bones bend the skin, recoil locally and return together toward the origin',async()=>{
 await initPhysics();const settings=defaultSetup(),sim=new RustSimulation(settings),view=createRustView(new Scene(),sim);
 assert.equal(sim.rig.length,7);assert.equal(sim.physics.joints.length,6);assert.equal(view.cube.isSkinnedMesh,true);
 assert.ok(sim.geometry.attributes.skinIndex && sim.geometry.attributes.skinWeight);
 const vertex=sim.geometry.attributes.position.count/2|0,rest=view.cube.getVertexPosition(vertex,new Vector3()).clone();
 for(let i=0;i<180;i++)sim.update(1/60);
 view.update(null);
 assert.ok(view.cube.getVertexPosition(vertex,new Vector3()).distanceTo(rest)>.1);
 assert.ok(sim.bones.some(b=>b.quaternion.angleTo(sim.bones[0].quaternion)>.03));
 const target=sim.rig[3],point=new Vector3().copy(target.body.getPosition()).add(new Vector3(0,0,sim.radius));
 const before=target.body.getLinearVelocity().z;sim.laserStrike(point,new Vector3(0,0,1),1/30,4);
 assert.ok(target.body.getLinearVelocity().z<before-.01);assert.equal(sim.recoilImpulses,1);
 for(const r of sim.rig){const p=r.body.getPosition();r.body.setTransform({x:p.x+50,y:p.y,z:p.z},r.body.getRotation());r.body.setLinearVelocity({x:0,y:0,z:0});}
 sim.sync();const offset=sim.center.x;
 for(let i=0;i<240;i++)sim.update(1/60);
 assert.ok(Math.abs(sim.center.x)<Math.abs(offset)*.9);
 view.dispose();sim.dispose();
});

test('spark bodies fall onto the floor and leave persistent dust while the noisy fan animates',async()=>{
 await initPhysics();const sim=new RustSimulation(defaultSetup()),view=createRustView(new Scene(),sim);
 view.configure(sim.settings);view.update(null);view.setTarget(view.automaticTarget(0),true);view.update(null,.02,true);
 const first=Array.from(view.group.getObjectByName('Laser scan lines').geometry.attributes.position.array);
 sim.update(1/60);view.update(null,0,true);
 const next=Array.from(view.group.getObjectByName('Laser scan lines').geometry.attributes.position.array);
 assert.ok(next.some((v,i)=>Math.abs(v-first[i])>1e-4));
 view.setTarget(null,false);
 for(let i=0;i<240;i++){sim.update(1/60);view.update(null,1/60,true);}
 assert.ok(view.diagnostics.dust>0);
 const points=view.group.getObjectByName('Settled rust dust').geometry.attributes.position;
 assert.ok(Math.abs(points.getY(0)-sim.floor-.016*sim.scale)<1e-6);
 view.dispose();sim.dispose();
});


test('v1 capsule settings migrate to ten times the size once, preserving mute and studio edits',()=>{
 const old={...defaultSetup(),version:1,rust:{...defaultSetup().rust,size:7,chamfer:.65},camera:{...defaultSetup().camera,distance:15},physics:{...defaultSetup().physics,gravity:9.8}};
 old.lighting.spotlight={...old.lighting.spotlight,intensity:850,offsetX:-3,height:8,offsetZ:5};old.audio.enabled=false;
 const next=validateSetup(old);assert.equal(next.rust.size,70);assert.equal(next.rust.chamfer,6.5);assert.equal(next.camera.distance,120);
 assert.equal(next.audio.enabled,false);assert.deepEqual(validateSetup(next),next);
});

test('sustained laser contact curls the tube around the strike and the reaction decays on release',async()=>{
 await initPhysics();const sim=new RustSimulation(defaultSetup());
 const span=sim.restCenters.at(-1)-sim.restCenters[0];
 for(let i=0;i<240;i++) {
  sim.update(1/60);
  sim.laserStrike(new Vector3().copy(sim.rig[3].body.getPosition()).add(new Vector3(0,0,6.5)),new Vector3(0,0,1),1/60,4);
 }
 const first=new Vector3().copy(sim.rig[0].body.getPosition()),last=new Vector3().copy(sim.rig.at(-1).body.getPosition());
 assert.ok(first.distanceTo(last)<span*.6,'both ends curl inward around the source');
 assert.ok(sim.rig.some(r=>r.body.getPosition().y>sim.radius*1.8),'the reaction lifts sections clear of the floor');
 assert.equal(sim.reaction.energy,1);assert.ok(Math.abs(sim.reaction.index-3)<.05);
 for(let i=0;i<180;i++)sim.update(1/60);
 assert.ok(sim.reaction.energy<.01);sim.dispose();
});
