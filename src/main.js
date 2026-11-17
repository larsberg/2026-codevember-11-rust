import { attachPlayerBridge } from './player-bridge.js';
// 01-fold studio shell; Rust replaces the subject and its event source.
import './style.css';
import './mesh-style.css';
import './drafting.css';
import {
  ACESFilmicToneMapping, Color, DirectionalLight, HemisphereLight, PCFShadowMap,
  MOUSE, TOUCH, PerspectiveCamera, PMREMGenerator, Scene, SpotLight, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { applyCameraView, captureCameraView, configureOrbitInputs, createCameraFollow } from './camera.js';
import { initPhysics, RustSimulation } from './rust-simulation.js';
import { createRustView } from './rust-view.js';
import { createControls } from './controls.js';
import { defaultSetup, validateSetup, DEFAULT_CAMERA } from './settings.js';
import { requestSetup } from './persistence.js';
import { libraryPalettes } from './palette-library.js';
import { createSpotlightFloorMaterial,updateSpotlightFloor } from './spotlight-floor.js';
import { createPaperFloor, createShadowFollow } from './shadows.js';
import { bindLightingControls } from './lighting-controls.js';
import { bindMaterialControls } from './material-controls.js';
import { materialGroups } from './material-settings.js';
import { createSceneEffects } from './scene-effects.js';
import { createAudio } from './score.js';
import { createDrawingPlate } from './drawing-plate.js';

let settings = defaultSetup(), setupLoadError;
try { settings = await requestSetup(); } catch (error) { setupLoadError = error.message; console.warn(error.message); }
await initPhysics();
const canvas = document.querySelector('canvas');
const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMapping = ACESFilmicToneMapping; renderer.toneMappingExposure = .9;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = PCFShadowMap;
const scene = new Scene(); scene.background = new Color(settings.studio.background);
const camera = new PerspectiveCamera(42, innerWidth / innerHeight, .1, 300);
const orbit = new OrbitControls(camera, canvas);
configureOrbitInputs(orbit);
orbit.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };
orbit.enablePan = true; orbit.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };
orbit.minDistance = 5; orbit.maxDistance = 600; orbit.minPolarAngle = .09; orbit.maxPolarAngle = Math.PI - .09;
orbit.enableDamping = true; orbit.dampingFactor = .07;
const focus = new Vector3(), follow = createCameraFollow();
const pmrem = new PMREMGenerator(renderer), room = new RoomEnvironment();
let environmentBlur = settings.lighting.environment.blur;
let environment = pmrem.fromScene(room, environmentBlur); scene.environment = environment.texture;
function configureEnvironment() {
  const blur = settings.lighting.environment.blur;
  if (blur === environmentBlur) return;
  const previous = environment;
  environment = pmrem.fromScene(room, blur); environmentBlur = blur;
  scene.environment = environment.texture;
  for (const material of Object.values(surface.materials)) material.envMap = environment.texture;
  previous.dispose();
}
const hemisphere = new HemisphereLight('#fff8ed', '#7e8b9d', 1.4); scene.add(hemisphere);
const light = new DirectionalLight('#fff5df', 3.1);
light.position.set(-8, 18, 10); light.castShadow = true; light.shadow.mapSize.set(2048, 2048);
Object.assign(light.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: .5, far: 900 });
light.shadow.camera.updateProjectionMatrix();
light.shadow.bias = -.00015; light.shadow.normalBias = .04; light.shadow.radius = 3;
scene.add(light, light.target);
const lightOffset = new Vector3();
const followShadow = createShadowFollow(light, () => { const l = settings.lighting.directional; return lightOffset.set(l.offsetX, l.height, l.offsetZ); });
const fill = new DirectionalLight('#c0e4ff', 1.1); fill.position.set(12, 8, -10);
fill.shadow.mapSize.set(2048, 2048); Object.assign(fill.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: .5, far: 900 });
fill.shadow.camera.updateProjectionMatrix();
scene.add(fill, fill.target);
const spotlight = new SpotLight(); spotlight.shadow.mapSize.set(4096, 4096);
spotlight.shadow.camera.near = 1; spotlight.shadow.camera.far = 240; scene.add(spotlight, spotlight.target);
const effects = createSceneEffects(renderer, scene, camera, { clampBeauty: false });
const floor = createPaperFloor(settings.studio.background);floor.material.dispose();
floor.material=createSpotlightFloorMaterial();scene.add(floor); floor.layers.enable(1);
const palette = () => libraryPalettes(settings.paletteLibrary).find(p => p.id === settings.paletteId);
const plate = createDrawingPlate();
const audio = createAudio({ synthLevel: .35, synthMaxVoices: 8, modulationHz: 30,
  onError: message => console.warn(message), onStatus: state => controls?.audioStatus(state) });
let simulation, surface, controls, materialControls, lightingControls, rigKey, revision = 0, simulationMilliseconds = 0;
const keyForRig = () => JSON.stringify(['size', 'chamfer', 'initial'].map(key => settings.rust[key]));
function rebuild() {
  const next = new RustSimulation(settings);
  releaseLaser(); surface?.dispose(); simulation?.dispose();
  simulation = next; surface = createRustView(scene, simulation);
  rigKey = keyForRig(); revision++;
  floor.position.y = simulation.floor;
  simulation.getCenter(focus); follow.reset(focus);
  applyCameraView(settings.camera, camera, orbit, follow.position);
  surface.configure(settings, palette()); surface.update(camera);
}
function configure(restoreCamera = false) {
  if (rigKey !== keyForRig()) rebuild(); else simulation.configure(settings);
  scene.background.set(settings.studio.background); floor.material.color.set('#454545');
  materialControls?.set(settings.materials);
  configureEnvironment();
  surface.configure(settings, palette());
  audio.update(0, settings.motion.playing && !document.hidden && surface.working, simulation.position.subarray(0, 48), simulation.floor); audio.configure(settings.audio);
  lightingControls?.set(settings.lighting);
  renderer.toneMappingExposure = settings.studio.exposure;
  for(const source of [light,fill,spotlight])source.shadow.intensity=Math.min(1,settings.studio.shadowOpacity/.24);
  effects.configure(settings.lighting.occlusion); effects.configureBloom(settings.bloom); effects.configureFocus(settings.focus);
  if (restoreCamera) applyCameraView(settings.camera, camera, orbit, follow.position);
  controls?.set(settings);
}
function render() {
  surface.update(camera,0,settings.motion.playing && !document.hidden);
  lightingControls?.updatePosition(follow.position); updateSpotlightFloor(floor.material,spotlight); followShadow(follow.position); effects.render(follow.position);
  plate.render(renderer, settings);
}
function togglePlaying() {
  settings.motion.playing = !settings.motion.playing;
  if (!settings.motion.playing) releaseLaser();
  simulation.configure(settings); controls.set(settings);
}
function setSoundEnabled(enabled) {
  settings.audio.enabled = enabled; audio.configure(settings.audio); controls.set(settings); controls.status('Unsaved changes');
  if (enabled) void audio.unlock();
}
function toggleSound() { setSoundEnabled(!settings.audio.enabled); }
function change(group, key, value) {
  const previous = structuredClone(settings);
  settings[group][key] = value;
  try {
    settings = validateSetup(settings);
    configure(group === 'camera'); controls.status('Unsaved changes');
    if (group === 'audio' && key === 'enabled' && value) audio.unlock().catch(error => controls.status(error.message, true));
  } catch (error) { settings = previous; configure(); controls.status(error.message, true); }
}
const controlActions = { settings, change,
  async save() {
    settings.camera = captureCameraView(camera, orbit, follow.position);
    const saved = await requestSetup('PUT', settings);
    controls.status(`${import.meta.env.PROD ? 'Saved on this device.' : 'Saved to public/settings.json.'} Sound ${saved.audio.enabled ? 'on' : 'off'}.`);
  },
  async reload() {
    const next = await requestSetup(); document.activeElement?.blur(); settings = next; rebuild(); configure(true); controls.syncPalette(); controls.status('Settings reloaded.');
  },
  reset() { settings = defaultSetup(); rebuild(); configure(true); controls.syncPalette(); controls.status('Default settings restored.'); },
  regenerate() { rebuild(); configure(true); },
  resetView() { settings.camera = { ...DEFAULT_CAMERA }; configure(true); },
  selectPalette(id) { settings.paletteId = id; configure(); },
  changeLibrary(library) { settings.paletteLibrary = library; configure(); },
  exportDrawing() {
    render();
    canvas.toBlob(blob => {
      if (!blob) { controls.status('Could not export the drawing.', true); return; }
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = '11-rust.png'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  },
  togglePlaying, toggleSound, setSoundEnabled,
};
controls = createControls(controlActions);
configure(true);
// Editors retain live references when cube dimensions rebuild the hull.
const editableMaterials = Object.fromEntries(materialGroups.map(([key]) => [key, null]));
for (const [key] of materialGroups) Object.defineProperty(editableMaterials, key, { enumerable: true, get: () => surface.materials[key] });
materialControls = bindMaterialControls(controls.element, editableMaterials, () => {
  settings.materials = materialControls.get(); settings = validateSetup(settings); configure(); controls.status('Unsaved changes');
});
lightingControls = bindLightingControls(controls.element, light, hemisphere, editableMaterials, () => settings.materials,
  () => { settings.lighting = lightingControls.get(); settings = validateSetup(settings); configure(); controls.status('Unsaved changes'); },
  effects.configure, () => {}, settings.lighting, spotlight, fill);
configure(true);
if (setupLoadError) controls.status(setupLoadError, true);
function releaseLaser() { surface?.setTarget(null, false); }
function targetLaser() {
  surface.setTarget(surface.automaticTarget(simulation.time), settings.motion.playing && !document.hidden);
}
// Pointer gestures belong entirely to OrbitControls. A gesture may unlock audio.
canvas.addEventListener('pointerdown', () => {
  if(settings.audio.enabled) void audio.unlock().catch(error=>controls.status(error.message,true));
});
function resize() {
  renderer.setSize(innerWidth, innerHeight, false); effects.resize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight;
  camera.fov = innerWidth < innerHeight ? 50 : 42;
  camera.zoom = Math.min(1, innerWidth / innerHeight); camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();
orbit.addEventListener('end', () => { settings.camera = captureCameraView(camera, orbit, follow.position); controls.set(settings); });
let previous = performance.now(), wasRunning = false, laserClock=.1, laserSerial=0;
renderer.setAnimationLoop(now => {
  const running = settings.motion.playing && !document.hidden, dt = wasRunning ? Math.min((now - previous) / 1000, 1 / 15) : 0;
  if (running) {
    const start = performance.now(); simulation.update(dt); simulationMilliseconds = performance.now() - start;
  }
  targetLaser();
  surface.update(camera,dt,running);
  const working = running && surface.working;
  const events=[];
  laserClock = working ? laserClock+dt : .1;
  if(working && laserClock >= .075) {
    laserClock=0; events.push({ from:-1e-6,to:0,duration:.16,serial:++laserSerial });
  }
  audio.update(dt,working,simulation.position,simulation.floor,events);
  wasRunning = running; previous = now;
  simulation.getCenter(focus);
  if (running) follow.update(camera, orbit, focus, true, false, dt, .45);
  orbit.update(); render(); controls.frame(simulation.stats, audio.modulation);
});
document.addEventListener('visibilitychange', () => {
  previous = performance.now(); wasRunning = false; releaseLaser();
  audio.update(0, false);
});
window.addEventListener('pagehide', () => {
  renderer.setAnimationLoop(null); audio.dispose(); lightingControls.dispose(); effects.dispose(); plate.dispose(); surface.dispose(); simulation.dispose(); orbit.dispose();
  floor.geometry.dispose(); floor.material.dispose();
  for(const source of [light,fill,spotlight])source.shadow.dispose();
  environment.dispose(); room.dispose(); pmrem.dispose(); renderer.dispose();
  window.removeEventListener('resize',resize);
}, { once: true });
window.__rustSketch = {
  getSetup: () => structuredClone(settings),
  getState: () => ({ ...simulation.stats, playing: settings.motion.playing, rust: surface.diagnostics,
    audioEngine: 'Strudel', audioUnlocked: audio.unlocked, audio: audio.diagnostics, simulationMilliseconds, revision }),
  renderer, scene, camera, orbit, effects, lights: { directional: light, hemisphere, spotlight, fill }, get simulation() { return simulation; }, get view() { return surface; },
  get audioAnalysis() { return audio.analysis; }, render, change, rebuild() { rebuild(); configure(true); },
  advance(seconds) { for (let i = 0; i < Math.round(seconds * 60); i++) { simulation.update(1 / 60); surface.update(camera); targetLaser(); surface.update(camera,1/60,true); } render(); },
  pause() { if (settings.motion.playing) togglePlaying(); },
  play() { if (!settings.motion.playing) togglePlaying(); },
};

// Reuse the existing drawer actions for the gallery's sketch-player:v1 contract.
Object.assign(window.__rustSketch, {
  reset() {
    controlActions.reset();
  },
  setup(value) {
    settings = validateSetup(value); rebuild(); configure(true); controls.syncPalette();
    return window.__rustSketch.getSetup();
  },
  async saveSetup() { await controlActions.save(); return window.__rustSketch.getSetup(); },
  async loadSetup() { await controlActions.reload(); return window.__rustSketch.getSetup(); },
});
const detachPlayerBridge = attachPlayerBridge(window.__rustSketch);
window.addEventListener('pagehide', detachPlayerBridge, { once: true });
