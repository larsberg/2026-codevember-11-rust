import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera,Quaternion,Vector3 } from 'three';
import { bakeRustSound,loadRustSounds,RUST_SOUND_LIMITS } from '../src/rust-sounds.js';
import { createRustSoundDirector } from '../src/rust-sound-director.js';
import { defaultSetup,validateSetup } from '../src/settings.js';

function context() {
 const sources=[];
 return {sources,state:'running',currentTime:0,sampleRate:24000,
  createBuffer(channels,length,rate){const data=new Float32Array(length);return {length,duration:length/rate,numberOfChannels:1,getChannelData:()=>data};},
  createBufferSource(){const source={playbackRate:{value:1},start(){},stop(){this.stopped=true;},disconnect(){}};sources.push(source);return source;},
 };
}
test('procedural texture bank is deterministic, quiet, finite and small',()=>{
 const ctx=context();let bytes=0;
 for(const kind of ['sizzle','creak','spark','dust','landing','switch']) {
  const a=bakeRustSound(ctx,kind,0),b=bakeRustSound(ctx,kind,0),data=a.getChannelData(0);assert.deepEqual(data,b.getChannelData(0));
  let peak=0,energy=0;for(const v of data){assert.ok(Number.isFinite(v));peak=Math.max(peak,Math.abs(v));energy+=v*v;}
  assert.ok(peak>.001&&peak<.6,kind);assert.ok(Math.sqrt(energy/data.length)<.22,kind);assert.equal(Math.abs(data[0]),0);assert.equal(Math.abs(data.at(-1)),0);bytes+=a.length*4*3;
 }
 assert.ok(bytes<1024*1024);
});

test('registered Strudel textures cap voices and bursts; pause clears sources without late playback',async()=>{
 const ctx=context(),registry={},values=[];
 const api={registerSound(name,fn){registry[name]=fn;},async superdough(value,time){values.push(value);return registry[value.s](time,value,()=>{});}};
 const effects=await loadRustSounds(api,ctx);
 for(let i=0;i<4;i++)await effects.play({effect:'sizzle',power:.5,voice:0},.34);
 ctx.currentTime+=.2;
 for(let i=0;i<100;i++)await effects.play({effect:'spark',power:.2,voice:0},.34);
 assert.ok(effects.diagnostics.voices<=RUST_SOUND_LIMITS.voices);assert.ok(effects.diagnostics.dropped>0);
 assert.ok(values.every(v=>v.gain<.05&&v.room===0&&v.delay===0));
 const value=values[0];effects.stop();assert.equal(effects.diagnostics.voices,0);assert.ok(ctx.sources.every(s=>s.stopped));
 assert.equal(registry[value.s](ctx.currentTime,value,()=>{}),undefined);
 ctx.state='suspended';assert.equal(await effects.play({effect:'spark',power:1},.34),false);effects.dispose();
});
function scene() {
 const settings=defaultSetup().audio,camera=new PerspectiveCamera();camera.position.set(0,0,10);camera.updateMatrixWorld();
 const state={removed:0,dust:0,sparks:0,contactPoint:new Vector3(),lampPoint:new Vector3(1,1,0)};
 const bones=[{quaternion:new Quaternion()},{quaternion:new Quaternion()}];let speed=0,landing={speed:0,point:new Vector3()};
 const simulation={scale:10,bones,rig:[0,1].map(()=>({body:{getAngularVelocity:()=>({x:0,y:speed,z:0})}})),takeAudioLanding(){const event=landing;landing={speed:0,point:new Vector3()};return event;}};
 const surface={mask:{cleaned:0,validCount:100000},get soundState(){return state;}};
 return {settings,camera,simulation,surface,state,setSpeed(v){speed=v;},land(speed){landing={speed,point:new Vector3()};}};
}
test('sound follows removed rust, bending, dust and actual landing strength without particle-scale event storms',()=>{
 const s=scene(),director=createRustSoundDirector(),events=[];director.reset(s.simulation,s.surface);s.setSpeed(1);
 for(let i=0;i<600;i++) {
  s.state.removed+=1000/60;s.surface.mask.cleaned=s.state.removed;s.state.sparks++;
  s.simulation.bones[1].quaternion.setFromAxisAngle(new Vector3(0,0,1),.7+.2*Math.sin(i/30));
  if(i%30===0)s.state.dust+=8;if(i===150)s.land(30);
  events.push(...director.update(1/60,{...s,running:true,ready:true,working:true}).events);
 }
 for(const kind of ['sizzle','creak','spark','dust','landing'])assert.ok(events.some(e=>e.effect===kind),kind);
 assert.ok(events.filter(e=>e.effect).length<110,'rate limited texture layers');
 assert.ok(events.every(e=>!e.effect||e.power<=.65));
 s.settings.enabled=false;assert.deepEqual(director.update(.1,{...s,running:true,ready:true,working:true}).events,[]);
});
test('clean stationary metal has a quiet carrier without scraping, creaks or replayed debris on activation',()=>{
 const s=scene(),director=createRustSoundDirector(),events=[];director.reset(s.simulation,s.surface);
 for(let i=0;i<120;i++)events.push(...director.update(1/60,{...s,running:true,ready:true,working:true}).events);
 assert.ok(events.some(e=>e.voices?.[0]===0));assert.ok(events.every(e=>!e.effect||e.effect==='switch'));
 s.state.dust=1000;s.state.removed=50000;
 director.update(.1,{...s,running:true,ready:false,working:true});
 const result=director.update(.05,{...s,running:true,ready:true,working:false});assert.equal(result.events.length,0);
 assert.deepEqual(result.scene.levels,[0,0]);
});
test('audio preset migration preserves user mute, volume and edited patches',()=>{
 const old=defaultSetup();old.version=3;old.audio.enabled=false;old.audio.volume=.34;old.audio.voices[0].note=91;
 old.audio.voices[1].note=65;old.audio.voices[1].sound='sawtooth';old.audio.voices[1].lowpass=4800;
 const value=validateSetup(old);assert.equal(value.audio.enabled,false);assert.equal(value.audio.volume,.34);assert.equal(value.audio.voices[0].note,91);
 assert.equal(value.audio.voices[1].note,43);assert.equal(value.audio.voices[1].sound,'triangle');
});
