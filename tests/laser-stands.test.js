import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion,Scene,Vector3,SpotLight } from 'three';
import { createSpotlightFloorMaterial,spotlightFloorMask,updateSpotlightFloor } from '../src/spotlight-floor.js';
import { initPhysics,RustSimulation } from '../src/rust-simulation.js';
import { defaultSetup } from '../src/settings.js';
import { createRustView } from '../src/rust-view.js';

test('single reference lamp has a round base, paired links, springs, cylindrical head and matte black coating',async()=>{
 await initPhysics();const scene=new Scene(),sim=new RustSimulation(defaultSetup()),view=createRustView(scene,sim);
 view.configure(sim.settings);assert.equal(view.stands.stations.length,1);
 assert.ok(view.stands.group.getObjectByName('Weighted round lamp base'));
 assert.ok(view.stands.group.getObjectByName('Cylindrical laser head'));
 assert.equal(view.stands.group.children.filter(o=>o.name==='Balance spring').length,2);
 const station=view.stands.stations[0];
 assert.equal(station.headRadius,sim.settings.rust.radius*5*sim.scale*.25);
 station.head.updateMatrixWorld(true);
 assert.ok(Math.abs(station.optics.getWorldScale(new Vector3()).x-station.headRadius)<1e-6);
 const edited=structuredClone(sim.settings);edited.rust.radius=.4;view.configure(edited);
 assert.equal(station.headRadius,.4*5*sim.scale*.25);
 assert.equal(view.materials.pistons.color.getHexString(),'111416');assert.ok(view.materials.pistons.roughness>.7);assert.ok(view.materials.pistons.metalness<.15);
 view.dispose();sim.dispose();
});

test('one lamp head pivots at a fixed mounting point and emits one fan',async()=>{
 await initPhysics();const scene=new Scene(),sim=new RustSimulation(defaultSetup()),view=createRustView(scene,sim);view.configure(sim.settings);view.update(null);
 const stations=view.stands.stations,positions=stations.map(s=>s.head.position.clone());
 view.setTarget(view.automaticTarget(0),true);view.update(null,.02,true);
 const before=stations.map(s=>s.head.quaternion.clone());
 const target=view.automaticTarget(2),up=new Vector3(0,1,0);
 view.setTarget(target,true);view.update(null,0,true);
 stations.forEach((station,i)=>assert.ok(station.head.position.equals(positions[i])));
 stations.forEach((station,i)=>assert.ok(station.head.quaternion.angleTo(before[i])<1e-7,'zero elapsed time preserves orientation'));
 const station=stations[0],desired=new Quaternion().setFromUnitVectors(up,station.pivot.clone().sub(target.point).normalize());
 const initialError=before[0].angleTo(desired);
 view.update(null,1/60,true);
 const remainingError=station.head.quaternion.angleTo(desired);
 assert.ok(remainingError>0&&remainingError<initialError,'head eases toward the target');
 assert.ok(Math.abs(remainingError-initialError*Math.exp(-10/60))<1e-7);
 const linesAfterStep=view.group.getObjectByName('Laser scan lines').geometry;
 const beamAxis=up.clone().applyQuaternion(station.head.quaternion).negate();
 let closestAlignment=-1;
 for(let i=1;i<linesAfterStep.drawRange.count;i+=2) {
  const beamDirection=new Vector3().fromBufferAttribute(linesAfterStep.attributes.position,i).sub(station.nozzle).normalize();
  closestAlignment=Math.max(closestAlignment,beamDirection.dot(beamAxis));
 }
 assert.ok(closestAlignment>.999,'beam follows the eased head');
 for(let i=0;i<60;i++)view.update(null,1/60,true);
 assert.ok(station.head.quaternion.angleTo(desired)<initialError*.001,'head settles at the requested orientation');
 const lines=view.group.getObjectByName('Laser scan lines').geometry,p=lines.attributes.position,sources=new Set();
 for(let i=0;i<lines.drawRange.count;i+=2){const start=new Vector3().fromBufferAttribute(p,i);const index=stations.findIndex(s=>s.nozzle.distanceTo(start)<1e-4);assert.ok(index>=0);sources.add(index);}
 assert.equal(sources.size,1);assert.equal(scene.getObjectByName('Laser mechanical arm'),undefined);
 view.dispose();sim.dispose();
});

test('floor fades through the spotlight penumbra and is fully black outside its cone',()=>{
 const position=new Vector3(0,10,0),target=new Vector3(),angle=Math.PI/4,penumbra=.5;
 assert.equal(spotlightFloorMask(new Vector3(),position,target,angle,penumbra),1);
 assert.equal(spotlightFloorMask(new Vector3(12,0,0),position,target,angle,penumbra),0);
 const transition=spotlightFloorMask(new Vector3(7,0,0),position,target,angle,penumbra);assert.ok(transition>0&&transition<1);
 const material=createSpotlightFloorMaterial(),spot=new SpotLight();spot.position.copy(position);spot.target.position.copy(target);spot.angle=angle;spot.penumbra=penumbra;
 updateSpotlightFloor(material,spot);assert.equal(material.userData.spotlightUniforms.floorSpotEnabled.value,1);
 spot.visible=false;updateSpotlightFloor(material,spot);assert.equal(material.userData.spotlightUniforms.floorSpotEnabled.value,0);
 const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <opaque_fragment>'};material.onBeforeCompile(shader);assert.match(shader.fragmentShader,/outgoingLight\*=floorMask/);material.dispose();
});
