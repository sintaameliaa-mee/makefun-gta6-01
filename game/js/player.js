// player.js — Rex Marlow: on-foot movement, jumping, punching, shooting and
// stealing cars. The camera lives in main.js; this file only moves the body.
window.SB = window.SB || {};
(function () {
  'use strict';
  const U = SB.utils;

  let sceneRef = null;
  let lastTheftWanted = 0;

  const P = {
    parts: null,
    heading: 0,
    vy: 0,
    grounded: true,
    health: 100,
    armor: 0,
    money: 120,
    weapon: 'fists',   // 'fists' or 'pistol'
    ammo: 12,
    magSize: 12,
    reloading: 0,
    shootCooldown: 0,
    punchCooldown: 0,
    punchAnim: 0,
    inCar: null,
    walkPhase: 0,
    speed: 0,
    dead: false
  };

  function group() { return P.parts.group; }

  SB.player = P;

  P.init = function (scene, x, z) {
    sceneRef = scene;
    P.parts = SB.pedestrians.buildPedMesh({ skin: 0xe0ac69, shirt: 0x2a9d8f, pants: 0x2e3a4a, hat: 0x1f1f1f });
    P.parts.group.position.set(x, 0, z);
    scene.add(P.parts.group);
    P.heading = Math.PI;
  };

  P.pos = function () {
    if (P.inCar) return P.inCar.group.position;
    return P.parts.group.position;
  };

  P.isDriving = function () { return !!P.inCar; };

  P.givePistol = function () {
    P.weapon = 'pistol';
    P.ammo = P.magSize;
  };

  P.addMoney = function (n) {
    P.money = Math.max(0, P.money + n);
  };

  P.heal = function (n) {
    P.health = Math.min(100, P.health + n);
  };

  P.takeDamage = function (n) {
    if (P.dead || SB.G.state !== 'playing') return;
    const absorbed = Math.min(P.armor, n * 0.6);
    P.armor -= absorbed;
    P.health -= (n - absorbed);
    SB.hud.damageFlash();
    SB.G.shake = Math.min(0.5, SB.G.shake + 0.15);
    if (P.health <= 0) {
      P.health = 0;
      if (SB.G.preroll) { P.health = 40; return; } // scenes never open on a death
      P.dead = true;
      SB.G.state = 'wasted';
    }
  };

  P.forceExitCar = function () {
    if (!P.inCar) return;
    const car = P.inCar;
    P.inCar = null;
    car.driver = 'parked';
    car.control.throttle = 0;
    car.control.steer = 0;
    const cp = car.group.position;
    const side = { x: cp.x + Math.cos(car.heading) * 3, z: cp.z - Math.sin(car.heading) * 3 };
    const fixed = SB.city.collideCircle(side.x, side.z, 0.6);
    group().position.set(fixed.x, 0, fixed.z);
    group().visible = true;
  };

  function tryEnterCar() {
    const pos = group().position;
    const car = SB.vehicles.nearestCar(pos.x, pos.z, 5);
    if (!car) return false;
    // Jacking a driven car: the driver bails out and runs.
    if (car.driver === 'traffic' && car.driverMesh) {
      car.group.remove(car.driverMesh);
      car.driverMesh = null;
      car.hasDriverMesh = false;
      // The driver bails out and runs away on foot.
      SB.pedestrians.spawnDriver(car.group.position.x + 2.5, car.group.position.z);
    }
    const now = performance.now();
    if (now - lastTheftWanted > 5000) {
      lastTheftWanted = now;
      SB.police.addWanted(1, 'Vehicle stolen');
    }
    car.driver = 'player';
    car.control.throttle = 0;
    car.control.steer = 0;
    P.inCar = car;
    group().visible = false;
    SB.audio.engine(true, 0);
    return true;
  }

  function tryExitCar() {
    if (!P.inCar) return false;
    const car = P.inCar;
    if (Math.abs(car.speed) > 3) return false; // too fast to jump out
    P.forceExitCar();
    SB.audio.engine(false, 0);
    return true;
  }

  P.toggleCar = function () {
    if (P.inCar) return tryExitCar();
    return tryEnterCar();
  };

  function punch() {
    if (P.punchCooldown > 0) return;
    P.punchCooldown = 0.45;
    P.punchAnim = 0.25;
    SB.audio.punch();
    const pos = group().position;
    const fx = Math.sin(P.heading), fz = Math.cos(P.heading);
    const ped = SB.pedestrians.nearestPed(pos.x + fx * 1.4, pos.z + fz * 1.4, 2.0, false);
    if (ped) {
      const pp = ped.parts.group.position;
      // Knock them back a step.
      const fixed = SB.city.collideCircle(pp.x + fx * 1.2, pp.z + fz * 1.2, 0.5);
      pp.x = fixed.x; pp.z = fixed.z;
      SB.pedestrians.damagePed(ped, 18, true);
    }
  }

  function shoot(camDir) {
    if (P.weapon !== 'pistol' || P.reloading > 0) return;
    if (P.shootCooldown > 0) return;
    if (P.ammo <= 0) {
      P.reload();
      return;
    }
    P.shootCooldown = 0.22;
    P.ammo--;
    const pos = group().position;
    const muzzle = new THREE.Vector3(pos.x + Math.sin(P.heading) * 0.7, 1.4, pos.z + Math.cos(P.heading) * 0.7);
    SB.combat.shoot(muzzle, camDir, { damage: 34, fromPlayer: true });
    // Firing a gun in public draws attention.
    SB.police.noiseWanted(pos.x, pos.z);
    if (P.ammo <= 0) P.reload();
  }

  P.reload = function () {
    if (P.reloading > 0 || P.ammo === P.magSize) return;
    P.reloading = 0.9;
  };

  P.attack = function (camDir) {
    if (P.inCar) return; // no drive-by in this build; driving is the weapon
    if (P.weapon === 'pistol') shoot(camDir);
    else punch();
  };

  P.punchKey = function () { if (!P.inCar) punch(); };

  P.update = function (dt, input, camYaw, camDir) {
    P.shootCooldown = Math.max(0, P.shootCooldown - dt);
    P.punchCooldown = Math.max(0, P.punchCooldown - dt);
    P.punchAnim = Math.max(0, P.punchAnim - dt);
    if (P.reloading > 0) {
      P.reloading -= dt;
      if (P.reloading <= 0) P.ammo = P.magSize;
    }
    if (P.inCar) {
      const car = P.inCar;
      car.control.throttle = (input.forward ? 1 : 0) + (input.back ? -1 : 0);
      car.control.steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
      car.control.handbrake = !!input.handbrake;
      SB.audio.engine(true, Math.abs(car.speed) / car.spec.maxSpeed);
      return;
    }
    SB.audio.engine(false, 0);
    // On foot: move relative to the camera.
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    let mx = fx * ((input.forward ? 1 : 0) - (input.back ? 1 : 0)) + rx * ((input.right ? 1 : 0) - (input.left ? 1 : 0));
    let mz = fz * ((input.forward ? 1 : 0) - (input.back ? 1 : 0)) + rz * ((input.right ? 1 : 0) - (input.left ? 1 : 0));
    const len = Math.sqrt(mx * mx + mz * mz);
    const sprint = !!input.sprint;
    const targetSpeed = len > 0 ? (sprint ? 7.2 : 4.4) : 0;
    if (len > 0) {
      mx /= len; mz /= len;
      P.heading = U.angleLerp(P.heading, Math.atan2(mx, mz), 1 - Math.exp(-12 * dt));
    }
    P.speed = U.damp(P.speed, targetSpeed, 8, dt);
    const pos = group().position;
    if (P.speed > 0.05) {
      const fixed = SB.city.collideCircle(pos.x + mx * P.speed * dt, pos.z + mz * P.speed * dt, 0.55);
      pos.x = fixed.x;
      pos.z = fixed.z;
      P.walkPhase += dt * P.speed * 2.6;
    }
    // Jump + gravity.
    if (input.jump && P.grounded) {
      P.vy = 7.5;
      P.grounded = false;
    }
    if (!P.grounded) {
      P.vy -= 22 * dt;
      pos.y += P.vy * dt;
      if (pos.y <= 0) {
        pos.y = 0;
        P.vy = 0;
        P.grounded = true;
      }
    }
    group().rotation.y = P.heading;
    // Walk cycle, plus a punch swing.
    const swing = Math.sin(P.walkPhase) * U.clamp(P.speed / 3, 0, 1) * 0.6;
    P.parts.legL.rotation.x = swing;
    P.parts.legR.rotation.x = -swing;
    if (P.punchAnim > 0) {
      P.parts.armR.rotation.x = -1.9 * (P.punchAnim / 0.25);
      P.parts.armL.rotation.x = 0.4;
    } else {
      P.parts.armL.rotation.x = -swing * 0.7;
      P.parts.armR.rotation.x = swing * 0.7;
    }
  };
})();
