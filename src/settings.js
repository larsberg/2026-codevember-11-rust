import { defaultLighting, validateLighting } from './lighting-settings.js';
import { defaultMaterials, validateMaterials } from './material-settings.js';
import { defaultPaletteLibrary, validatePaletteLibrary, libraryPalettes } from './palette-library.js';
import { audioFields, defaultVoices, validateVoices } from './synth-settings.js';

export const DEFAULT_CAMERA = { yaw: 28, elevation: 28, distance: 15, offsetX: 0, offsetY: 0, offsetZ: 0 };
export const fields = {
  rust: {
    size: ['Cube size', 5, 2, 9, .1], chamfer: ['Edge chamfer', .24, .04, .8, .01],
    initial: ['Initial rust', .82, 0, 1, .01], growth: ['Rust growth / second', .036, 0, .1, .001],
    radius: ['Laser radius', .28, .05, .8, .01], power: ['Laser power', 4, .2, 12, .1],
  },
  motion: { playing: ['Playing', true] },
  physics: {
    damping: ['Damping', .35, .1, 20, .1], mass: ['Body mass scale', 1, .1, 5, .1],
    gravity: ['Gravity', 9.8, 0, 1000, .1], friction: ['Ground friction', 1.1, 0, 10, .01],
  },
  shape: { construction: ['Construction lines', true] },
  drafting: {
    ink: ['Ink edges', true], guides: ['Projection guides', true], paper: ['Paper grain', true],
  },
  studio: { background: ['Background', '#080b10'], exposure: ['Exposure', .9, .1, 3, .01], shadowOpacity: ['Ground shadow opacity', .24, 0, 1, .01] },
  bloom: { enabled: ['Enable bloom', true], strength: ['Bloom strength', .85, 0, 4, .05], radius: ['Bloom radius', .45, 0, 1, .01], threshold: ['Bloom threshold', 1.4, 0, 3, .01] },
  focus: { enabled: ['Tilt blur', false], tilt: ['Sharp band angle °', 0, -85, 85, 1], band: ['Sharp band half-width', .18, .02, .5, .01], strength: ['Blur amount', 1.5, 0, 8, .1], offset: ['Band vertical offset', 0, -.5, .5, .01] },
  audio: audioFields,
  visibility: { fps: ['Show frame-rate meter', false] },
  camera: {
    yaw: ['Yaw', 28, -360, 360, .1], elevation: ['Elevation', 28, -85, 85, .1],
    distance: ['Distance', 15, 5, 60, .1], offsetX: ['Target X', 0, -10, 10, .01],
    offsetY: ['Target Y', 0, -10, 10, .01], offsetZ: ['Target Z', 0, -10, 10, .01],
  },
};


export function defaultSetup() {
  const result = Object.fromEntries(Object.entries(fields).map(([group, entries]) => [group,
    Object.fromEntries(Object.entries(entries).map(([key, [, initial]]) => [key, initial]))]));
  result.version = 1; result.sketch = '11-rust';
  result.audio.voices = defaultVoices();
  result.lighting = defaultLighting(); result.materials = defaultMaterials();
  Object.assign(result.lighting.spotlight, { enabled:true, intensity:850, angle:32, penumbra:.65, offsetX:-3, height:8, offsetZ:5 });
  result.lighting.hemisphere.intensity=.28; result.lighting.fill.intensity=.45;
  result.lighting.environment.intensity=.65;
  result.paletteLibrary = defaultPaletteLibrary();
  result.paletteId = libraryPalettes(result.paletteLibrary)[0].id;
  return result;
}
export function validateSetup(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid setup.');
  const result = defaultSetup();
  // Missing Rust fields migrate to defaults; shared studio edits remain intact.
  for (const [group, entries] of Object.entries(fields)) for (const [key, [, initial, min, max]] of Object.entries(entries)) {
    const x = value[group]?.[key] ?? result[group][key];
    const valid = typeof initial === 'number' ? Number.isFinite(x) && x >= min && x <= max
      : typeof initial === 'boolean' ? typeof x === 'boolean' : typeof x === 'string' && /^#[0-9a-f]{6}$/i.test(x);
    if (!valid) throw Error(`Invalid ${group}.${key}.`);
    result[group][key] = x;
  }
  result.audio.voices = validateVoices(value.audio?.voices);
  result.lighting = validateLighting(Object.fromEntries(Object.entries(result.lighting).map(([key, defaults]) => [key, { ...defaults, ...value.lighting?.[key] }])));
  result.materials = validateMaterials(value.materials);
  result.paletteLibrary = validatePaletteLibrary(value.paletteLibrary ?? result.paletteLibrary);
  result.paletteId = value.paletteId ?? result.paletteId;
  if (!libraryPalettes(result.paletteLibrary).some(p => p.id === result.paletteId)) throw Error('Invalid palette.');
  return result;
}
