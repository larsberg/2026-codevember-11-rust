// Small deterministic textures baked once, then played by registered Strudel
// sample voices. No per-frame synthesis, sample downloads or persistent loops.
export const RUST_SOUND_LIMITS=Object.freeze({voices:6,startsPerSecond:10,burst:4,gain:.22});
const durations={sizzle:.34,creak:.43,spark:.045,dust:.14,landing:.25,switch:.022};
export function bakeRustSound(context,kind,variant=0) {
  const rate=context.sampleRate,n=Math.ceil(rate*durations[kind]),buffer=context.createBuffer(1,n,rate),data=buffer.getChannelData(0);
  let seed=17011+variant*731+Object.keys(durations).indexOf(kind)*3119,low=0,slow=0,phase=0;
  for(let i=0;i<n;i++) {
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/2147483648-1,t=i/rate,u=i/(n-1);
    low+=.28*(noise-low);slow+=.035*(noise-slow);
    let value=0;
    if(kind==='sizzle')value=(low-slow)*(.5+.5*Math.sin(t*119+variant)*Math.sin(t*67))*.65;
    if(kind==='creak') {
      phase+=2*Math.PI*(91+variant*7-22*u+4*Math.sin(t*17))/rate;
      value=(Math.sin(phase)+.24*Math.sin(phase*2.73)+.12*Math.sin(phase*4.11))*.16+(low-slow)*.09;
      value*=.6+.4*Math.sin(t*39)**2;
    }
    if(kind==='spark')value=((noise-low)*.2+Math.sin(t*2*Math.PI*(2600+variant*413))*.08)*Math.exp(-u*9);
    if(kind==='dust')value=slow*.8*Math.exp(-u*5)*( .65+.35*Math.sin(t*173)**2);
    if(kind==='landing')value=(Math.sin(t*2*Math.PI*(66+variant*7))*Math.exp(-u*12)*.4+slow*.18)*Math.exp(-u*3);
    if(kind==='switch')value=(low*.25+Math.sin(t*2*Math.PI*680)*.08)*Math.exp(-u*12);
    const envelope=Math.min(1,t/.005)*Math.min(1,(1-u)*30);
    data[i]=value*envelope;
  }
  return buffer;
}
export async function loadRustSounds(api,context) {
  const buffers=Object.fromEntries(Object.keys(durations).map(kind=>[kind,[0,1,2].map(v=>bakeRustSound(context,kind,v))]));
  const voices=new Map(),counts={};let serial=0,played=0,dropped=0,disposed=false,budget=RUST_SOUND_LIMITS.burst,last=context.currentTime;
  for(const kind of Object.keys(durations))api.registerSound(`rust_${kind}`,(time,value,onended)=>{
    const voice=voices.get(value.rustTicket);if(!voice||disposed)return;
    const source=context.createBufferSource();voice.source=source;source.buffer=voice.buffer;source.playbackRate.value=voice.rate;
    source.onended=()=>{voices.delete(value.rustTicket);source.disconnect();source.onended=null;onended();};
    source.start(time);played++;counts[kind]=(counts[kind]??0)+1;
    return {node:source,nodes:{source:[source]},stop:time=>source.stop(time??context.currentTime)};
  },{type:'sample'});
  return {
    async play(event,volume) {
      const bank=buffers[event.effect],now=context.currentTime;
      if(!bank||disposed||context.state!=='running'||!Number.isFinite(volume)||volume<=0||!(event.power>0))return false;
      budget=Math.min(RUST_SOUND_LIMITS.burst,budget+Math.max(0,now-last)*RUST_SOUND_LIMITS.startsPerSecond);last=now;
      if(voices.size>=RUST_SOUND_LIMITS.voices||budget<1){dropped++;return false;}
      const ticket=++serial,buffer=bank[serial%bank.length],rate=Math.max(.8,Math.min(1.15,event.rate??1));
      const voice={buffer,rate};voices.set(ticket,voice);budget--;
      const power=Math.min(1,event.power),level=Math.max(0,Math.min(1,event.level??1));
      try {
        await api.superdough({s:`rust_${event.effect}`,rustTicket:ticket,gain:volume*RUST_SOUND_LIMITS.gain*power*level/Math.sqrt(Math.max(1,voices.size*.5)),
          pan:Math.max(.3,Math.min(.7,event.pan??.5)),orbit:event.voice===0?1:2,room:0,delay:0,attack:0,release:0},now+.008,buffer.duration/rate);
        if(!voice.source)voices.delete(ticket);return !!voice.source;
      }catch(error){voices.delete(ticket);voice.source?.stop();throw error;}
    },
    stop(){const active=[...voices.values()];voices.clear();budget=RUST_SOUND_LIMITS.burst;last=context.currentTime;for(const voice of active)voice.source?.stop(context.currentTime);},
    dispose(){this.stop();disposed=true;},
    get diagnostics(){return {voices:voices.size,maxVoices:RUST_SOUND_LIMITS.voices,played,dropped,counts:{...counts},bufferBytes:Object.values(buffers).flat().reduce((n,b)=>n+b.length*4,0)};},
  };
}
