import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene,Vector3,SpotLight } from 'three';
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
 assert.equal(station.headRadius,sim.settings.rust.radius*5*sim.scale);
 station.head.updateMatrixWorld(true);
 assert.ok(Math.abs(station.optics.getWorldScale(new Vector3()).x-station.headRadius)<1e-6);
 const edited=structuredClone(sim.settings);edited.rust.radius=.4;view.configure(edited);
 assert.equal(station.headRadius,.4*5*sim.scale);
 assert.equal(view.materials.pistons.color.getHexString(),'111416');assert.ok(view.materials.pistons.roughness>.7);assert.ok(view.materials.pistons.metalness<.15);
 view.dispose();sim.dispose();
});

test('one lamp head pivots at a fixed mounting point and emits one fan',async()=>{
 await initPhysics();const scene=new Scene(),sim=new RustSimulation(defaultSetup()),view=createRustView(scene,sim);view.configure(sim.settings);view.update(null);
 const stations=view.stands.stations,positions=stations.map(s=>s.head.position.clone());
 view.setTarget(view.automaticTarget(0),true);view.update(null,.02,true);
 const before=stations.map(s=>s.head.quaternion.clone());
 view.setTarget(view.automaticTarget(2),true);view.update(null,0,true);
 stations.forEach((station,i)=>assert.ok(station.head.position.equals(positions[i])));
 assert.ok(stations.some((station,i)=>station.head.quaternion.angleTo(before[i])>.01));
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
