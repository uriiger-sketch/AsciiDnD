import { m4, v3, clamp } from './math.js';

// Orbit camera: looks at `target` from (yaw, pitch, dist). Never dips under the land.
export class Camera {
  constructor() {
    this.target = [0, 0, 0];
    this.yaw = 0; // radians, 0 = looking north (-z) from the south
    this.pitch = 0.6; // radians above the horizon plane
    this.dist = 80;
    this.fov = (38 * Math.PI) / 180;
    this.near = 0.6;
    this.far = 9000;
    this.eye = [0, 10, 10];
    this.view = m4.create();
    this.proj = m4.create();
    this.viewProj = m4.create();
    this.right = [1, 0, 0];
    this.up = [0, 1, 0];
    this.fwd = [0, 0, -1];
    this.roll = 0;
  }

  update(aspect, land) {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dir = [Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp];
    const eye = v3.add(this.target, v3.scale(dir, this.dist));
    if (land) {
      const h = land.heightAt(eye[0], eye[2]) + 1.4;
      if (eye[1] < h) eye[1] = h;
    }
    this.eye = eye;
    // widen the vertical field of view on tall screens so the land keeps its breadth
    const fovY = aspect < 1 ? 2 * Math.atan(Math.tan(this.fov / 2) / Math.max(aspect, 0.45) * 0.62) : this.fov;
    this.fovY = clamp(fovY, 0.2, 1.6);
    m4.lookAt(this.view, eye, this.target, [0, 1, 0]);
    m4.perspective(this.proj, this.fovY, aspect, this.near, this.far);
    m4.mul(this.viewProj, this.proj, this.view);
    const v = this.view;
    this.right = [v[0], v[4], v[8]];
    this.up = [v[1], v[5], v[9]];
    this.fwd = [-v[2], -v[6], -v[10]];
  }

  // world point -> [u, v] in 0..1 (or null if behind the camera)
  project(p) {
    const m = this.viewProj;
    const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    if (w <= 0.01) return null;
    const x = (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w;
    const y = (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w;
    return [x * 0.5 + 0.5, y * 0.5 + 0.5];
  }
}
