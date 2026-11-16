import { DataTexture, LinearFilter, RGBAFormat, Vector3 } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const TILE = 256, MASK_WIDTH = TILE * 3, MASK_HEIGHT = TILE * 2;
const GUTTER = 2 / TILE;
export function createRustGeometry(size, chamfer) {
  const geometry = new RoundedBoxGeometry(size, size, size, 6, chamfer);
  const uv = geometry.attributes.uv;
  for (const [face, group] of geometry.groups.entries()) {
    for (let i = group.start; i < group.start + group.count; i++) {
      uv.setXY(i, (face % 3 + GUTTER + uv.getX(i) * (1 - 2 * GUTTER)) / 3,
        (Math.floor(face / 3) + GUTTER + uv.getY(i) * (1 - 2 * GUTTER)) / 2);
    }
  }
  uv.needsUpdate = true;
  // One shader, six non-overlapping atlas islands (including curved edges).
  geometry.clearGroups(); return geometry;
}

export class RustMask {
  constructor(geometry, initial = .82) {
    const count = MASK_WIDTH * MASK_HEIGHT;
    this.amount = new Float32Array(count).fill(initial);
    this.points = new Float32Array(count * 3); this.normals = new Float32Array(count * 3);
    this.valid = new Uint8Array(count); this.data = new Uint8Array(count * 4);
    this.texture = new DataTexture(this.data, MASK_WIDTH, MASK_HEIGHT, RGBAFormat);
    this.texture.minFilter = this.texture.magFilter = LinearFilter;
    this.texture.generateMipmaps = false;
    this.rasterize(geometry); this.upload(); this.cleaned = 0;
  }
  rasterize(geometry) {
    const uv = geometry.attributes.uv, p = geometry.attributes.position, n = geometry.attributes.normal;
    for (let i = 0; i < p.count; i += 3) {
      const x = [0, 1, 2].map(j => uv.getX(i + j) * MASK_WIDTH - .5);
      const y = [0, 1, 2].map(j => uv.getY(i + j) * MASK_HEIGHT - .5);
      const denominator = (y[1] - y[2]) * (x[0] - x[2]) + (x[2] - x[1]) * (y[0] - y[2]);
      if (Math.abs(denominator) < 1e-10) continue;
      for (let py = Math.max(0, Math.floor(Math.min(...y))); py <= Math.min(MASK_HEIGHT - 1, Math.ceil(Math.max(...y))); py++) {
        for (let px = Math.max(0, Math.floor(Math.min(...x))); px <= Math.min(MASK_WIDTH - 1, Math.ceil(Math.max(...x))); px++) {
          const a = ((y[1] - y[2]) * (px - x[2]) + (x[2] - x[1]) * (py - y[2])) / denominator;
          const b = ((y[2] - y[0]) * (px - x[2]) + (x[0] - x[2]) * (py - y[2])) / denominator;
          const c = 1 - a - b;
          if (Math.min(a, b, c) < -1e-5) continue;
          const index = py * MASK_WIDTH + px; this.valid[index] = 1;
          for (let axis = 0; axis < 3; axis++) {
            this.points[index * 3 + axis] = p.array[i * 3 + axis] * a + p.array[(i + 1) * 3 + axis] * b + p.array[(i + 2) * 3 + axis] * c;
            this.normals[index * 3 + axis] = n.array[i * 3 + axis] * a + n.array[(i + 1) * 3 + axis] * b + n.array[(i + 2) * 3 + axis] * c;
          }
        }
      }
    }
  }
  // The raycast's interpolated atlas UV identifies the actual surface hit. A
  // local 3D brush footprint projects into every island it overlaps, so strokes
  // cross a chamfer seam without leaking onto the opposite face.
  step(dt, growth, hit, radius, power) {
    let removed = 0;
    const center = hit?.localPoint, normal = hit?.localNormal;
    const r2 = radius * radius;
    const previous = hit?.previousLocalPoint ?? center;
    const vx = center ? center.x - previous.x : 0, vy = center ? center.y - previous.y : 0, vz = center ? center.z - previous.z : 0;
    const length2 = vx*vx + vy*vy + vz*vz;
    for (let i = 0; i < this.amount.length; i++) {
      if (!this.valid[i]) continue;
      let amount = Math.min(1, this.amount[i] + growth * dt);
      if (center) {
        const k = i * 3;
        const t = length2 > 1e-12 ? Math.max(0,Math.min(1,((this.points[k]-previous.x)*vx+(this.points[k+1]-previous.y)*vy+(this.points[k+2]-previous.z)*vz)/length2)) : 1;
        const dx = this.points[k] - (previous.x+vx*t), dy = this.points[k+1] - (previous.y+vy*t), dz = this.points[k+2] - (previous.z+vz*t);
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < r2 && this.normals[k] * normal.x + this.normals[k + 1] * normal.y + this.normals[k + 2] * normal.z > .15) {
          const weight = 1 - d2 / r2, before = amount;
          amount = Math.max(0, amount - power * dt * Math.min(1, weight * 4)); removed += before - amount;
        }
      }
      this.amount[i] = amount;
    }
    this.cleaned += removed; this.upload(); return removed;
  }
  upload() {
    let total = 0, count = 0;
    for (let i = 0; i < this.amount.length; i++) {
      const v = Math.round(this.amount[i] * 255), k = i * 4;
      this.data[k] = this.data[k + 1] = this.data[k + 2] = v; this.data[k + 3] = 255;
      if (this.valid[i]) { total += this.amount[i]; count++; }
    }
    this.coverage = total / count; this.texture.needsUpdate = true;
  }
  valueAt(uv) {
    return this.amount[Math.min(MASK_HEIGHT - 1, Math.max(0, Math.floor(uv.y * MASK_HEIGHT))) * MASK_WIDTH + Math.min(MASK_WIDTH - 1, Math.max(0, Math.floor(uv.x * MASK_WIDTH)))];
  }
  dispose() { this.texture.dispose(); }
}
