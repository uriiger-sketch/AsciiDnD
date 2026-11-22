// Small deterministic noise toolkit for world generation (CPU side).

function h2(ix, iy, s) {
  let n = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(s, 1274126177)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}

export function hash01(ix, iy, s = 0) {
  return h2(ix, iy, s) / 4294967296;
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

// 256 unit gradients; the hash picks one (much cheaper than trig per lattice corner)
const GX = new Float32Array(256), GY = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const a = (i / 256) * 6.283185307179586 + 0.1;
  GX[i] = Math.cos(a) * 1.41;
  GY[i] = Math.sin(a) * 1.41;
}

// Gradient noise, about [-1, 1].
export function gnoise(x, y, s = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const u = fade(fx), v = fade(fy);
  const base = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(s, 1274126177)) | 0;
  let n = Math.imul(base ^ (base >>> 13), 1274126177);
  const h0 = (n ^ (n >>> 16)) & 255;
  n = (base + 374761393) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177);
  const h1 = (n ^ (n >>> 16)) & 255;
  n = (base + 668265263) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177);
  const h2 = (n ^ (n >>> 16)) & 255;
  n = (base + 1043027656) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177);
  const h3 = (n ^ (n >>> 16)) & 255;
  const a = GX[h0] * fx + GY[h0] * fy, b = GX[h1] * (fx - 1) + GY[h1] * fy;
  const c = GX[h2] * fx + GY[h2] * (fy - 1), d = GX[h3] * (fx - 1) + GY[h3] * (fy - 1);
  return a + (b - a) * u + (c - a + (a - b - c + d) * u) * v;
}

export function fbm(x, y, oct = 5, s = 0, lac = 2.03, gain = 0.5) {
  let a = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += a * gnoise(x * f, y * f, s + i * 17);
    norm += a;
    a *= gain;
    f *= lac;
  }
  return sum / norm;
}

// Ridged multifractal in [0,1]: sharp crests (dunes, eroded rock).
export function ridged(x, y, oct = 4, s = 0, lac = 2.1, gain = 0.5) {
  let a = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    const n = 1 - Math.abs(gnoise(x * f, y * f, s + i * 31));
    sum += a * n * n;
    norm += a;
    a *= gain;
    f *= lac;
  }
  return sum / norm;
}

// Tileable RGBA value-noise texture (each channel an independent fbm), used by shaders for
// wind gusts, clouds, micro relief and grass patchiness.
export function noiseTextureData(size = 256, base = 8) {
  const data = new Uint8Array(size * size * 4);
  const tmp = new Float32Array(size * size);
  for (let ch = 0; ch < 4; ch++) {
    tmp.fill(0);
    let amp = 0.5, norm = 0;
    for (let o = 0; o < 5; o++) {
      const cells = base << o;
      const cs = size / cells;
      for (let y = 0; y < size; y++) {
        const gy = y / cs, iy = Math.floor(gy), fy = fade(gy - iy);
        const y0 = iy % cells, y1 = (iy + 1) % cells;
        for (let x = 0; x < size; x++) {
          const gx = x / cs, ix = Math.floor(gx), fx = fade(gx - ix);
          const x0 = ix % cells, x1 = (ix + 1) % cells;
          const s = ch * 101 + o * 13 + 5;
          const a = hash01(x0, y0, s), b = hash01(x1, y0, s), c = hash01(x0, y1, s), d = hash01(x1, y1, s);
          tmp[y * size + x] += amp * (a + (b - a) * fx + (c - a + (a - b - c + d) * fx) * fy);
        }
      }
      norm += amp;
      amp *= 0.5;
    }
    // stretch contrast so the texture uses the full 0..1 range
    let mn = 1e9, mx = -1e9;
    for (let i = 0; i < tmp.length; i++) {
      const v = tmp[i] / norm;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    for (let i = 0; i < tmp.length; i++) {
      data[i * 4 + ch] = Math.round((255 * (tmp[i] / norm - mn)) / (mx - mn));
    }
  }
  return data;
}
