// utils.js — small shared helpers: seeded random numbers, math and formatting.
// Solmar Bay is an original game: its city, names, story and art are all our own.
window.SB = window.SB || {};
(function () {
  'use strict';

  /** Deterministic PRNG (mulberry32) so the city looks the same on every load. */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  /** Frame-rate independent exponential approach. */
  function damp(a, b, lambda, dt) { return lerp(a, b, 1 - Math.exp(-lambda * dt)); }
  function angleDiff(a, b) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
  function angleLerp(a, b, t) { return a + angleDiff(a, b) * t; }
  function dist2D(ax, az, bx, bz) { const dx = bx - ax, dz = bz - az; return Math.sqrt(dx * dx + dz * dz); }

  function fmtMoney(n) { return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  function fmtClock(minutes) {
    const h = Math.floor(minutes / 60) % 24;
    const m = Math.floor(minutes % 60);
    return (h < 10 ? '0' + h : '' + h) + ':' + (m < 10 ? '0' + m : '' + m);
  }

  SB.utils = {
    mulberry32: mulberry32,
    clamp: clamp,
    lerp: lerp,
    damp: damp,
    angleDiff: angleDiff,
    angleLerp: angleLerp,
    dist2D: dist2D,
    fmtMoney: fmtMoney,
    fmtClock: fmtClock,
    TAU: Math.PI * 2
  };

  // ---- world layout constants (shared by city, traffic, minimap) ----
  // Roads run on a grid: 8 north-south roads and 8 east-west roads.
  const PITCH = 58;      // distance between neighbouring road centrelines
  const ROAD_W = 14;     // asphalt width
  const ROADS = [];
  for (let i = 0; i < 8; i++) ROADS.push((i - 3.5) * PITCH); // -203 .. 203
  SB.config = {
    PITCH: PITCH,
    ROAD_W: ROAD_W,
    ROADS: ROADS,
    CITY_HALF: 232,       // playable city edge (blocks end here)
    WORLD_HALF: 320,      // hard world edge (water / hills beyond)
    BEACH_X: 246,         // sand starts here (east side)
    WATER_X: 272,         // water starts here
    SAVE_KEY: 'solmar-bay-save-v1',
    START_TIME_MINUTES: 16 * 60 + 20 // golden afternoon
  };
})();
