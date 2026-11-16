import { Object3D, Vector3 } from 'three';
import { createPhysics } from './physics.js';
import { createRustGeometry } from './rust-mask.js';
export { initPhysics } from './physics.js';
export class RustSimulation {
  constructor(settings) {
    this.floor = 0; this.time = 0; this.object = new Object3D();
    const size = settings.rust.size;
    this.object.position.y = size / 2 + .015;
    this.geometry = createRustGeometry(size, settings.rust.chamfer);
    // The actual chamfered hull owns the pose; raycasting uses its visual twin.
    this.physics = createPhysics(settings.physics);
    this.ground = this.physics.addBody({ body: { type: 'static', position: { x: 0, y: -.5, z: 0 } }, shapes: [{ type: 'box', halfExtents: { x: 100, y: .5, z: 100 } }] });
    const unique = new Map(), p = this.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const point = new Vector3().fromBufferAttribute(p, i);
      unique.set(point.toArray().map(v => v.toFixed(5)).join(','), point);
    }
    this.entry = this.physics.addBody({ object: this.object,
      body: { type: 'dynamic', linearDamping: .35, angularDamping: .6 },
      shapes: [{ type: 'hull', points: [...unique.values()], density: settings.physics.mass, restitution: 0 }] });
    this.position = new Float64Array(48); this.configure(settings); this.sync();
  }
  configure(settings) {
    this.settings = settings; this.physics.configure(settings.physics);
    this.entry.body.setLinearDamping(settings.physics.damping);
    this.entry.shapes[0].setDensity(settings.physics.mass, false); this.entry.body.applyMassFromShapes();
  }
  sync() { for (let i = 0; i < 16; i++) this.position.set(this.object.position.toArray(), i * 3); }
  update(dt) { this.time += dt; this.physics.step(dt); this.sync(); }
  getCenter(target) { return target.copy(this.object.position); }
  get stats() { return { bodies: 2, physicsEngine: 'Box3D', time: this.time }; }
  dispose() { this.physics.dispose(); this.geometry.dispose(); }
}
