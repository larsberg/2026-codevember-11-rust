// Material schema and editor structure inherited from 02-shatter-drafting,
// with groups corresponding to this rig's actual rendered surfaces.
export const materialFields = [
  ['metalness', 'Metalness', 0, 1, .01, .65],
  ['roughness', 'Roughness', 0, 1, .005, .28],
  ['emissiveIntensity', 'Emission strength', 0, 5, .01, 0],
  ['envMapIntensity', 'Environment intensity', 0, 3, .01, 1],
  ['opacity', 'Opacity', 0, 1, .005, 1],
];
export const materialFieldsFor = group => group === 'panels'
  ? materialFields.map(field => field[0] === 'opacity' ? [field[0], 'Metal opacity', ...field.slice(2)] : field) : materialFields;
export const materialGroups = [['panels', 'Clean metal'], ['struts', 'Rust'], ['pistons', 'Powder-coated lamp'], ['joints', 'Lamp joints and springs']];
export function defaultMaterials() {
  const defaults = Object.fromEntries(materialGroups.map(([group]) => [group, {
    ...Object.fromEntries(materialFieldsFor(group).map(([key,,,,,value]) => [key, value])),
    color: '#ffffff', emissive: '#ffffff', wireframe: false, flatShading: false,
  }]));
  Object.assign(defaults.struts, { color: '#a34419', roughness: .95, metalness: .03 });
  Object.assign(defaults.pistons, { color: '#111416', roughness: .78, metalness: .06 });
  Object.assign(defaults.joints, { color: '#181b1d', roughness: .72, metalness: .12 });
  Object.assign(defaults.panels, { color: '#c2cad0', roughness: .24, metalness: .96, opacity: 1,
    envMapIntensity: 1, depthWrite: true });
  return defaults;
}
export function validateMaterials(value) {
  const result = defaultMaterials();
  for (const [group, defaults] of Object.entries(result)) for (const [key, initial] of Object.entries(defaults)) {
    const field = value?.[group]?.[key] ?? initial, range = materialFieldsFor(group).find(([name]) => name === key);
    const valid = range ? Number.isFinite(field) && field >= range[2] && field <= range[3]
      : typeof initial === 'boolean' ? typeof field === 'boolean' : typeof field === 'string' && /^#[0-9a-f]{6}$/i.test(field);
    if (!valid) throw Error(`Invalid materials.${group}.${key}.`);
    result[group][key] = typeof field === 'string' ? field.toLowerCase() : field;
  }
  // Flat-shaded derivatives would put a separate normal on each triangle.
  result.panels.flatShading = false;
  return result;
}

export function applyMaterialSettings(material, values, group) {
  const flatShading = group === 'panels' ? false : values.flatShading;
  const transparent = values.opacity < 1;
  if (material.flatShading !== flatShading || material.transparent !== transparent) material.needsUpdate = true;
  material.transparent = transparent; material.depthWrite = group === 'panels' ? values.depthWrite : !transparent;
  material.color.set(values.color); material.emissive.set(values.emissive);
  material.wireframe = values.wireframe; material.flatShading = flatShading;
  for (const [key] of materialFieldsFor(group)) material[key] = values[key];
  if (group === 'panels') {
    material.forceSinglePass = true;
  }
}
