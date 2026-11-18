// hud.js — everything drawn over the game: wanted stars, money, health,
// the minimap, objectives, phone messages, banners and the menu screens.
window.SB = window.SB || {};
(function () {
  'use strict';
  const U = SB.utils;

  let el = {};
  let mapCtx = null;
  let objective = { text: '', x: null, z: null };
  let hintOverride = { text: '', frame: -1 };
  let damageOpacity = 0;
  let wantedFlashTimer = 0;
  let bannerTimer = 0;

  function $(id) { return document.getElementById(id); }

  function drawMinimap() {
    if (!mapCtx) return;
    const S = 190; // canvas size
    const W = 640; // world span shown
    const k = S / W;
    const px = function (x) { return (x + 320) * k; };
    const pz = function (z) { return (z + 320) * k; };
    const g = mapCtx;
    // Base: dark city green.
    g.fillStyle = '#1d2b1d';
    g.fillRect(0, 0, S, S);
    // Water + beach on the east.
    g.fillStyle = '#2e7f9e';
    g.fillRect(px(272), 0, S - px(272), S);
    g.fillStyle = '#c9b078';
    g.fillRect(px(238), 0, px(272) - px(238), S);
    // Blocks.
    g.fillStyle = '#2c422c';
    const R = SB.config.ROADS;
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        g.fillRect(px(R[i] + 7), pz(R[j] + 7), px(R[i + 1] - 7) - px(R[i] + 7), pz(R[j + 1] - 7) - pz(R[j] + 7));
      }
    }
    // Roads.
    g.strokeStyle = '#8a8f96';
    g.lineWidth = Math.max(2, 14 * k);
    R.forEach(function (r) {
      g.beginPath(); g.moveTo(px(r), pz(-232)); g.lineTo(px(r), pz(232)); g.stroke();
      g.beginPath(); g.moveTo(px(-232), pz(r)); g.lineTo(px(232), pz(r)); g.stroke();
    });
    // Mission beacon.
    const bp = SB.missions.beaconPos;
    if (bp) {
      const pulse = 3 + Math.sin(performance.now() * 0.006) * 1.5;
      g.fillStyle = '#ffd75e';
      g.save();
      g.translate(px(bp.x), pz(bp.z));
      g.rotate(Math.PI / 4);
      g.fillRect(-pulse, -pulse, pulse * 2, pulse * 2);
      g.restore();
    }
    // Cop cars: flashing blue/red dots.
    const flashBlue = Math.floor(performance.now() / 300) % 2 === 0;
    SB.police.copCars.forEach(function (c) {
      const p = c.group.position;
      g.fillStyle = flashBlue ? '#3a7bff' : '#ff3a3a';
      g.beginPath(); g.arc(px(p.x), pz(p.z), 3.2, 0, U.TAU); g.fill();
    });
    // Enemies: red dots.
    SB.pedestrians.list.forEach(function (p) {
      if (!p.isEnemy || p.dead) return;
      const pp = p.parts.group.position;
      g.fillStyle = '#ff4040';
      g.beginPath(); g.arc(px(pp.x), pz(pp.z), 2.6, 0, U.TAU); g.fill();
    });
    // Nearby traffic: small white dots.
    const pp = SB.G.playerPos;
    SB.vehicles.list.forEach(function (c) {
      if (c.driver === 'player') return;
      const cp = c.group.position;
      if (U.dist2D(pp.x, pp.z, cp.x, cp.z) > 120) return;
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.fillRect(px(cp.x) - 1.5, pz(cp.z) - 1.5, 3, 3);
    });
    // Player arrow.
    g.save();
    g.translate(px(pp.x), pz(pp.z));
    g.rotate(Math.PI - SB.G.playerHeading);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#222222';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, -7);
    g.lineTo(5, 5);
    g.lineTo(0, 2.5);
    g.lineTo(-5, 5);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    // North.
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.font = 'bold 11px Arial';
    g.textAlign = 'center';
    g.fillText('N', S / 2, 12);
  }

  function contextualHint() {
    if (SB.G.state !== 'playing') return '';
    const P = SB.player;
    if (P.inCar) {
      if (P.inCar.isTaxi) return 'W/S drive  •  Space handbrake  •  E leave taxi';
      return 'W/S drive  •  A/D steer  •  Space handbrake  •  E exit car';
    }
    const pos = P.parts.group.position;
    const car = SB.vehicles.nearestCar(pos.x, pos.z, 5);
    if (car) return 'E — steal car  •  F punch  •  ' + (P.weapon === 'pistol' ? 'Click shoot  •  R reload' : 'finish Mission 1 to earn a pistol');
    if (P.weapon === 'pistol') return 'Click shoot  •  R reload  •  F punch  •  Shift run  •  Space jump';
    return 'WASD move  •  Shift run  •  Space jump  •  F punch  •  E enter car';
  }

  SB.hud = {
    init: function (callbacks) {
      el = {
        hud: $('hud'),
        stars: $('stars'),
        money: $('money'),
        clock: $('clock'),
        objectiveText: $('objective-text'),
        objectiveDist: $('objective-dist'),
        healthFill: $('health-fill'),
        armorFill: $('armor-fill'),
        armorBar: $('armor-bar'),
        weaponLabel: $('weapon-label'),
        ammoLabel: $('ammo-label'),
        speed: $('speed'),
        hint: $('hint'),
        vignette: $('vignette'),
        damageFlash: $('damage-flash'),
        toasts: $('toasts'),
        banner: $('banner'),
        bannerTitle: $('banner-title'),
        bannerSub: $('banner-sub'),
        startScreen: $('start-screen'),
        pauseScreen: $('pause-screen'),
        bustedScreen: $('busted-screen'),
        wastedScreen: $('wasted-screen'),
        btnContinue: $('btn-continue'),
        pauseStats: $('pause-stats'),
        helpPanel: $('help-panel')
      };
      const mapCanvas = $('minimap');
      if (mapCanvas) mapCtx = mapCanvas.getContext('2d');
      // Buttons.
      $('btn-new').addEventListener('click', function () { SB.audio.init(); SB.audio.click(); callbacks.onNewGame(); });
      $('btn-continue').addEventListener('click', function () { SB.audio.init(); SB.audio.click(); callbacks.onContinue(); });
      $('btn-help').addEventListener('click', function () {
        SB.audio.click();
        el.helpPanel.style.display = el.helpPanel.style.display === 'block' ? 'none' : 'block';
      });
      $('btn-resume').addEventListener('click', function () { SB.audio.click(); callbacks.onResume(); });
      $('btn-save').addEventListener('click', function () { SB.audio.click(); callbacks.onSave(); });
      $('btn-restart-mission').addEventListener('click', function () { SB.audio.click(); callbacks.onRestartMission(); });
      $('btn-quit').addEventListener('click', function () { SB.audio.click(); callbacks.onQuit(); });
      $('btn-mute').addEventListener('click', function () {
        const m = !SB.audio.isMuted();
        SB.audio.setMuted(m);
        $('btn-mute').textContent = m ? 'UNMUTE (M)' : 'MUTE (M)';
      });
      document.addEventListener('keydown', function () { SB.audio.init(); }, { once: true });
    },

    setContinueAvailable: function (yes) {
      if (el.btnContinue) el.btnContinue.style.display = yes ? 'block' : 'none';
    },

    showScreen: function (name) {
      el.startScreen.style.display = name === 'start' ? 'flex' : 'none';
      el.pauseScreen.style.display = name === 'pause' ? 'flex' : 'none';
      el.bustedScreen.style.display = name === 'busted' ? 'flex' : 'none';
      el.wastedScreen.style.display = name === 'wasted' ? 'flex' : 'none';
      el.hud.style.display = (name === 'none' || name === 'pause') ? 'block' : (name === 'start' ? 'none' : 'block');
    },

    setPauseStats: function (text) {
      if (el.pauseStats) el.pauseStats.textContent = text;
    },

    setObjective: function (text, target) {
      objective.text = text;
      objective.x = target ? target.x : null;
      objective.z = target ? target.z : null;
    },

    setHint: function (text) {
      hintOverride.text = text;
      hintOverride.frame = SB.G.frame;
    },

    damageFlash: function () { damageOpacity = 0.75; },
    wantedFlash: function () { wantedFlashTimer = 1.2; },

    showMessage: function (from, text) {
      const toast = document.createElement('div');
      toast.className = 'toast';
      const head = document.createElement('div');
      head.className = 'toast-from';
      head.textContent = from;
      const body = document.createElement('div');
      body.className = 'toast-body';
      body.textContent = text;
      toast.appendChild(head);
      toast.appendChild(body);
      el.toasts.appendChild(toast);
      while (el.toasts.children.length > 3) el.toasts.removeChild(el.toasts.firstChild);
      setTimeout(function () {
        toast.classList.add('toast-out');
        setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 600);
      }, 6000);
    },

    showBanner: function (title, sub) {
      el.bannerTitle.textContent = title;
      el.bannerSub.textContent = sub || '';
      el.banner.classList.add('banner-show');
      bannerTimer = 3.5;
    },

    update: function (dt) {
      const P = SB.player;
      // Stars.
      const w = SB.police.wanted;
      el.stars.textContent = '★'.repeat(w) + '☆'.repeat(5 - w);
      el.stars.style.color = w === 0 ? 'rgba(255,255,255,0.55)' : '#ffd75e';
      if (wantedFlashTimer > 0) {
        wantedFlashTimer -= dt;
        el.stars.classList.toggle('flash', Math.floor(wantedFlashTimer * 6) % 2 === 0);
      } else {
        el.stars.classList.remove('flash');
      }
      el.money.textContent = U.fmtMoney(P.money);
      el.clock.textContent = U.fmtClock(SB.G.timeMinutes);
      // Objective.
      if (objective.text) {
        el.objectiveText.textContent = objective.text;
        if (objective.x !== null) {
          const d = Math.round(U.dist2D(SB.G.playerPos.x, SB.G.playerPos.z, objective.x, objective.z));
          el.objectiveDist.textContent = d + ' m';
        } else {
          el.objectiveDist.textContent = '';
        }
      } else {
        el.objectiveText.textContent = 'Explore Solmar Bay';
        el.objectiveDist.textContent = '';
      }
      // Health / armour.
      el.healthFill.style.width = Math.max(0, P.health) + '%';
      el.healthFill.style.background = P.health > 50 ? '#7ed957' : P.health > 25 ? '#f2c230' : '#e84040';
      if (P.armor > 0) {
        el.armorBar.style.display = 'block';
        el.armorFill.style.width = Math.max(0, P.armor) + '%';
      } else {
        el.armorBar.style.display = 'none';
      }
      el.weaponLabel.textContent = P.weapon === 'pistol' ? 'PISTOL' : 'FISTS';
      el.ammoLabel.textContent = P.weapon === 'pistol'
        ? (P.reloading > 0 ? 'RELOADING…' : P.ammo + ' / ∞')
        : '';
      // Speed.
      if (P.inCar) {
        el.speed.style.display = 'block';
        el.speed.textContent = Math.abs(Math.round(P.inCar.speed * 3.6)) + ' km/h';
      } else {
        el.speed.style.display = 'none';
      }
      // Hint: a same-frame override wins, else context.
      el.hint.textContent = hintOverride.frame === SB.G.frame ? hintOverride.text : contextualHint();
      // Damage vignette.
      damageOpacity = Math.max(0, damageOpacity - dt * 1.4);
      let lowHealth = 0;
      if (P.health < 30 && SB.G.state === 'playing') lowHealth = 0.22 + Math.sin(performance.now() * 0.005) * 0.1;
      el.damageFlash.style.opacity = Math.max(damageOpacity, lowHealth).toFixed(2);
      // Banner.
      if (bannerTimer > 0) {
        bannerTimer -= dt;
        if (bannerTimer <= 0) el.banner.classList.remove('banner-show');
      }
      drawMinimap();
    }
  };
})();
