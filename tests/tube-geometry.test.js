import test from 'node:test';
import assert from 'node:assert/strict';
import { Mesh,MeshBasicMaterial,Raycaster,Vector3 } from 'three';
import { createRustTubeGeometry,createTubeWallBoxes,TUBE_PROFILE } from '../src/tube-geometry.js';
import { initPhysics,RustSimulation } from '../src/rust-simulation.js';
import { defaultSetup } from '../src/settings.js';

test('rounded tube has open ends, real wall thickness and inward-facing interior surfaces',()=>{
 const g=createRustTubeGeometry(70),material=new MeshBasicMaterial(),mesh=new Mesh(g,material);mesh.updateMatrixWorld();
 const cast=(origin,direction)=>new Raycaster(new Vector3(...origin),new Vector3(...direction)).intersectObject(mesh);
 assert.equal(cast([-100,0,0],[1,0,0]).length,0,'axis must pass through the hollow bore');
 const outer=cast([0,0,20],[0,0,-1])[0],inner=cast([0,0,0],[0,0,1])[0];
 assert.ok(outer&&inner);assert.ok(Math.abs(outer.point.z-TUBE_PROFILE.width/2)<1e-5);
 assert.ok(Math.abs(outer.point.z-inner.point.z-TUBE_PROFILE.thickness)<1e-5);
 assert.ok(inner.face.normal.z<-.99,'interior normals point into the opening');
 assert.ok(outer.uv.distanceTo(inner.uv)>.4,'inside and outside occupy separate UV islands');
 assert.ok(cast([100,TUBE_PROFILE.height/2-TUBE_PROFILE.thickness/2,0],[-1,0,0]).length>0,'annular rim has real thickness');
 const p=g.attributes.position;let rounded=false;
 for(let i=0;i<p.count;i++)if(Math.abs(p.getY(i))>TUBE_PROFILE.height/2-TUBE_PROFILE.cornerRadius+.1&&Math.abs(p.getY(i))<TUBE_PROFILE.height/2-.1&&Math.abs(p.getZ(i))>TUBE_PROFILE.width/2-TUBE_PROFILE.cornerRadius+.1)rounded=true;
 assert.ok(rounded,'profile corners contain curved geometry');g.dispose();material.dispose();
});

test('each skinned section uses offset native box colliders around an empty bore',async()=>{
 await initPhysics();const sim=new RustSimulation(defaultSetup());
 const descriptors=createTubeWallBoxes(sim.length/7);assert.ok(descriptors.every(s=>s.type==='box'));
 assert.equal(sim.rig.length,7);assert.equal(sim.stats.colliders,7*descriptors.length);
 for(const entry of sim.rig) {
  assert.equal(entry.shapes.length,descriptors.length);
  const center=entry.body.getPosition();
  for(const shape of entry.shapes) {
   const a=shape.getAABB(),inside=['x','y','z'].every(axis=>center[axis]>=a.lowerBound[axis]&&center[axis]<=a.upperBound[axis]);
   assert.equal(inside,false,'wall boxes must not fill the central opening');
  }
 }
 for(let i=0;i<180;i++)sim.update(1/60);
 assert.ok(sim.rig.every(r=>r.body.computeAABB().lowerBound.y>-.3));sim.dispose();
});
