import test from 'node:test';
import assert from 'node:assert/strict';
import * as patterns from '@strudel/core/pattern.mjs';
import '@strudel/core/controls.mjs';
import { defaultSetup, validateSetup } from '../src/settings.js';
import { createSynthPattern, cornerHeight, mapHeight, modulateVoice, synthValue } from '../src/synth.js';
import { createAudio } from '../src/score.js';
import { createLiveModulation, liveSynthValue } from '../src/live-modulation.js';
import { resumeAudioContext } from '../src/audio-autoplay.js';
import { bindSynthControls, synthControlsMarkup } from '../src/synth-controls.js';

const points = (height = 0) => Float64Array.from({ length: 48 }, (_, i) => i % 3 === 1 ? height : 0);
const tick = () => new Promise(resolve => setImmediate(resolve));

test('height mapping clamps both ends, accepts inverted endpoints and uses ground-relative world Y', () => {
  const route = { heightMin: 2, heightMax: 6, min: 100, max: 500 };
  assert.deepEqual([0, 2, 4, 6, 8].map(h => mapHeight(h, route)), [100, 100, 300, 500, 500]);
  assert.equal(mapHeight(8, { ...route, min: 500, max: 100 }), 100);
  assert.equal(mapHeight(8, { ...route, heightMin: 6, heightMax: 2 }), 100);
  assert.equal(mapHeight(0, { ...route, heightMin: 6, heightMax: 2 }), 500);
  const p = points(12); assert.equal(cornerHeight(p, 7, 15), 5);
  p[46] = 6; assert.equal(cornerHeight(p, 7, 15), -1);
});

test('laser voices overlap with separate Strudel orbits and respect live synth edits', () => {
  const audio=defaultSetup().audio,p=points(3);
  const pattern=createSynthPattern(patterns,audio.voices,i=>synthValue(audio,i,p,0));
  const haps=pattern.queryArc(0,1);
  assert.equal(haps.length,2);assert.deepEqual(haps.map(h=>h.value.orbit),[1,2]);
  assert.ok(haps.every(h=>h.value.gain>0 && Number(h.duration)*.16>.075));
  audio.voices[1].note=62;
  assert.equal(pattern.queryArc(1,2).find(h=>h.value.orbit===2).value.note,62);
});

test('every modulation route holds its endpoint through the Strudel controls during a high jump', () => {
  const audio = { ...defaultSetup().audio, enabled: true }, p = points(9), voice = audio.voices[0];
  for (const route of Object.values(voice.modulations)) Object.assign(route, { enabled: true, heightMin: 0, heightMax: 3, min: 1, max: 2 });
  const value = synthValue(audio, 0, p, 0);
  for (const key of ['cutoff', 'resonance', 'hcutoff', 'fmi', 'fmh', 'distort', 'pan', 'room', 'delay']) assert.equal(value[key], 2, key);
  voice.modulations.lowpass.enabled = false; voice.lowpass = 900;
  assert.equal(modulateVoice(voice, p).parameters.lowpass, 900);
  audio.enabled = false; assert.equal(synthValue(audio, 0, p, 0).gain, 0);
});

test('rhythm rests, disabled voices and note lengths survive actual Strudel queries', () => {
  const audio = defaultSetup().audio, p = points();
  audio.voices[0].rhythm = 'x.x.'; audio.voices[0].gate = .5; audio.voices[1].enabled = false;
  const haps = createSynthPattern(patterns, audio.voices, i => synthValue(audio,i,p,0)).queryArc(0,1);
  assert.deepEqual(haps.map(h=>[Number(h.whole.begin),Number(h.whole.end)]), [[0,.125],[.5,.625]]);
  audio.voices[0].rhythm = '....';
  assert.equal(createSynthPattern(patterns,audio.voices,i=>synthValue(audio,i,p,0)).queryArc(0,4).length,0);
});

function harness(loadOverride, initOverride, resumeOverride, options = {}) {
  const calls = [], sources = [], notes = [], context = { state: 'suspended', currentTime: 0,
    createConstantSource() { const source={offset:{value:0,setTargetAtTime(value){this.value=value;}},connect(bus){this.bus=bus;},start(){},stop(){this.stopped=true;},disconnect(){}};sources.push(source);return source; },
    async resume() { this.state = 'running'; }, async suspend() { this.state = 'suspended'; }, async close() { this.state = 'closed'; } };
  const repl = { pattern: null, cps: 0, active: false,
    setCps(value) { this.cps = value; }, async setPattern(value, autostart) { assert.equal(autostart, false); this.pattern = value; calls.push('pattern'); },
    async start() { assert.ok(this.pattern, 'scheduler must never start without an installed pattern'); this.active = true; calls.push('start'); }, pause() { this.active = false; calls.push('pause'); }, stop() { this.active = false; calls.push('stop'); } };
  const api = { ...patterns, getSuperdoughAudioController:()=>({getBus:id=>id}), superdough:async(value,time,duration)=>{notes.push({value,time,duration});}, getAudioContext: () => context, initStrudel: async () => repl, initAudio: initOverride ?? (async () => {}), resetGlobalEffects() { calls.push('clear'); } };
  const audio = createAudio({ load: loadOverride ?? (async () => api), onError: message => assert.fail(message),
    createAnalysis: () => ({ read: () => ({ active: true }), dispose() { calls.push('analysis-stop'); } }),
    resumeContext: resumeOverride ?? (ctx=>({ready:ctx.resume().then(()=>true),cancel(){}})), ...options });
  return { audio, api, context, repl, calls, sources, notes };
}

test('Fold mixes bounded synth accents with sample effects and disposes both on pause', async () => {
  let plays = 0, stops = 0, disposals = 0, analyses = 0;
  const effects = { async play() { plays++; }, stop() { stops++; }, dispose() { disposals++; } };
  const h = harness(undefined, undefined, undefined, {
    loadEffects: async () => effects, synthLevel: .18, synthMaxVoices: 4, modulationHz: 30,
    createAnalysis: () => { analyses++; return { read: () => ({ active: true }), dispose() {} }; },
  });
  const settings = defaultSetup().audio; settings.enabled = true;
  h.audio.configure(settings); await h.audio.unlock();
  const event = { serial: 1, from: -1e-9, to: 0, duration: .15 };
  h.audio.update(0, true, points(2), 0, [{ effect: 'clack' }, ...Array(40).fill(event)]);
  await tick(); assert.equal(plays, 1); assert.equal(h.notes.length, 4, 'A burst cannot create unbounded synth nodes.');
  assert.equal(analyses, 0, 'Unused FFT scopes must not allocate DSP nodes.');
  assert.ok(h.sources.filter(s => [109, 141].includes(s.bus)).every(s => s.offset.value < .03));
  h.context.currentTime = 3;
  h.audio.update(0, true, points(2), 0, [event]); await tick(); assert.equal(h.notes.length, 6);
  h.audio.update(0, false); assert.ok(stops > 0); assert.equal(h.context.state, 'suspended');
  h.audio.update(0, true); await h.audio.unlock();
  assert.equal(analyses, 0); assert.equal(h.audio.analysis.active, true); assert.equal(analyses, 1);
  h.audio.dispose(); assert.equal(disposals, 1); assert.equal(h.context.state, 'closed');
});

test('disposing while the sample bank loads releases it without starting playback', async () => {
  let finish, disposed = 0;
  const loading = new Promise(resolve => { finish = resolve; });
  const h = harness(undefined, undefined, undefined, { loadEffects: () => loading });
  h.audio.configure({ ...defaultSetup().audio, enabled: true });
  const pending = h.audio.unlock(); await tick(); h.audio.dispose();
  finish({ dispose() { disposed++; } }); await pending;
  assert.equal(disposed, 1); assert.equal(h.audio.unlocked, false);
  assert.equal(h.calls.filter(c => c === 'start').length, 0);
});

test('each move triggers both voices once; live effect buses change during notes and without any new notes', async () => {
  const h = harness(), setup = defaultSetup();
  for(const voice of setup.audio.voices)for(const route of Object.values(voice.modulations))route.enabled=true;
  h.audio.configure(setup.audio); h.audio.update(0,true,points(1),0);
  await h.audio.unlock(); assert.equal(h.repl.active,true);
  assert.equal(h.notes.length,0,'an independent clock must not emit notes');
  const move={serial:1,from:-1e-9,to:0,duration:1.25};
  h.audio.update(0,true,points(1),0,[move]); await tick();
  assert.equal(h.notes.length,2); assert.equal(h.notes[0].duration,1.1);
  assert.equal(h.notes[0].value.bmod.lowpass.bus,100);
  assert.equal(h.notes[1].value.bmod.lowpass.bus,132);
  const offsets=h.sources.map(s=>s.offset.value), starts=h.calls.filter(c=>c==='start').length;
  // Existing sounding notes must change on the same control buses, with no
  // new onsets, oscillator replacements, or restarted patterns.
  h.audio.update(1/60,true,points(4),0); await tick();
  assert.equal(h.notes.length,2);
  for(let i=0;i<8;i++) assert.notEqual(h.sources[i].offset.value,offsets[i],`effect ${i} must move`);
  assert.equal(h.calls.filter(c=>c==='start').length,starts);
  // Empty rhythms do not stop the height-controlled effects updating.
  setup.audio.voices.forEach(v=>v.rhythm='.');h.audio.configure(setup.audio);
  h.audio.update(10,true,points(8),0);assert.equal(h.notes.length,2);
  assert.equal(h.sources[0].offset.value,4799,'cutoff control holds at the upper endpoint during a jump');
  const high = h.sources.map(s=>s.offset.value);
  h.audio.update(1/60,true,points(100),0);
  assert.deepEqual(h.sources.map(s=>s.offset.value),high,'higher jumps cannot increase any effect beyond its endpoint');
  h.audio.update(1/60,true,points(2),0);
  assert.equal(h.sources[0].offset.value,2459,'continuous modulation resumes immediately inside the range');
  setup.audio.voices.forEach(v=>v.rhythm='x');h.audio.configure(setup.audio);
  h.audio.update(0,true,points(8),0,[{...move,serial:2,duration:.75}]);await tick();
  assert.equal(h.notes.length,4);assert.equal(h.notes[2].duration,.66);
  h.audio.dispose();assert.ok(h.sources.every(s=>s.stopped));assert.equal(h.context.state,'closed');
});

test('global pause and mute stop the synth; restoring saved Sound on resumes it', async () => {
  const h=harness(),audio={...defaultSetup().audio,enabled:true};h.audio.configure(audio);await h.audio.unlock();
  h.audio.update(0,false);assert.equal(h.repl.active,false);assert.equal(h.context.state,'suspended');
  h.audio.update(0,true);await tick();assert.equal(h.audio.unlocked,true);
  h.audio.configure({...audio,enabled:false});assert.equal(h.context.state,'suspended');assert.equal(h.repl.active,false);
  h.audio.update(1,true);await tick();assert.equal(h.audio.unlocked,false);
  h.audio.configure(audio);h.audio.update(0,true);await tick();assert.equal(h.audio.unlocked,true,'saved enabled state must restart audio when the browser permits it');
  await h.audio.unlock();assert.equal(h.audio.unlocked,true);h.audio.dispose();
});

test('muting, pausing or disposing during deferred initialization cannot start sound later', async () => {
  for(const phase of ['load','init'])for(const action of ['mute','pause','dispose']){
    let finish;const pending=new Promise(resolve=>{finish=resolve;});
    const h=harness(phase==='load'?()=>pending:undefined,phase==='init'?()=>pending:undefined);
    h.audio.configure({...defaultSetup().audio,enabled:true});const unlocking=h.audio.unlock();await tick();
    if(action==='mute')h.audio.configure({...defaultSetup().audio,enabled:false});else if(action==='pause')h.audio.update(0,false);else h.audio.dispose();
    finish(phase==='load'?h.api:undefined);await unlocking;
    assert.equal(h.audio.unlocked,false);assert.equal(h.calls.filter(c=>c==='start').length,0);
    assert.notEqual(h.context.state,'running');h.audio.dispose();
  }
});

test('render updates during slow initialization and pattern installation cannot start an empty scheduler', async () => {
  let finishAudio, finishPattern;
  const audioReady = new Promise(resolve => { finishAudio = resolve; });
  const patternReady = new Promise(resolve => { finishPattern = resolve; });
  const h = harness(undefined, () => audioReady), install = h.repl.setPattern;
  h.repl.setPattern = async (...args) => { await patternReady; return install.apply(h.repl, args); };
  h.audio.configure({ ...defaultSetup().audio, enabled: true });
  await tick();
  for (let i=0;i<60;i++) h.audio.update(1/60,true,points(2),0);
  assert.equal(h.calls.includes('start'),false);
  finishAudio(); await tick();
  for (let i=0;i<60;i++) h.audio.update(1/60,true,points(2),0);
  assert.equal(h.calls.includes('start'),false);
  finishPattern(); await tick();
  assert.equal(h.calls.filter(c=>c==='start').length,1);assert.equal(h.audio.unlocked,true);h.audio.dispose();
});

test('saved Sound on survives browser activation blocking and starts on a document gesture', async () => {
  const target = new EventTarget();target.hidden=false;
  const events = new EventTarget();let permitted=false;
  const h=harness(undefined,undefined,context=>resumeAudioContext(context,{target}));
  h.context.addEventListener=events.addEventListener.bind(events);h.context.removeEventListener=events.removeEventListener.bind(events);
  h.context.resume=async()=>{if(!permitted)throw Object.assign(Error('Activation required'),{name:'NotAllowedError'});h.context.state='running';events.dispatchEvent(new Event('statechange'));};
  h.audio.configure({...defaultSetup().audio,enabled:true});await tick();
  assert.equal(h.audio.diagnostics.enabled,true);assert.equal(h.audio.unlocked,false);
  permitted=true;target.dispatchEvent(new Event('pointerdown'));await tick();
  assert.equal(h.audio.unlocked,true);assert.equal(h.calls.filter(c=>c==='start').length,1);h.audio.dispose();
});

test('Audio controls edit one voice and mapping, then restore the same values on Reload and Reset', () => {
  // Bind the actual controls to a minimal input event adapter. Browser layout
  // and audible synthesis still require the user's shared sketch tab.
  const inputs=[],outputs=new Map();
  for(const [tag] of synthControlsMarkup().matchAll(/<(?:input|select)\b[^>]*>/g)){
    const attrs=Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([,k,v])=>[k,v]));
    const listeners={},dataset=Object.fromEntries(Object.entries(attrs).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),v]));
    const input={...attrs,dataset,type:attrs.type??'select-one',value:'on',checked:false,checkValidity:()=>true,addEventListener:(event,fn)=>{listeners[event]=fn;},
      edit(value){if(this.type==='checkbox')this.checked=value;else this.value=String(value);listeners[this.type==='range'||this.type==='checkbox'?'input':'change']();}};
    inputs.push(input);outputs.set(input.id,{value:''});
  }
  const root={querySelectorAll:selector=>selector==='[data-synth-voice][data-synth-key]'?inputs:[],querySelector:selector=>outputs.get(selector.match(/for="([^"]+)"/)?.[1])};
  let setup=defaultSetup();const control=bindSynthControls(root,{getVoices:()=>setup.audio.voices,change:voices=>{setup=validateSetup({...setup,audio:{...setup.audio,voices}});control.sync();}});control.sync();
  const edit=(id,value)=>inputs.find(input=>input.id===id).edit(value),other=structuredClone(setup.audio.voices[0]);
  edit('synth-1-note',64);edit('synth-1-rhythm','x..x....');edit('synth-1-fm-corner',14);edit('synth-1-fm-min',-1);edit('synth-1-fm-max',4.5);edit('synth-1-fm-enabled',true);
  assert.equal(setup.audio.voices[1].note,64);assert.equal(setup.audio.voices[1].modulations.fm.corner,14);
  assert.equal(setup.audio.voices[1].modulations.fm.min,-1);assert.deepEqual(setup.audio.voices[0],other);
  const saved=JSON.stringify(setup);setup=defaultSetup();control.sync();assert.equal(Number(inputs.find(i=>i.id==='synth-1-note').value),defaultSetup().audio.voices[1].note);
  setup=validateSetup(JSON.parse(saved));control.sync();assert.equal(Number(inputs.find(i=>i.id==='synth-1-note').value),64);
  assert.equal(Number(inputs.find(i=>i.id==='synth-1-fm-max').value),4.5);
});
