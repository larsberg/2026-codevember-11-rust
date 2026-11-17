import { Vector3 } from 'three';
const clamp=x=>Math.max(0,Math.min(1,x));
export function createRustSoundDirector() {
  let clock=0,sampleClock=0,previousRemoved=0,previousDust=0,previousSparks=0,previousBend=0,contact=false,serial=0;
  let smoothClean=0,smoothStrain=0;const next={carrier:0,sizzle:0,creak:0,spark:0,dust:0,landing:0};
  const scene={levels:[0,0],pans:[0,0]},stats={clean:0,strain:0,events:0};const point=new Vector3();
  function reset(simulation,surface) {
    previousRemoved=surface.mask.cleaned;previousDust=surface.soundState.dust;previousSparks=surface.soundState.sparks;
    previousBend=0;contact=false;smoothClean=smoothStrain=0;sampleClock=0;scene.levels.fill(0);simulation.takeAudioLanding();
    for(const key of Object.keys(next))next[key]=clock;
  }
  return {
    reset,
    update(dt,{simulation,surface,camera,working,running,ready,settings}) {
      if(!running||!settings.enabled||!ready||!(dt>0)){reset(simulation,surface);return {events:[],scene};}
      clock+=dt;sampleClock+=dt;
      if(sampleClock<.04)return {events:[],scene};
      const elapsed=sampleClock;sampleClock=0;const events=[],state=surface.soundState;
      const pan=p=>{if(!p)return .5;point.copy(p).project(camera);return .5+Math.max(-1,Math.min(1,point.x))*.12;};
      const beamPan=pan(state.lampPoint),impactPan=pan(state.contactPoint);
      const cleanRate=Math.max(0,state.removed-previousRemoved)/Math.max(1,surface.mask.validCount)/elapsed;previousRemoved=state.removed;
      let bend=0,speed=0;
      for(let i=0;i<simulation.rig.length;i++) {
        const angular=simulation.rig[i].body.getAngularVelocity();speed=Math.max(speed,Math.hypot(angular.x,angular.y,angular.z));
        if(i)bend=Math.max(bend,simulation.bones[i].quaternion.angleTo(simulation.bones[i-1].quaternion));
      }
      const change=Math.abs(bend-previousBend)/elapsed;previousBend=bend;
      const clean=working?clamp(cleanRate*22):0,strain=clamp(bend*.55+Math.min(2,speed)*.12+Math.min(2,change)*.12);
      const smoothing=1-Math.exp(-elapsed*7);smoothClean+=(clean-smoothClean)*smoothing;smoothStrain+=(strain-smoothStrain)*smoothing;
      scene.levels[0]=working?.32+.06*Math.sin(clock*13):0;scene.levels[1]=smoothStrain*.65;
      scene.pans[0]=beamPan-.5;scene.pans[1]=impactPan-.5;
      const voiceLevel=i=>settings.voices[i].enabled?clamp(settings.voices[i].level/(i?.18:.38)):0;
      const effect=(kind,power,voice,position,level=1)=>{const gain=voiceLevel(voice);if(gain>0&&power>.015)events.push({effect:kind,power:clamp(power),voice,pan:position,level:level*gain});};
      if(working&&!contact)effect('switch',.18,0,beamPan);
      if(!working&&contact)effect('switch',.09,0,beamPan);
      contact=working;
      if(working&&clock>=next.carrier){events.push({from:-1e-6,to:0,duration:.36,serial:++serial,voices:[0]});next.carrier=clock+.18;}
      if(working&&smoothClean>.025&&clock>=next.sizzle){effect('sizzle',smoothClean*.55,0,impactPan);next.sizzle=clock+.24;}
      if(smoothStrain>.19&&speed>.25&&clock>=next.creak) {
        effect('creak',smoothStrain*.5,1,impactPan);
        if(settings.voices[1].enabled)events.push({from:-1e-6,to:0,duration:.42,serial:++serial,voices:[1]});
        next.creak=clock+.85;
      }
      if(state.sparks>previousSparks&&working&&clock>=next.spark){effect('spark',.12+.1*smoothClean,0,impactPan);next.spark=clock+.55;}
      if(state.dust>previousDust&&clock>=next.dust){effect('dust',clamp((state.dust-previousDust)/10)*.32,1,impactPan);next.dust=clock+.5;}
      previousSparks=state.sparks;previousDust=state.dust;
      const landing=simulation.takeAudioLanding();
      if(landing.speed>simulation.scale*.7&&clock>=next.landing){effect('landing',clamp(landing.speed/(simulation.scale*6))*.65,1,pan(landing.point));next.landing=clock+.6;}
      stats.clean=smoothClean;stats.strain=smoothStrain;stats.events+=events.length;return {events,scene};
    },
    get diagnostics(){return {...stats};},
  };
}
