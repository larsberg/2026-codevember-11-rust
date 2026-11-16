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
    assert.ok(Math.abs(sim.object.position.y-settings.rust.size/2)<.03);
    assert.ok(sim.entry.body.getMass()>0);assert.equal(sim.stats.physicsEngine,'Box3D');
    view.dispose();sim.dispose();settings.rust.size=6;
  }
});

test('legacy saves acquire Rust defaults while retaining shared edits; invalid mask controls reject', () => {
  const legacy={version:17,studio:{background:'#eeeecc',exposure:1.2},camera:{yaw:45},audio:{enabled:false},fold:{sections:10}};
  const setup=validateSetup(legacy);
  assert.equal(setup.rust.size,5);assert.equal(setup.studio.background,'#eeeecc');assert.equal(setup.camera.yaw,45);assert.equal(setup.audio.enabled,false);
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
  assert.equal(view.group.getObjectByName('Laser core').visible,true);
  const lines=view.group.getObjectByName('Laser scan lines').geometry.attributes.position.array;
  assert.ok(lines.some(v=>Math.abs(v)>.1));
  view.setTarget(null,false);view.update(null,0,false);
  assert.equal(view.group.getObjectByName('Laser scan lines').visible,false);
  assert.equal(settings.rust.growth,.036);assert.equal(settings.bloom.enabled,true);
  view.dispose();sim.dispose();
});
