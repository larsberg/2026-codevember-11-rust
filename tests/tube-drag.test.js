import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Raycaster,Scene,Vector3} from 'three';
import {RustSimulation,initPhysics} from '../src/rust-simulation.js';
import {createRustView} from '../src/rust-view.js';
import {defaultSetup} from '../src/settings.js';
import {bindColliderDrag} from '../src/collider-drag.js';

test('surface grab lifts the skinned rig with a native joint, drops it and returns home at both gravity scales',async()=>{
 await initPhysics();
 for(const [size,gravity] of [[70,98],[42.7,509.6]]){
  const settings=defaultSetup();settings.rust.size=size;settings.physics.gravity=gravity;
  const sim=new RustSimulation(settings),view=createRustView(new Scene(),sim);
  const hit=view.rig.pickCollider(new Raycaster(new Vector3(0,sim.object.position.y,100),new Vector3(0,0,-1)));
  assert.ok(hit);assert.equal(hit.link,3);
  const before=sim.center.clone(),bodyCount=sim.physics.entries.length;
  assert.ok(view.rig.beginDrag(hit.link,hit.point));assert.equal(sim.physics.joints.length,7);
  view.rig.moveDrag(hit.point.clone().add(new Vector3(55,30,35)));
  assert.deepEqual(sim.center,before,'moving the cursor must not teleport the tube');
  for(let i=0;i<120;i++)sim.update(1/60);
  assert.ok(sim.center.y>15);assert.ok(Math.hypot(sim.center.x,sim.center.z)>35);
  assert.ok(sim.bones.some(b=>b.quaternion.angleTo(sim.bones[0].quaternion)>.05));
  sim.configure(settings);view.rig.endDrag();view.rig.endDrag();
  assert.equal(sim.dragging,false);assert.equal(sim.physics.joints.length,6);assert.equal(sim.physics.entries.length,bodyCount);
  for(let i=0;i<720;i++)sim.update(1/60);
  assert.ok(Math.hypot(sim.center.x,sim.center.z)<5,'released rig must overcome floor friction and get home');
  assert.ok(sim.center.y>=sim.floor);
  view.rig.beginDrag(3,new Vector3().copy(sim.rig[3].body.getPosition()));view.dispose();sim.dispose();
 }
});

test('pointer grabbing restores orbit and removes the hold on cancellation, blur, hiding, pause and rebuild',()=>{
 const element=new EventTarget(),blurTarget=new EventTarget(),documentTarget=new EventTarget();
 element.style={cursor:'auto'};element.getBoundingClientRect=()=>({left:0,top:0,width:200,height:200});
 let capture; element.setPointerCapture=id=>{capture=id;};element.hasPointerCapture=id=>capture===id;element.releasePointerCapture=()=>{capture=undefined;};
 const camera=new PerspectiveCamera();camera.position.z=10;
 const controls={enabled:true};let canInteract=true,ends=0,rig;
 const makeRig=()=>({dragging:false,pickCollider:()=>({link:3,point:new Vector3()}),beginDrag(){this.dragging=true;return true;},moveDrag(){},endDrag(){this.dragging=false;ends++;}});
 rig=makeRig();const drag=bindColliderDrag({element,camera,controls,getRig:()=>rig,canInteract:()=>canInteract,blurTarget,documentTarget});
 const event=type=>{const e=new Event(type,{cancelable:true});Object.assign(e,{isPrimary:true,pointerId:1,button:0,buttons:1,clientX:100,clientY:100});element.dispatchEvent(e);return e;};
 for(const end of [()=>event('pointerup'),()=>event('pointercancel'),()=>blurTarget.dispatchEvent(new Event('blur')),()=>{documentTarget.hidden=true;documentTarget.dispatchEvent(new Event('visibilitychange'));},()=>{canInteract=false;drag.update();canInteract=true;},()=>{rig=makeRig();drag.update();}]){
  assert.equal(event('pointerdown').defaultPrevented,true);assert.equal(drag.active,true);assert.equal(controls.enabled,false);
  end();assert.equal(drag.active,false);assert.equal(controls.enabled,true);assert.equal(capture,undefined);assert.equal(element.style.cursor,'auto');
 }
 assert.equal(ends,6);rig.pickCollider=()=>null;
 assert.equal(event('pointerdown').defaultPrevented,false);assert.equal(controls.enabled,true);
 drag.dispose();
});
