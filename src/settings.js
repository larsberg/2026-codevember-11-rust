import { defaultLighting, validateLighting } from './lighting-settings.js';
import { defaultMaterials, validateMaterials } from './material-settings.js';
import { defaultPaletteLibrary, validatePaletteLibrary, libraryPalettes } from './palette-library.js';
import { audioFields, defaultVoices, validateVoices } from './synth-settings.js';

export const DEFAULT_CAMERA = { yaw: 28, elevation: 28, distance: 145, offsetX: 0, offsetY: 0, offsetZ: 0 };
export const fields = {
  rust: {
    size: ['Tube length', 70, 2, 120, .1], chamfer: ['Capsule radius', 6.5, .04, 12, .01],
    initial: ['Initial rust', .82, 0, 1, .01], growth: ['Rust growth / second', .036, 0, .1, .001],
    radius: ['Laser radius', .28, .05, .8, .01], power: ['Laser power', 4, .2, 12, .1],
  },
  motion: { playing: ['Playing', true] },
  physics: {
    originAttraction: ['Origin attraction', .8, 0, 2, .01],
    damping: ['Damping', .35, .1, 20, .1], mass: ['Body mass scale', 1, .1, 5, .1],
    gravity: ['Gravity', 98, 0, 1000, .1], friction: ['Ground friction', 1.1, 0, 10, .01],
  },
  shape: { construction: ['Construction lines', false] },
  drafting: {
    ink: ['Ink edges', false], guides: ['Projection guides', false], paper: ['Paper grain', false],
  },
  studio: { background: ['Background', '#000000'], exposure: ['Exposure', .9, .1, 3, .01], shadowOpacity: ['Ground shadow opacity', .24, 0, 1, .01] },
  bloom: { enabled: ['Enable bloom', true], strength: ['Bloom strength', .85, 0, 4, .05], radius: ['Bloom radius', .45, 0, 1, .01], threshold: ['Bloom threshold', 1.4, 0, 3, .01] },
  focus: { enabled: ['Tilt blur', false], tilt: ['Sharp band angle °', 0, -85, 85, 1], band: ['Sharp band half-width', .18, .02, .5, .01], strength: ['Blur amount', 1.5, 0, 8, .1], offset: ['Band vertical offset', 0, -.5, .5, .01] },
  audio: audioFields,
  visibility: { fps: ['Show frame-rate meter', false] },
  camera: {
    yaw: ['Yaw', 28, -360, 360, .1], elevation: ['Elevation', 28, -85, 85, .1],
    distance: ['Distance', 145, 5, 600, .1], offsetX: ['Target X', 0, -200, 200, .01],
    offsetY: ['Target Y', 0, -200, 200, .01], offsetZ: ['Target Z', 0, -200, 200, .01],
  },
};


export function defaultSetup() {
  const result = Object.fromEntries(Object.entries(fields).map(([group, entries]) => [group,
    Object.fromEntries(Object.entries(entries).map(([key, [, initial]]) => [key, initial]))]));
  result.version = 4; result.sketch = '11-rust';
  result.audio.voices = defaultVoices();
  result.lighting = defaultLighting(); result.materials = defaultMaterials();
  Object.assign(result.lighting.spotlight, { enabled:true, castShadow:true, intensity:180000, angle:32, penumbra:.65, offsetX:-30, height:80, offsetZ:50 });
  result.lighting.hemisphere.intensity=.28; result.lighting.fill.intensity=.45;
  result.lighting.environment.intensity=.65;
  result.paletteLibrary = defaultPaletteLibrary();
  result.paletteId = libraryPalettes(result.paletteLibrary)[0].id;
  return result;
}
export function validateSetup(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid setup.');
  if(value.sketch==='11-rust' && (value.version??1)<2) {
    value=structuredClone(value);value.rust??={};value.camera??={};value.physics??={};
    value.rust.size=(value.rust.size??7)*10;value.rust.chamfer=(value.rust.chamfer??.65)*10;
    value.camera.distance=(value.camera.distance??15)*8;
    if(value.physics.gravity===9.8)value.physics.gravity=98;
    if(value.lighting?.spotlight){const spot=value.lighting.spotlight;spot.intensity*=100;spot.offsetX*=10;spot.height*=10;spot.offsetZ*=10;}
  }
  if((value.version??1)<4 && value.sketch==='11-rust') {
    value=structuredClone(value);
    const old=[{note:89,sound:'sine'},{note:65,sound:'sawtooth'}],fresh=defaultVoices();
    value.audio?.voices?.forEach((voice,i)=>{
      if(voice.note===old[i]?.note&&voice.sound===old[i]?.sound) {
        voice.note=fresh[i].note;voice.sound=fresh[i].sound;
        for(const [key,previous] of Object.entries({lowpass:4800,fm:.1,attack:.006,release:.025,reverb:.12,delay:.06}))if(voice[key]===previous)voice[key]=fresh[i][key];
      }
    });
  }
  const result = defaultSetup();
  // Missing Rust fields migrate to defaults; shared studio edits remain intact.
  for (const [group, entries] of Object.entries(fields)) for (const [key, [, initial, min, max]] of Object.entries(entries)) {
    const x = value[group]?.[key] ?? result[group][key];
    const valid = typeof initial === 'number' ? Number.isFinite(x) && x >= min && x <= max
      : typeof initial === 'boolean' ? typeof x === 'boolean' : typeof x === 'string' && /^#[0-9a-f]{6}$/i.test(x);
    if (!valid) throw Error(`Invalid ${group}.${key}.`);
    result[group][key] = x;
  }
  // Retain legacy keys for saved setups, with the retired drafting mode disabled.
  result.shape.construction=false;
  result.drafting={ink:false,guides:false,paper:false};
  result.audio.voices = validateVoices(value.audio?.voices);
  result.lighting = validateLighting(Object.fromEntries(Object.entries(result.lighting).map(([key, defaults]) => [key, { ...defaults, ...value.lighting?.[key] }])));
  result.materials = validateMaterials(value.materials);
  result.paletteLibrary = validatePaletteLibrary(value.paletteLibrary ?? result.paletteLibrary);
  result.paletteId = value.paletteId ?? result.paletteId;
  if (!libraryPalettes(result.paletteLibrary).some(p => p.id === result.paletteId)) throw Error('Invalid palette.');
  return result;
}
