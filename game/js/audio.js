// audio.js — every sound is synthesized live with WebAudio: no audio files.
// Engine hum, sirens, gunshots, chimes and a slow chord-pad score.
window.SB = window.SB || {};
(function () {
  'use strict';

  let ctx = null;        // created on the first user gesture (autoplay policy)
  let master = null;
  let muted = false;
  let engineNodes = null;
  let sirenNodes = null;
  let musicNodes = null;
  let musicTimer = 0;
  let chordIndex = 0;

  // Warm, slow chord progression for the ambient score (frequencies in Hz).
  const CHORDS = [
    [130.81, 164.81, 196.00, 246.94], // Cmaj7
    [110.00, 164.81, 196.00, 220.00], // Am7
    [87.31, 130.81, 164.81, 196.00],  // Fmaj7
    [98.00, 146.83, 196.00, 246.94]   // G6
  ];

  function ensureContext() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      return true;
    } catch (e) {
      return false;
    }
  }

  function noiseBuffer(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function blip(freqA, freqB, seconds, type, gain) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freqA, t);
    if (freqB) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqB), t + seconds);
    g.gain.setValueAtTime(gain || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + seconds + 0.05);
  }

  function playChord(freqs) {
    if (!ctx) return;
    const t = ctx.currentTime;
    musicNodes = musicNodes || [];
    freqs.forEach(function (f) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = f;
      osc.detune.value = (Math.random() - 0.5) * 8;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.05, t + 1.5);
      g.gain.linearRampToValueAtTime(0.0001, t + 8);
      osc.connect(g);
      g.connect(master);
      osc.start(t);
      osc.stop(t + 8.2);
      musicNodes.push(osc);
    });
  }

  SB.audio = {
    /** Call from a click or keydown; safe to call repeatedly. */
    init: function () { ensureContext(); },

    setMuted: function (m) {
      muted = !!m;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted: function () { return muted; },

    /** Continuous engine drone; speed01 is 0..1. Call with on=false to stop. */
    engine: function (on, speed01) {
      if (!ctx) return;
      if (!on) {
        if (engineNodes) {
          try { engineNodes.osc.stop(); } catch (e) {}
          engineNodes = null;
        }
        return;
      }
      if (!engineNodes) {
        const osc = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const g = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        osc.type = 'sawtooth';
        osc2.type = 'square';
        filter.type = 'lowpass';
        filter.frequency.value = 320;
        g.gain.value = 0.05;
        osc.connect(filter);
        osc2.connect(filter);
        filter.connect(g);
        g.connect(master);
        osc.start();
        osc2.start();
        engineNodes = { osc: osc, osc2: osc2, gain: g, filter: filter };
      }
      const base = 55 + speed01 * 130;
      engineNodes.osc.frequency.value = base;
      engineNodes.osc2.frequency.value = base * 0.5 + 1;
      engineNodes.filter.frequency.value = 280 + speed01 * 900;
      engineNodes.gain.gain.value = 0.04 + speed01 * 0.05;
    },

    /** Two-tone police siren loop. */
    siren: function (on) {
      if (!ctx) return;
      if (!on) {
        if (sirenNodes) {
          try { sirenNodes.osc.stop(); } catch (e) {}
          sirenNodes = null;
        }
        return;
      }
      if (!sirenNodes) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = 720;
        g.gain.value = 0.045;
        osc.connect(g);
        g.connect(master);
        osc.start();
        sirenNodes = { osc: osc, phase: 0 };
      }
    },

    /** Called every frame while the siren runs: flips the tone twice a second. */
    update: function (dt) {
      if (sirenNodes && ctx) {
        sirenNodes.phase += dt;
        const hi = Math.floor(sirenNodes.phase * 2) % 2 === 0;
        sirenNodes.osc.frequency.setTargetAtTime(hi ? 740 : 540, ctx.currentTime, 0.03);
      }
      if (ctx && musicTimer !== null) {
        musicTimer -= dt;
        if (musicTimer <= 0) {
          playChord(CHORDS[chordIndex % CHORDS.length]);
          chordIndex++;
          musicTimer = 7.5;
        }
      }
    },

    shot: function () {
      if (!ctx) return;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(0.12);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3000, t);
      filter.frequency.exponentialRampToValueAtTime(300, t + 0.1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      src.connect(filter);
      filter.connect(g);
      g.connect(master);
      src.start(t);
      blip(160, 40, 0.09, 'sine', 0.3);
    },

    punch: function () { blip(140, 55, 0.12, 'sine', 0.35); },
    crash: function () {
      if (!ctx) return;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(0.25);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.35, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      src.connect(g);
      g.connect(master);
      src.start(t);
    },
    chime: function () { blip(880, null, 0.12, 'sine', 0.2); setTimeout(function () { blip(1318, null, 0.18, 'sine', 0.18); }, 90); },
    click: function () { blip(600, null, 0.05, 'square', 0.06); },
    denied: function () { blip(220, 160, 0.15, 'square', 0.1); },
    missionPass: function () {
      const notes = [523, 659, 784, 1047];
      notes.forEach(function (f, i) {
        setTimeout(function () { blip(f, null, 0.25, 'triangle', 0.22); }, i * 130);
      });
    },
    wantedUp: function () { blip(330, 440, 0.2, 'square', 0.08); },
    busted: function () { blip(392, 196, 0.7, 'sawtooth', 0.12); }
  };
})();
