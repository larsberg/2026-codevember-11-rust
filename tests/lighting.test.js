import test from 'node:test';
import assert from 'node:assert/strict';
import { Color, DirectionalLight, HemisphereLight, MeshStandardMaterial, PerspectiveCamera, Scene, SpotLight, Vector3 } from 'three';
import { defaultSetup, validateSetup } from '../src/settings.js';
import { materialGroups } from '../src/material-settings.js';
import { bindLightingControls, lightingControlsMarkup } from '../src/lighting-controls.js';
import { bindMaterialControls, materialControlsMarkup } from '../src/material-controls.js';
import { createShadowFollow } from '../src/shadows.js';
import { createSceneEffects } from '../src/scene-effects.js';

// Small event adapter for the real editor markup. These tests exercise input →
// Three.js object wiring without claiming to verify browser layout or shaders.
function editorRoot(markup) {
  const inputs = new Map(), outputs = new Map();
  for (const [tag] of markup.matchAll(/<input\b[^>]*>/g)) {
    const attributes = Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]));
    const listeners = new Map(), input = { ...attributes, checked: /\bchecked\b/.test(tag),
      addEventListener(type, listener) { listeners.set(type, listener); },
      edit(value) { if (this.type === 'checkbox') this.checked = value; else this.value = String(value); listeners.get('input')(); },
    };
    inputs.set(input.id, input); outputs.set(input.id, { value: '' });
  }
  return { inputs, querySelector(selector) {
    if (selector.startsWith('#')) return inputs.get(selector.slice(1)) ?? null;
    return outputs.get(selector.match(/label\[for="([^"]+)"\] output/)?.[1]) ?? null;
  } };
}

test('inherited lighting inputs apply to actual lights, follow travel, and restore saved values', () => {
  const setup = defaultSetup(), root = editorRoot(lightingControlsMarkup());
  const key = new DirectionalLight(), hemisphere = new HemisphereLight(), spot = new SpotLight(), fill = new DirectionalLight();
  const materials = Object.fromEntries(materialGroups.map(([name]) => [name, new MeshStandardMaterial()]));
  let changes = 0, occlusion;
  const controls = bindLightingControls(root, key, hemisphere, materials, () => setup.materials,
    () => changes++, value => { occlusion = structuredClone(value); }, () => {}, setup.lighting, spot, fill);
  const edit = (id, value) => root.inputs.get(`lighting-${id}`).edit(value);
  edit('directional-intensity', 5); edit('directional-color', '#ff8844'); edit('directional-offsetX', 13);
  edit('directional-softness', 7); edit('directional-shadowBias', -.00015); edit('directional-castShadow', false);
  edit('spotlight-enabled', true); edit('spotlight-angle', 32); edit('spotlight-penumbra', .8);
  edit('fill-intensity', 2.5); edit('hemisphere-groundColor', '#2266aa'); edit('hemisphere-tilt', 90);
  edit('environment-intensity', 2.2); edit('environment-rotation', 90); edit('occlusion-enabled', true);
  assert.equal(changes, 15); assert.equal(key.intensity, 5); assert.ok(key.color.equals(new Color('#ff8844')));
  assert.equal(key.castShadow, false); assert.equal(key.shadow.radius, 7); assert.equal(key.shadow.bias, -.00015);
  assert.equal(spot.visible, true); assert.equal(spot.angle, 32 * Math.PI / 180); assert.equal(spot.penumbra, .8);
  assert.equal(fill.intensity, 2.5); assert.ok(hemisphere.groundColor.equals(new Color('#2266aa')));
  assert.ok(Math.abs(hemisphere.position.y) < 1e-10); assert.equal(occlusion.enabled, true);
  const center = new Vector3(40, 4, -25); controls.updatePosition(center);
  for (const [name, light] of [['directional', key], ['spotlight', spot], ['fill', fill]]) {
    const value = controls.get()[name];
    assert.ok(light.target.position.equals(center));
    assert.deepEqual(light.position.clone().sub(center).toArray(), [value.offsetX, value.height, value.offsetZ]);
  }
  assert.equal(materials.struts.envMapIntensity, 2.2); assert.equal(materials.struts.envMapRotation.y, Math.PI / 2);
  const saved = controls.get();
  controls.set(defaultSetup().lighting); assert.equal(spot.visible, defaultSetup().lighting.spotlight.enabled); assert.equal(key.intensity, defaultSetup().lighting.directional.intensity);
  controls.set(saved); assert.deepEqual(controls.get(), saved); assert.equal(key.intensity, 5);
  edit('environment-enabled', false); assert.ok(Object.values(materials).every(material => material.envMapIntensity === 0));
  edit('directional-enabled', false); edit('fill-enabled', false); edit('hemisphere-enabled', false);
  assert.equal(key.visible || fill.visible || hemisphere.visible, false);
  for (const material of Object.values(materials)) material.dispose();
});

test('material editors and reflections keep addressing the live materials after a rig rebuild', () => {
  const setup = defaultSetup(), root = editorRoot(materialControlsMarkup());
  let materials = Object.fromEntries(materialGroups.map(([name]) => [name, new MeshStandardMaterial()]));
  const references = Object.fromEntries(materialGroups.map(([name]) => [name, null]));
  for (const [name] of materialGroups) Object.defineProperty(references, name, { get: () => materials[name] });
  const editor = bindMaterialControls(root, references, () => { setup.materials = editor.get(); });
  editor.set(setup.materials);
  root.inputs.get('material-struts-roughness').edit(.87);
  root.inputs.get('material-panels-opacity').edit(.25);
  root.inputs.get('material-joints-emissive').edit('#ff0088');
  root.inputs.get('material-joints-emissiveIntensity').edit(2);
  root.inputs.get('material-struts-emissive').edit('#ffaa33');
  root.inputs.get('material-struts-emissiveIntensity').edit(2.3);
  root.inputs.get('material-pistons-emissive').edit('#33aaff');
  root.inputs.get('material-pistons-emissiveIntensity').edit(1.4);
  root.inputs.get('material-panels-color').edit('#fefefe');
  root.inputs.get('material-struts-wireframe').edit(true);
  const saved = editor.get();
  const lighting = bindLightingControls(editorRoot(lightingControlsMarkup()), new DirectionalLight(), new HemisphereLight(), references,
    () => setup.materials, () => {}, () => {}, () => {}, setup.lighting);
  for (const material of Object.values(materials)) material.dispose();
  materials = Object.fromEntries(materialGroups.map(([name]) => [name, new MeshStandardMaterial()]));
  editor.set(saved); setup.lighting.environment.intensity = .7; lighting.set(setup.lighting);
  assert.equal(materials.struts.roughness, .87); assert.equal(materials.struts.wireframe, true);
  assert.equal(materials.panels.opacity, .25); assert.equal(materials.panels.transparent, true); assert.equal(materials.panels.depthWrite, true);
  assert.equal(materials.joints.emissiveIntensity, 2); assert.equal(editor.get().panels.color, '#fefefe');
  assert.ok(materials.panels.color.equals(new Color('#fefefe')));
  assert.ok(materials.struts.emissive.equals(new Color('#ffaa33'))); assert.equal(materials.struts.emissiveIntensity, 2.3);
  assert.ok(materials.pistons.emissive.equals(new Color('#33aaff'))); assert.equal(materials.pistons.emissiveIntensity, 1.4);
  assert.equal('transmission' in materials.panels, false);
  assert.doesNotMatch(materialControlsMarkup(), /transmission|ior|thickness|attenuation|clearcoat|dispersion|Refraction|Glass/);
  assert.ok(materials.joints.emissive.equals(new Color('#ff0088'))); assert.equal(materials.struts.envMapIntensity, .7);
  editor.set(defaultSetup().materials); assert.equal(materials.struts.roughness, defaultSetup().materials.struts.roughness); assert.equal(materials.struts.wireframe, false);
  assert.equal(materials.panels.opacity, 1); assert.equal(materials.struts.emissiveIntensity, 0);
  assert.equal(materials.pistons.emissiveIntensity, 0); assert.deepEqual(editor.get(), defaultSetup().materials);
  for (const material of Object.values(materials)) material.dispose();
});

test('shadow following respects edited light direction, including a directly overhead light', () => {
  const light = new DirectionalLight(), offset = new Vector3(13, 22, -9), center = new Vector3(101, 3, -41);
  const follow = createShadowFollow(light, () => offset);
  for (const value of [offset.clone(), new Vector3(0, 20, 0), new Vector3(-8, 2, 19)]) {
    offset.copy(value); center.addScalar(5); follow(center);
    assert.ok(light.position.clone().sub(light.target.position).distanceTo(offset) < 1e-10);
    assert.ok(light.target.position.distanceTo(center) < .01);
    assert.ok(light.position.toArray().every(Number.isFinite));
  }
});

test('AO, bloom and tilt blur configure real passes; turning them off restores direct rendering', () => {
  let directRenders = 0;
  const scene = new Scene(), camera = new PerspectiveCamera();
  const renderer = { capabilities: { maxSamples: 4 }, getPixelRatio: () => 1.5,
    render(s, c) { assert.equal(s, scene); assert.equal(c, camera); directRenders++; } };
  const effects = createSceneEffects(renderer, scene, camera, { clampBeauty: false }), setup = defaultSetup(); setup.lighting.occlusion.enabled=false; setup.bloom.enabled=false;
  try {
    effects.configure(setup.lighting.occlusion); effects.configureBloom(setup.bloom); effects.configureFocus(setup.focus);
    effects.render(); assert.equal(directRenders, 1);
    effects.configure({ enabled: true, intensity: 2, radius: 1.3, aoOnly: false });
    assert.equal(effects.ao.enabled, true); assert.equal(effects.ao.gtaoMaterial.uniforms.radius.value, 1.3);
    effects.configureBloom({ enabled: true, strength: 2.5, radius: .3, threshold: .7 });
    assert.equal(effects.bloom.enabled, true); assert.equal(effects.bloom.strength, 2.5); assert.equal(effects.bloom.threshold, .7);
    effects.configureFocus({ enabled: true, tilt: 30, band: .1, strength: 4, offset: -.2 }); effects.resize(800, 600);
    for (const pass of effects.focus.passes) {
      assert.equal(pass.enabled, true); assert.equal(pass.uniforms.strength.value, 4);
      assert.equal(pass.uniforms.offset.value, -.2); assert.ok(Math.abs(pass.uniforms.normal.value.x + .5) < 1e-10);
      assert.deepEqual(pass.uniforms.resolution.value.toArray(), [800, 600]);
    }
    assert.equal(effects.ao.width, 600); assert.equal(effects.ao.height, 450);
    effects.configure(setup.lighting.occlusion); effects.configureBloom(setup.bloom); effects.configureFocus(setup.focus);
    effects.render(); assert.equal(directRenders, 2);
  } finally { effects.dispose(); }
});
