import { Color, Mesh, PlaneGeometry, ShaderLib, ShaderMaterial, UniformsUtils, Vector3 } from 'three';

export function createPaperFloor(background) {
  const shader = ShaderLib.shadow, uniforms = UniformsUtils.clone(shader.uniforms);
  uniforms.color.value.set('#475363'); uniforms.opacity.value = .24;
  uniforms.paperColor = { value: new Color(background) };
  // Composite paper and shadow in one opaque surface. Two nearly coplanar
  // planes compete for depth at the shallow, distant camera views.
  const material = new ShaderMaterial({ uniforms, lights: true, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2,
    vertexShader: shader.vertexShader,
    fragmentShader: `uniform vec3 paperColor;\n${shader.fragmentShader}`.replace(
      'vec4( color, opacity * ( 1.0 - getShadowMask() ) )',
      'vec4( mix( paperColor, color, opacity * ( 1.0 - getShadowMask() ) ), 1.0 )'),
  });
  const floor = new Mesh(new PlaneGeometry(20000, 20000), material);
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.05; floor.receiveShadow = true;
  return floor;
}

export function createShadowFollow(light, getOffset = () => new Vector3(-8, 24, 12)) {
  const offset = new Vector3(-8, 24, 12), forward = offset.clone().normalize();
  const right = new Vector3().crossVectors(new Vector3(0, 1, 0), forward).normalize();
  const up = new Vector3().crossVectors(forward, right), anchor = new Vector3();
  return position => {
    offset.copy(getOffset()); forward.copy(offset).normalize();
    right.crossVectors(new Vector3(0, 1, 0), forward);
    if (right.lengthSq() < 1e-8) right.set(1, 0, 0); else right.normalize();
    up.crossVectors(forward, right); anchor.copy(position);
    const { camera, mapSize } = light.shadow;
    const dx = (camera.right - camera.left) / (camera.zoom * mapSize.x);
    const dy = (camera.top - camera.bottom) / (camera.zoom * mapSize.y);
    // Keep the shadow texel grid fixed in world space as the camera follows.
    // Otherwise every tiny camera movement resamples the cast silhouette.
    light.target.position.copy(right).multiplyScalar(Math.round(anchor.dot(right) / dx) * dx)
      .addScaledVector(up, Math.round(anchor.dot(up) / dy) * dy)
      .addScaledVector(forward, anchor.dot(forward));
    light.position.copy(light.target.position).add(offset);
  };
}
