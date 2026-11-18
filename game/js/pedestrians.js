// pedestrians.js — the people of Solmar Bay: sidewalk walkers who flee from
// danger, and the red-shirted Vipers who shoot back during missions.
window.SB = window.SB || {};
(function () {
  'use strict';
  const U = SB.utils;

  const SHIRTS = [0xd95f4b, 0x4b8fd9, 0x63b04b, 0xd9c24b, 0x9a5fd9, 0x4bd9c0, 0xe8e8e8, 0x3a3a3a, 0xd97fb0, 0x7a5a3a];
  const PANTS = [0x2e3a4a, 0x4a4a4a, 0x6b5a4a, 0x2a4a2e, 0x5a5a6b];
  const SKINS = [0xf1c27d, 0xe0ac69, 0xc8956c, 0x8d5524, 0xffdbac];
  const peds = [];
  let sceneRef = null;
  let lastWantedForPed = 0;

  function buildPedMesh(opts) {
    opts = opts || {};
    const g = new THREE.Group();
    const skinMat = new THREE.MeshLambertMaterial({ color: opts.skin || SKINS[0] });
    const shirtMat = new THREE.MeshLambertMaterial({ color: opts.shirt || SHIRTS[0] });
    const pantsMat = new THREE.MeshLambertMaterial({ color: opts.pants || PANTS[0] });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.32), skinMat);
    head.position.y = 1.62;
    head.castShadow = true;
    g.add(head);
    if (opts.hat) {
      const hat = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.4), new THREE.MeshLambertMaterial({ color: opts.hat }));
      hat.position.y = 1.85;
      g.add(hat);
    }
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), shirtMat);
    torso.position.y = 1.12;
    torso.castShadow = true;
    g.add(torso);
    function limb(w, h, d, mat, x, y) {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, 0);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.y = -h / 2;
      m.castShadow = true;
      pivot.add(m);
      g.add(pivot);
      return pivot;
    }
    const legL = limb(0.2, 0.82, 0.24, pantsMat, -0.14, 0.82);
    const legR = limb(0.2, 0.82, 0.24, pantsMat, 0.14, 0.82);
    const armL = limb(0.15, 0.66, 0.18, shirtMat, -0.36, 1.38);
    const armR = limb(0.15, 0.66, 0.18, shirtMat, 0.36, 1.38);
    return { group: g, head: head, torso: torso, legL: legL, legR: legR, armL: armL, armR: armR };
  }

  function spawnPed(x, z, opts) {
    opts = opts || {};
    const rng = Math.random;
    const parts = buildPedMesh({
      skin: SKINS[Math.floor(rng() * SKINS.length)],
      shirt: opts.shirt !== undefined ? opts.shirt : SHIRTS[Math.floor(rng() * SHIRTS.length)],
      pants: PANTS[Math.floor(rng() * PANTS.length)],
      hat: opts.enemy ? 0x8a1f1f : (rng() < 0.3 ? 0x2a2a2a : null)
    });
    parts.group.position.set(x, 0, z);
    sceneRef.add(parts.group);
    const ped = {
      parts: parts,
      heading: rng() * Math.PI * 2,
      speed: 0,
      walkSpeed: 1.1 + rng() * 0.8,
      state: opts.enemy ? 'enemy' : 'walk',
      waypoint: null,
      walkPhase: rng() * 10,
      health: opts.enemy ? 50 : 100,
      isEnemy: !!opts.enemy,
      shootTimer: 1 + rng(),
      downTimer: 0,
      fleeTimer: 0,
      fleeFrom: null,
      dead: false,
      cashDropped: false
    };
    ped.waypoint = SB.city.randomSidewalkPoint(rng);
    parts.group.userData.ped = ped; // raycast hits resolve back to this ped
    peds.push(ped);
    return ped;
  }

  function setLying(ped, lying) {
    // Fall over (rotate the whole body) or stand back up.
    ped.parts.group.rotation.x = lying ? -Math.PI / 2 : 0;
    ped.parts.group.position.y = lying ? 0.25 : 0;
  }

  function fleeFrom(ped, x, z) {
    if (ped.dead || ped.state === 'down') return;
    ped.state = 'flee';
    ped.fleeTimer = 3 + Math.random() * 2;
    ped.fleeFrom = { x: x, z: z };
  }

  SB.pedestrians = {
    list: peds,
    buildPedMesh: buildPedMesh,

    init: function (scene, count) {
      sceneRef = scene;
      const rng = U.mulberry32(4242);
      for (let i = 0; i < (count || 36); i++) {
        const p = SB.city.randomSidewalkPoint(rng);
        spawnPed(p.x, p.z, {});
      }
    },

    spawnEnemy: function (x, z) {
      return spawnPed(x, z, { enemy: true, shirt: 0xa01818 });
    },

    /** An armed officer: hunts the player like a Viper, in police blue. */
    spawnCop: function (x, z) {
      const ped = spawnPed(x, z, { enemy: true, shirt: 0x1f3a8a, hat: 0x1a1a2e });
      ped.isCop = true;
      return ped;
    },

    /** A carjacked driver: spawns on foot and flees immediately. */
    spawnDriver: function (x, z) {
      const ped = spawnPed(x, z, {});
      fleeFrom(ped, x - 2.5, z);
      return ped;
    },

    removePed: function (ped) {
      const i = peds.indexOf(ped);
      if (i >= 0) peds.splice(i, 1);
      sceneRef.remove(ped.parts.group);
    },

    /** Gunshots and crashes scare nearby walkers. */
    scaryEvent: function (x, z, radius) {
      for (let i = 0; i < peds.length; i++) {
        const ped = peds[i];
        if (ped.isEnemy) continue;
        const pp = ped.parts.group.position;
        if (U.dist2D(x, z, pp.x, pp.z) < radius) fleeFrom(ped, x, z);
      }
    },

    nearestPed: function (x, z, maxDist, enemiesOnly) {
      let best = null, bd = maxDist;
      for (let i = 0; i < peds.length; i++) {
        const ped = peds[i];
        if (ped.dead || ped.state === 'down') continue;
        if (enemiesOnly && !ped.isEnemy) continue;
        const pp = ped.parts.group.position;
        const d = U.dist2D(x, z, pp.x, pp.z);
        if (d < bd) { bd = d; best = ped; }
      }
      return best;
    },

    damagePed: function (ped, dmg, fromPlayer) {
      if (ped.dead) return;
      ped.health -= dmg;
      if (ped.health <= 0) {
        ped.dead = true;
        ped.state = 'dead';
        setLying(ped, true);
        if (fromPlayer && !ped.isEnemy) {
          // Killing a civilian is a serious crime.
          SB.police.addWanted(2, 'Pedestrian killed');
        }
        if (fromPlayer && ped.isCop) {
          SB.police.addWanted(2, 'Officer down');
        }
        if (ped.isEnemy && !ped.isCop && SB.missions) SB.missions.onEnemyDown(ped);
      } else if (!ped.isEnemy) {
        fleeFrom(ped, SB.G.playerPos.x, SB.G.playerPos.z);
      }
    },

    update: function (dt, ctx) {
      const playerPos = ctx.playerPos;
      const cars = SB.vehicles.list;
      for (let i = 0; i < peds.length; i++) {
        const ped = peds[i];
        const pos = ped.parts.group.position;
        if (ped.dead) continue;
        if (ped.state === 'down') {
          ped.downTimer -= dt;
          if (ped.downTimer <= 0 && ped.health > 0) {
            ped.state = 'walk';
            setLying(ped, false);
            ped.waypoint = SB.city.randomSidewalkPoint(Math.random);
          }
          continue;
        }
        let moveX = 0, moveZ = 0, targetSpeed = 0;
        if (ped.state === 'enemy') {
          // Vipers hold ground and shoot at the player in range.
          const d = U.dist2D(pos.x, pos.z, playerPos.x, playerPos.z);
          if (d < 34) {
            ped.heading = U.angleLerp(ped.heading, Math.atan2(playerPos.x - pos.x, playerPos.z - pos.z), 1 - Math.exp(-6 * dt));
            ped.shootTimer -= dt;
            if (ped.shootTimer <= 0 && d < 30) {
              ped.shootTimer = 0.9 + Math.random() * 0.7;
              SB.combat.enemyShot(ped, playerPos, d);
            }
            // Strafe a little to stay unpredictable.
            targetSpeed = 0.6;
            moveX = Math.sin(ped.heading + Math.PI / 2) * (Math.sin(performance.now() * 0.001 + i) > 0 ? 1 : -1);
            moveZ = Math.cos(ped.heading + Math.PI / 2) * (Math.sin(performance.now() * 0.001 + i) > 0 ? 1 : -1);
          }
        } else if (ped.state === 'flee' && ped.fleeFrom) {
          ped.fleeTimer -= dt;
          const away = Math.atan2(pos.x - ped.fleeFrom.x, pos.z - ped.fleeFrom.z);
          ped.heading = U.angleLerp(ped.heading, away, 1 - Math.exp(-8 * dt));
          targetSpeed = 4.2;
          moveX = Math.sin(ped.heading);
          moveZ = Math.cos(ped.heading);
          if (ped.fleeTimer <= 0) {
            ped.state = 'walk';
            ped.waypoint = SB.city.randomSidewalkPoint(Math.random);
          }
        } else {
          // Stroll to the waypoint, then pick a new one.
          const wp = ped.waypoint;
          const d = U.dist2D(pos.x, pos.z, wp.x, wp.z);
          if (d < 2) {
            ped.waypoint = SB.city.randomSidewalkPoint(Math.random);
          } else {
            ped.heading = U.angleLerp(ped.heading, Math.atan2(wp.x - pos.x, wp.z - pos.z), 1 - Math.exp(-4 * dt));
            targetSpeed = ped.walkSpeed;
            moveX = Math.sin(ped.heading);
            moveZ = Math.cos(ped.heading);
          }
        }
        // A fast car nearby makes walkers dive out of the way.
        if (!ped.isEnemy) {
          for (let c = 0; c < cars.length; c++) {
            const car = cars[c];
            if (Math.abs(car.speed) < 5) continue;
            const cp = car.group.position;
            const cd = U.dist2D(pos.x, pos.z, cp.x, cp.z);
            if (cd < 7) {
              const ahead = (pos.x - cp.x) * Math.sin(car.heading) + (pos.z - cp.z) * Math.cos(car.heading);
              if (ahead > 0) { fleeFrom(ped, cp.x, cp.z); break; }
            }
          }
        }
        ped.speed = U.damp(ped.speed, targetSpeed, 6, dt);
        if (ped.speed > 0.05) {
          const fixed = SB.city.collideCircle(pos.x + moveX * ped.speed * dt, pos.z + moveZ * ped.speed * dt, 0.5);
          pos.x = fixed.x;
          pos.z = fixed.z;
          ped.walkPhase += dt * ped.speed * 3.4;
        }
        ped.parts.group.rotation.y = ped.heading;
        // Walk cycle: swing limbs.
        const swing = Math.sin(ped.walkPhase) * U.clamp(ped.speed / 2, 0, 1) * 0.65;
        ped.parts.legL.rotation.x = swing;
        ped.parts.legR.rotation.x = -swing;
        ped.parts.armL.rotation.x = -swing * 0.7;
        ped.parts.armR.rotation.x = swing * 0.7;
        // Hit by a car?
        for (let c = 0; c < cars.length; c++) {
          const car = cars[c];
          if (Math.abs(car.speed) < 2.5) continue;
          const cp = car.group.position;
          if (U.dist2D(pos.x, pos.z, cp.x, cp.z) < 2.3) {
            ped.health -= 55;
            ped.state = 'down';
            ped.downTimer = 3.5;
            setLying(ped, true);
            SB.audio.crash();
            if (ped.health <= 0) {
              ped.dead = true;
              ped.state = 'dead';
            }
            if (car.driver === 'player') {
              const now = performance.now();
              if (now - lastWantedForPed > 4000) {
                lastWantedForPed = now;
                SB.police.addWanted(ped.dead ? 2 : 1, ped.dead ? 'Pedestrian killed' : 'Pedestrian hit');
              }
            }
            this.scaryEvent(pos.x, pos.z, 18);
            break;
          }
        }
      }
    }
  };
})();
