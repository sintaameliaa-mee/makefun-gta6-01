// police.js — the wanted system: stars rise with crimes, cop cars chase and
// ram, armed officers hunt the player at 3+ stars, and heat cools off when
// the player stays out of sight. Get caught standing still and it is over.
window.SB = window.SB || {};
(function () {
  'use strict';
  const U = SB.utils;

  let sceneRef = null;
  let wanted = 0;
  let decayTimer = 0;
  let bustedTimer = 0;
  let spawnTimer = 0;
  let noiseCooldown = 0;
  const copCars = [];
  const copPeds = [];

  function desiredCopCars() {
    if (wanted <= 0) return 0;
    return Math.min(1 + wanted, 4);
  }

  function spawnCopCarNear(playerPos) {
    // Appear on a road 70-110 m away, heading roughly toward the player.
    for (let tries = 0; tries < 12; tries++) {
      const p = SB.city.randomRoadPoint(Math.random);
      const d = U.dist2D(p.x, p.z, playerPos.x, playerPos.z);
      if (d > 65 && d < 115) {
        const heading = Math.atan2(playerPos.x - p.x, playerPos.z - p.z);
        const car = SB.vehicles.spawnCar(p.x, p.z, heading, 'police', {
          driver: 'police', police: true, color: 0xf2f2f2, withDriver: true
        });
        car.stuckTimer = 0;
        car.reverseTimer = 0;
        copCars.push(car);
        return car;
      }
    }
    return null;
  }

  function spawnCopPedNear(playerPos) {
    const angle = Math.random() * Math.PI * 2;
    const d = 18 + Math.random() * 14;
    const x = playerPos.x + Math.sin(angle) * d;
    const z = playerPos.z + Math.cos(angle) * d;
    const fixed = SB.city.collideCircle(x, z, 0.6);
    const ped = SB.pedestrians.spawnCop(fixed.x, fixed.z);
    copPeds.push(ped);
    return ped;
  }

  function removeCopCar(car) {
    const i = copCars.indexOf(car);
    if (i >= 0) copCars.splice(i, 1);
    SB.vehicles.removeCar(car);
  }

  function copThink(car, dt, playerPos, playerVel) {
    const pos = car.group.position;
    if (SB.G.preroll) {
      // During a scene's fast-forward, hold formation: no ramming yet.
      car.control.throttle = car.speed < 25 ? 0.7 : 0;
      car.control.steer = 0;
      return;
    }
    // Aim slightly ahead of the player.
    const lead = 0.6;
    const tx = playerPos.x + (playerVel ? playerVel.x * lead : 0);
    const tz = playerPos.z + (playerVel ? playerVel.z * lead : 0);
    const targetHeading = Math.atan2(tx - pos.x, tz - pos.z);
    const dh = U.angleDiff(car.heading, targetHeading);
    car.control.steer = U.clamp(dh * 2.4, -1, 1);
    // Ram: full throttle unless right on top of a slow player on foot.
    const d = U.dist2D(pos.x, pos.z, playerPos.x, playerPos.z);
    const playerDriving = !!SB.player.inCar;
    if (!playerDriving && d < 7) {
      car.control.throttle = car.speed > 1 ? -1 : 0; // pull up alongside
    } else {
      car.control.throttle = 1;
    }
    // Stuck against a wall: reverse out.
    if (car.reverseTimer > 0) {
      car.reverseTimer -= dt;
      car.control.throttle = -1;
      car.control.steer = -car.control.steer;
      return;
    }
    if (Math.abs(car.speed) < 0.6 && car.control.throttle > 0.5) {
      car.stuckTimer += dt;
      if (car.stuckTimer > 1.6) {
        car.reverseTimer = 1.0;
        car.stuckTimer = 0;
      }
    } else {
      car.stuckTimer = 0;
    }
  }

  SB.police = {
    copCars: copCars,
    copPeds: copPeds,

    get wanted() { return wanted; },

    init: function (scene) {
      sceneRef = scene;
    },

    addWanted: function (n, reason) {
      if (n <= 0) return;
      const before = wanted;
      wanted = U.clamp(wanted + n, 0, 5);
      if (wanted > before) {
        decayTimer = 0;
        SB.audio.wantedUp();
        SB.hud.wantedFlash();
        if (reason) SB.hud.showMessage('DISPATCH', reason + ' — wanted level ' + wanted + '.');
      }
    },

    /** A gunshot draws a star when officers are close enough to hear it. */
    noiseWanted: function (x, z) {
      if (noiseCooldown > 0) return;
      noiseCooldown = 6;
      for (let i = 0; i < copCars.length; i++) {
        const cp = copCars[i].group.position;
        if (U.dist2D(x, z, cp.x, cp.z) < 60) {
          this.addWanted(1, 'Shots fired');
          return;
        }
      }
      // No cops around, but someone always calls it in — sometimes.
      if (Math.random() < 0.4) this.addWanted(1, 'Shots reported');
    },

    setWanted: function (n) {
      wanted = U.clamp(n, 0, 5);
      decayTimer = 0;
    },

    reset: function () {
      wanted = 0;
      decayTimer = 0;
      bustedTimer = 0;
      for (let i = copCars.length - 1; i >= 0; i--) removeCopCar(copCars[i]);
      for (let i = copPeds.length - 1; i >= 0; i--) {
        SB.pedestrians.removePed(copPeds[i]);
      }
      copPeds.length = 0;
      SB.audio.siren(false);
    },

    nearestCopDist: function (playerPos) {
      let best = Infinity;
      for (let i = 0; i < copCars.length; i++) {
        const cp = copCars[i].group.position;
        best = Math.min(best, U.dist2D(playerPos.x, playerPos.z, cp.x, cp.z));
      }
      for (let i = 0; i < copPeds.length; i++) {
        const pp = copPeds[i].parts.group.position;
        best = Math.min(best, U.dist2D(playerPos.x, playerPos.z, pp.x, pp.z));
      }
      return best;
    },

    update: function (dt) {
      const playerPos = SB.G.playerPos;
      noiseCooldown = Math.max(0, noiseCooldown - dt);
      spawnTimer = Math.max(0, spawnTimer - dt);

      // Spawn / remove cop cars to match the wanted level.
      if (copCars.length < desiredCopCars() && spawnTimer <= 0) {
        spawnCopCarNear(playerPos);
        spawnTimer = 1.5;
      }
      for (let i = copCars.length - 1; i >= 0; i--) {
        const car = copCars[i];
        const d = U.dist2D(playerPos.x, playerPos.z, car.group.position.x, car.group.position.z);
        if (wanted === 0 || d > 240 || car.dead) {
          removeCopCar(car);
        }
      }
      // Armed officers on foot at 3+ stars.
      if (wanted >= 3) {
        let alive = 0;
        for (let i = copPeds.length - 1; i >= 0; i--) {
          if (copPeds[i].dead) {
            SB.pedestrians.removePed(copPeds[i]);
            copPeds.splice(i, 1);
          } else alive++;
        }
        if (alive < 2 && spawnTimer <= 0) {
          spawnCopPedNear(playerPos);
          spawnTimer = 2;
        }
      } else if (copPeds.length > 0) {
        for (let i = copPeds.length - 1; i >= 0; i--) SB.pedestrians.removePed(copPeds[i]);
        copPeds.length = 0;
      }

      // Pursuit driving.
      const playerVel = SB.G.playerVel;
      for (let i = 0; i < copCars.length; i++) copThink(copCars[i], dt, playerPos, playerVel);

      // Siren while any unit is active.
      SB.audio.siren(copCars.length > 0);

      // Busted: standing still next to a cop car while wanted.
      const playerStill = SB.player.inCar
        ? Math.abs(SB.player.inCar.speed) < 1
        : SB.player.speed < 1.2;
      let closeCop = false;
      for (let i = 0; i < copCars.length; i++) {
        const cp = copCars[i].group.position;
        if (U.dist2D(playerPos.x, playerPos.z, cp.x, cp.z) < 7) { closeCop = true; break; }
      }
      if (wanted > 0 && closeCop && playerStill && SB.G.state === 'playing') {
        bustedTimer += dt;
        SB.hud.setHint('BUSTED IN ' + Math.max(0, (2.5 - bustedTimer)).toFixed(1) + 's — MOVE!');
        if (bustedTimer > 2.5) {
          SB.G.state = 'busted';
          SB.audio.busted();
        }
      } else {
        bustedTimer = 0;
      }

      // Heat cools off out of sight.
      if (wanted > 0) {
        const near = this.nearestCopDist(playerPos);
        if (near > 85) {
          decayTimer += dt;
          if (decayTimer > 8) {
            wanted--;
            decayTimer = 0;
            SB.hud.showMessage('DISPATCH', wanted === 0 ? 'You lost them. Heat is off.' : 'Heat dropping — wanted level ' + wanted + '.');
          }
        } else {
          decayTimer = 0;
        }
      }
    }
  };
})();
