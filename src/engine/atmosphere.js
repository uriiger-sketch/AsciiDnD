// Sun, moon, sky colours, exposure and weather: everything that decides what light there is.
// Driven by two things only - the hour of the day and a weather state.

import { clamp, lerp, smoothstep, v3 } from './math.js';

function grad(stops, x) {
  if (x <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i][0]) {
      const a = stops[i - 1], b = stops[i];
      const t = (x - a[0]) / (b[0] - a[0]);
      return typeof a[1] === 'number' ? lerp(a[1], b[1], t) : v3.lerp(a[1], b[1], t);
    }
  }
  return stops[stops.length - 1][1];
}

// Keyed on the sine of the sun's elevation.
const SUN_COL = [[-0.04, [1.0, 0.28, 0.07]], [0.0, [1.0, 0.36, 0.1]], [0.07, [1.0, 0.52, 0.22]], [0.2, [1.0, 0.76, 0.48]], [0.45, [1.0, 0.93, 0.8]], [1, [1.0, 0.97, 0.9]]];
const SUN_INT = [[-0.035, 0], [0.0, 0.42], [0.07, 0.95], [0.2, 1.15], [0.45, 1.25], [1, 1.3]];
const ZENITH = [[-0.3, [0.005, 0.009, 0.028]], [-0.1, [0.018, 0.028, 0.085]], [0.0, [0.065, 0.095, 0.27]], [0.1, [0.085, 0.19, 0.47]], [0.4, [0.075, 0.25, 0.6]], [1, [0.065, 0.23, 0.58]]];
const HORIZON = [[-0.3, [0.011, 0.019, 0.05]], [-0.13, [0.06, 0.045, 0.13]], [-0.045, [0.5, 0.15, 0.2]], [0.015, [1.0, 0.42, 0.14]], [0.12, [0.95, 0.63, 0.37]], [0.4, [0.62, 0.72, 0.82]], [1, [0.55, 0.7, 0.86]]];
const AMB_SKY = [[-0.3, [0.012, 0.019, 0.044]], [-0.08, [0.07, 0.07, 0.16]], [0.0, [0.16, 0.15, 0.27]], [0.12, [0.25, 0.27, 0.42]], [0.4, [0.27, 0.36, 0.52]], [1, [0.26, 0.36, 0.54]]];
const AMB_GND = [[-0.3, [0.004, 0.005, 0.009]], [0.0, [0.07, 0.04, 0.03]], [0.15, [0.2, 0.13, 0.08]], [1, [0.36, 0.26, 0.16]]];
const EXPOSURE = [[-0.3, 4.3], [-0.12, 3.6], [-0.03, 2.3], [0.05, 1.5], [0.2, 1.15], [1, 0.95]];

export const WEATHER = {
  clear: { cloud: 0.18, rain: 0, wind: 0.32, fog: 1.0, dust: 0.0, dim: 0.0, lightning: 0, wet: 0, heat: 1 },
  cloudy: { cloud: 0.6, rain: 0, wind: 0.45, fog: 1.3, dust: 0.0, dim: 0.25, lightning: 0, wet: 0, heat: 0.4 },
  dust: { cloud: 0.3, rain: 0, wind: 1.0, fog: 7.0, dust: 1.0, dim: 0.45, lightning: 0, wet: 0, heat: 0.6 },
  storm: { cloud: 1.0, rain: 1.0, wind: 0.85, fog: 3.2, dust: 0.0, dim: 0.72, lightning: 1, wet: 1, heat: 0 },
  drizzle: { cloud: 0.72, rain: 0, wind: 0.5, fog: 1.6, dust: 0.0, dim: 0.32, lightning: 0, wet: 0.55, heat: 0 },
  mist: { cloud: 0.35, rain: 0, wind: 0.12, fog: 9.0, dust: 0.0, dim: 0.2, lightning: 0, wet: 0.3, heat: 0 },
};

export class Atmosphere {
  constructor() {
    this.hour = 17.6;
    this.dayLength = 0; // seconds per full day; 0 = time stands still
    this.weatherName = 'clear';
    this.w = { ...WEATHER.clear };
    this.windDir = [0.86, 0.5];
    this.windPhase = 0;
    this.flash = 0;
    this.flashPos = [0, 400, 0];
    this.env = {};
    this.update(0);
  }

  setWeather(name, instant = false) {
    if (!WEATHER[name]) return;
    this.weatherName = name;
    if (instant) this.w = { ...WEATHER[name] };
  }

  sunDirAt(hour) {
    const th = ((hour / 24) * 2 - 0.5) * Math.PI;
    return v3.norm([Math.cos(th), Math.sin(th) * 0.84, Math.sin(th) * 0.54]);
  }

  update(dt) {
    if (this.dayLength > 0) this.hour = (this.hour + (dt * 24) / this.dayLength) % 24;
    const target = WEATHER[this.weatherName], w = this.w;
    const k = 1 - Math.exp(-dt * 0.55);
    for (const key in target) w[key] = lerp(w[key], target[key], k);
    this.windPhase += dt * (2 + w.wind * 7);
    this.flash *= Math.exp(-dt * 9);

    const sun = this.sunDirAt(this.hour);
    const th = ((this.hour / 24) * 2 - 0.5) * Math.PI + Math.PI * 0.87;
    const moon = v3.norm([Math.cos(th), Math.sin(th) * 0.8, -Math.sin(th) * 0.6]);
    const s = sun[1];
    const dim = w.dim;

    const sunInt = grad(SUN_INT, s) * (1 - dim * 0.92);
    const moonUp = smoothstep(-0.02, 0.12, moon[1]);
    const moonInt = 0.09 * moonUp * smoothstep(-0.02, -0.12, s) * (1 - dim * 0.8);
    let keyDir, keyCol, keyInt;
    if (sunInt > 0.0001) {
      keyDir = sun; keyCol = grad(SUN_COL, s); keyInt = sunInt;
    } else {
      keyDir = moon; keyCol = [0.56, 0.68, 1.0]; keyInt = moonInt;
    }
    const grey = (c, a) => {
      const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      return [lerp(c[0], l * 0.95, a), lerp(c[1], l, a), lerp(c[2], l * 1.08, a)];
    };
    let zen = grey(grad(ZENITH, s), dim * 0.8), hor = grey(grad(HORIZON, s), dim * 0.75);
    zen = v3.scale(zen, 1 - dim * 0.55);
    hor = v3.scale(hor, 1 - dim * 0.5);
    let ambSky = v3.scale(grey(grad(AMB_SKY, s), dim * 0.7), 1 - dim * 0.35);
    const ambGnd = v3.scale(grad(AMB_GND, s), 1 - dim * 0.4);
    // dust turns the whole world the colour of the ground
    const dustCol = v3.scale([0.62, 0.42, 0.24], 0.25 + 0.75 * smoothstep(-0.1, 0.3, s));
    hor = v3.lerp(hor, dustCol, w.dust * 0.8);
    zen = v3.lerp(zen, v3.scale(dustCol, 0.7), w.dust * 0.65);
    ambSky = v3.lerp(ambSky, v3.scale(dustCol, 0.5), w.dust * 0.5);

    const night = smoothstep(0.05, -0.16, s);
    const fogCol = v3.lerp(v3.lerp(hor, zen, 0.3), dustCol, w.dust * 0.5);
    const e = this.env;
    e.sun = sun; e.moon = moon; e.sunElev = s;
    e.keyDir = keyDir; e.keyCol = keyCol; e.keyInt = keyInt;
    e.ambSky = ambSky; e.ambGnd = ambGnd;
    e.zenith = zen; e.horizon = hor;
    e.fogCol = fogCol;
    e.fogDensity = 0.00011 * w.fog * (1 + 0.6 * smoothstep(0.12, -0.02, Math.abs(s - 0.03)));
    e.exposure = grad(EXPOSURE, s) * (1 + dim * 0.5);
    e.night = night;
    e.stars = smoothstep(-0.02, -0.2, s) * (1 - w.cloud * 0.5);
    e.sunVis = smoothstep(-0.09, -0.02, s);
    e.moonVis = smoothstep(-0.06, 0.03, moon[1]) * (0.25 + 0.75 * night);
    e.sunDisc = v3.scale(v3.lerp([1.0, 0.3, 0.06], [1.0, 0.93, 0.78], smoothstep(0.0, 0.4, s)), lerp(5.5, 11, smoothstep(0, 0.4, s)) * (1 - dim * 0.7));
    e.glow = v3.scale(grad(SUN_COL, s), (0.3 + 0.9 * smoothstep(-0.12, 0.1, s)) * (1 - dim * 0.8) * e.sunVis);
    e.sunRad = lerp(0.07, 0.04, smoothstep(0.0, 0.35, s));
    const lit = v3.add(v3.scale(keyCol, keyInt * 0.95), v3.scale(ambSky, 1.6));
    e.cloudLit = v3.scale(lit, 1 - dim * 0.45);
    e.cloudDark = v3.scale(v3.add(v3.scale(ambSky, 0.9), v3.scale(hor, 0.12)), 1 - dim * 0.6);
    e.heat = w.heat * smoothstep(0.3, 0.75, s);
    e.cloud = w.cloud; e.rain = w.rain; e.wind = w.wind; e.dust = w.dust; e.wet = w.wet;
    e.lightning = w.lightning;
    return e;
  }
}
