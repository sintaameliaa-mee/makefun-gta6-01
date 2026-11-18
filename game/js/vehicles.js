// vehicles.js — cars: meshes, arcade driving physics, traffic AI and parking.
// Every car is driven through a small control object {throttle, steer, handbrake}
// that its driver (player, traffic AI or police AI) fills in each frame.
window.SB = window.SB || {};
(function () {
  'use strict';
  const U = SB.utils;
  const CFG = SB.config;

  const CAR_COLORS = [0xb03030, 0x3050b0, 0x2f7a4a, 0xc8c8c8, 0x222222, 0xd8a030, 0x7a4a9a, 0x4aa8b8, 0xe8e0d0, 0x6080a0];
  const TYPES = {
    sedan:  { len: 4.3, w: 1.9, h: 0.72, maxSpeed: 36, accel: 13, grip: 8 },
    taxi:   { len: 4.3, w: 1.9, h: 0.72, maxSpeed: 35, accel: 13, grip: 8 },
    sports: { len: 4.4, w: 2.0, h: 0.58, maxSpeed: 46, accel: 18, grip: 10 },
    van:    { len: 5.0, w: 2.1, h: 1.15, maxSpeed: 29, accel: 10, grip: 7 },
    truck:  { len: 5.6, w: 2.2, h: 1.0, maxSpeed: 27, accel: 9, grip: 6 },
    police: { len: 4.5, w: 1.95, h: 0.72, maxSpeed: 42, accel: 17, grip: 9 }
  };

  const cars = [];      // every live car
  let sceneRef = null;
  let smokeTex = null;

  function makeSmokeTexture() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, 'rgba(200,200,200,0.85)');
    grad.addColorStop(1, 'rgba(200,200,200,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    return tex;
  }

  /** Builds a car mesh facing +z. Returns {group, wheels, lightMats}. */
  function buildCarMesh(type, colorHex, opts) {
    opts = opts || {};
    const spec = TYPES[type] || TYPES.sedan;
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshPhongMaterial({ color: colorHex, shininess: 60 });
    const glassMat = new THREE.MeshPhongMaterial({ color: 0x18242f, shininess: 120 });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x1c1c20 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.len), bodyMat);
    body.position.y = 0.55 + (spec.h - 0.72) / 2;
    body.castShadow = true;
    group.add(body);
    if (type === 'van' || type === 'truck') {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.94, 0.9, spec.len * 0.55), bodyMat);
      cab.position.set(0, 1.35, -spec.len * 0.12);
      cab.castShadow = true;
      group.add(cab);
      const shield = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.9, 0.7, 0.15), glassMat);
      shield.position.set(0, 1.3, spec.len * 0.18);
      group.add(shield);
    } else {
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.86, 0.62, spec.len * 0.48), glassMat);
      cabin.position.set(0, 1.18, -spec.len * 0.06);
      cabin.castShadow = true;
      group.add(cabin);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(spec.w * 0.8, 0.1, spec.len * 0.42), bodyMat);
      roof.position.set(0, 1.52, -spec.len * 0.06);
      group.add(roof);
    }
    if (type === 'sports') {
      const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.4), darkMat);
      spoiler.position.set(0, 1.05, -spec.len / 2 + 0.2);
      group.add(spoiler);
    }
    // Headlights and taillights.
    const hlMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8 });
    const tlMat = new THREE.MeshBasicMaterial({ color: 0xcc2222 });
    [-1, 1].forEach(function (s) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.1), hlMat);
      hl.position.set(s * spec.w * 0.32, 0.62, spec.len / 2 + 0.02);
      group.add(hl);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.1), tlMat);
      tl.position.set(s * spec.w * 0.32, 0.66, -spec.len / 2 - 0.02);
      group.add(tl);
    });
    // Wheels.
    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheels = [];
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(function (p) {
      const w = new THREE.Mesh(wheelGeo, darkMat);
      w.position.set(p[0] * (spec.w / 2 - 0.05), 0.38, p[1] * (spec.len / 2 - 0.75));
      w.castShadow = true;
      group.add(w);
      wheels.push({ mesh: w, front: p[1] > 0 });
    });
    // Taxi roof sign.
    if (opts.taxi) {
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.3), new THREE.MeshBasicMaterial({ color: 0xffe94a }));
      sign.position.set(0, 1.66, 0);
      group.add(sign);
    }
    // Police light bar.
    let lightMats = null;
    if (opts.police) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14, 0.34), darkMat);
      bar.position.set(0, 1.6, -0.1);
      group.add(bar);
      lightMats = {
        red: new THREE.MeshBasicMaterial({ color: 0xff2222 }),
        blue: new THREE.MeshBasicMaterial({ color: 0x2244ff })
      };
      const lr = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.3), lightMats.red);
      lr.position.set(-0.32, 1.72, -0.1);
      group.add(lr);
      const lb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.3), lightMats.blue);
      lb.position.set(0.32, 1.72, -0.1);
      group.add(lb);
    }
    return { group: group, wheels: wheels, lightMats: lightMats };
  }

  function makeDriverMesh() {
    // Simple seated driver: head + torso, visible through the glass.
    const g = new THREE.Group();
    const skin = new THREE.MeshLambertMaterial({ color: 0xc8956c });
    const shirt = new THREE.MeshLambertMaterial({ color: 0x4a6a8a });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.32), skin);
    head.position.y = 1.32;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.6, 0.3), shirt);
    torso.position.y = 0.9;
    g.add(head);
    g.add(torso);
    return g;
  }

  function spawnCar(x, z, heading, type, opts) {
    opts = opts || {};
    const spec = TYPES[type] || TYPES.sedan;
    const color = opts.color !== undefined ? opts.color : CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    const built = buildCarMesh(type, color, opts);
    built.group.position.set(x, 0, z);
    built.group.rotation.y = heading;
    sceneRef.add(built.group);
    const car = {
      group: built.group,
      wheels: built.wheels,
      lightMats: built.lightMats,
      type: type,
      spec: spec,
      heading: heading,
      speed: 0,
      slideX: 0, slideZ: 0,
      driver: opts.driver || 'traffic',
      health: 100,
      control: { throttle: 0, steer: 0, handbrake: false },
      isPolice: !!opts.police,
      isTaxi: !!opts.taxi,
      hasDriverMesh: false,
      smokeTimer: 0,
      smokePuffs: [],
      // Traffic AI state.
      axis: opts.axis || 'x',
      dir: opts.dir || 1,
      lane: opts.lane || 0,
      stuckTimer: 0,
      brakeLight: 0,
      dead: false,
      sirenPhase: Math.random() * 10
    };
    if (opts.withDriver) {
      const d = makeDriverMesh();
      d.position.set(-0.35, 0, 0.1);
      built.group.add(d);
      car.hasDriverMesh = true;
      car.driverMesh = d;
    }
    built.group.userData.car = car; // raycast hits resolve back to this car
    cars.push(car);
    return car;
  }

  function removeCar(car) {
    const i = cars.indexOf(car);
    if (i >= 0) cars.splice(i, 1);
    car.smokePuffs.forEach(function (s) { sceneRef.remove(s.sprite); });
    sceneRef.remove(car.group);
  }

  /** Traffic AI: follow the road grid, turn at intersections, brake for cars ahead. */
  function trafficThink(car, dt, playerPos) {
    const pos = car.group.position;
    const roadC = SB.city.nearestRoadCentre(car.axis === 'x' ? pos.z : pos.x);
    // Target point: ahead along the current road, on the correct lane.
    let tx, tz;
    const laneOff = 3.4 * car.dir;
    if (car.axis === 'x') {
      tx = pos.x + car.dir * 18;
      tz = roadC + laneOff;
    } else {
      tx = roadC - laneOff;
      tz = pos.z + car.dir * 18;
    }
    // At an intersection, sometimes turn onto the crossing road.
    const along = car.axis === 'x' ? pos.x : pos.z;
    const cross = SB.city.nearestRoadCentre(along);
    if (Math.abs(along - cross) < 4 && Math.random() < dt * 0.5) {
      car.axis = car.axis === 'x' ? 'z' : 'x';
      car.dir = Math.random() < 0.5 ? 1 : -1;
    }
    // World edge: turn around.
    if (Math.abs(pos.x) > 215 || Math.abs(pos.z) > 215) {
      car.dir *= -1;
      car.axis = car.axis === 'x' ? 'x' : 'z';
    }
    // Car ahead? brake.
    let blocked = false;
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    for (let i = 0; i < cars.length; i++) {
      const o = cars[i];
      if (o === car) continue;
      const dx = o.group.position.x - pos.x;
      const dz = o.group.position.z - pos.z;
      const ahead = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (ahead > 0 && ahead < 13 && side < 2.6) { blocked = true; break; }
    }
    // Player on foot right ahead? brake (and honk by doing nothing).
    if (playerPos) {
      const dx = playerPos.x - pos.x, dz = playerPos.z - pos.z;
      const ahead = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (ahead > 0 && ahead < 9 && side < 2.2) blocked = true;
    }
    const targetHeading = Math.atan2(tx - pos.x, tz - pos.z);
    const dh = U.angleDiff(car.heading, targetHeading);
    car.control.steer = U.clamp(dh * 2.2, -1, 1);
    const cruise = 9 + Math.random() * 0; // steady city speed
    car.control.throttle = blocked ? (car.speed > 0.5 ? -1 : 0) : (car.speed < cruise ? 0.55 : 0.1);
    // Stuck against something: reverse a little, then re-aim.
    if (Math.abs(car.speed) < 0.5 && car.control.throttle > 0) {
      car.stuckTimer += dt;
      if (car.stuckTimer > 2.5) {
        car.control.throttle = -0.8;
        car.control.steer = Math.random() < 0.5 ? -1 : 1;
        if (car.stuckTimer > 3.6) car.stuckTimer = 0;
      }
    } else {
      car.stuckTimer = 0;
    }
  }

  function applyPhysics(car, dt) {
    const spec = car.spec;
    const c = car.control;
    // Longitudinal.
    if (c.throttle > 0) {
      car.speed += spec.accel * c.throttle * dt * (car.speed < 0 ? 2.2 : 1);
    } else if (c.throttle < 0) {
      if (car.speed > 0.5) car.speed += spec.accel * 1.8 * c.throttle * dt; // brake
      else car.speed += spec.accel * 0.6 * c.throttle * dt; // reverse
    } else {
      car.speed -= car.speed * 0.6 * dt; // drag
      car.speed -= Math.sign(car.speed) * 1.2 * dt;
      if (Math.abs(car.speed) < 0.15) car.speed = 0;
    }
    car.speed = U.clamp(car.speed, -11, spec.maxSpeed * (car.health < 30 ? 0.45 : 1));
    // Steering: less at speed, reversed when reversing.
    const steerAuthority = 0.62 * (1 - Math.min(Math.abs(car.speed) / spec.maxSpeed, 1) * 0.55);
    car.heading += c.steer * steerAuthority * (car.speed / 8) * dt * 2.1 * (car.speed < 0 ? -1 : 1);
    // Move: forward + decaying lateral slide (handbrake slides more).
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    const grip = c.handbrake ? 1.2 : spec.grip;
    const pos = car.group.position;
    const vx = fx * car.speed + car.slideX;
    const vz = fz * car.speed + car.slideZ;
    let nx = pos.x + vx * dt;
    let nz = pos.z + vz * dt;
    // Lateral slide decays toward the forward direction.
    const latX = vx - fx * (vx * fx + vz * fz);
    const latZ = vz - fz * (vx * fx + vz * fz);
    const decay = Math.exp(-grip * dt);
    car.slideX = latX * decay + (c.handbrake ? latX * 0.4 : 0);
    car.slideZ = latZ * decay + (c.handbrake ? latZ * 0.4 : 0);
    // Buildings / world bounds.
    const before = { x: nx, z: nz };
    const fixed = SB.city.collideCircle(nx, nz, 2.1);
    nx = fixed.x; nz = fixed.z;
    if (fixed.x !== before.x || fixed.z !== before.z) {
      if (Math.abs(car.speed) > 6) {
        car.health -= Math.abs(car.speed) * 0.9;
        SB.audio.crash();
        if (car.driver === 'player') SB.G.shake = Math.min(0.6, Math.abs(car.speed) * 0.03);
      }
      car.speed *= 0.35;
      car.slideX *= 0.3;
      car.slideZ *= 0.3;
    }
    pos.x = nx;
    pos.z = nz;
    car.group.rotation.y = car.heading;
    // Wheels: spin + front steer.
    const spin = (car.speed / 0.38) * dt;
    car.wheels.forEach(function (w) {
      w.mesh.rotation.x += spin;
      if (w.front) w.mesh.rotation.y = c.steer * 0.42;
    });
    // Police light bar flash.
    if (car.lightMats) {
      car.sirenPhase += dt * 6;
      const on = Math.sin(car.sirenPhase) > 0;
      car.lightMats.red.color.setHex(on ? 0xff2222 : 0x551111);
      car.lightMats.blue.color.setHex(on ? 0x112266 : 0x2244ff);
    }
    // Engine smoke when badly damaged.
    if (car.health < 45 && car.health > 0) {
      car.smokeTimer -= dt;
      if (car.smokeTimer <= 0) {
        car.smokeTimer = 0.12;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0.6, depthWrite: false }));
        sprite.scale.set(1.6, 1.6, 1);
        sprite.position.set(pos.x + fx * 1.8, 1.2, pos.z + fz * 1.8);
        sceneRef.add(sprite);
        car.smokePuffs.push({ sprite: sprite, life: 0.9 });
      }
    }
    car.smokePuffs = car.smokePuffs.filter(function (p) {
      p.life -= dt;
      p.sprite.position.y += dt * 1.6;
      p.sprite.material.opacity = Math.max(0, p.life * 0.6);
      p.sprite.scale.multiplyScalar(1 + dt * 1.5);
      if (p.life <= 0) { sceneRef.remove(p.sprite); return false; }
      return true;
    });
    if (car.health <= 0 && !car.dead) {
      car.dead = true;
      car.speed = 0;
      if (car.driver === 'player') SB.player.forceExitCar();
    }
  }

  /** Car-car collision: push apart, swap a little speed, damage. */
  function collideCars() {
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i], b = cars[j];
        const pa = a.group.position, pb = b.group.position;
        const dx = pb.x - pa.x, dz = pb.z - pa.z;
        const d2 = dx * dx + dz * dz;
        const min = 4.1;
        if (d2 < min * min && d2 > 0.001) {
          const d = Math.sqrt(d2);
          const push = (min - d) / 2;
          const nx = dx / d, nz = dz / d;
          pa.x -= nx * push; pa.z -= nz * push;
          pb.x += nx * push; pb.z += nz * push;
          const rel = Math.abs(a.speed - b.speed);
          if (rel > 4) {
            a.health -= rel * 0.5;
            b.health -= rel * 0.5;
            SB.audio.crash();
            if (a.driver === 'player' || b.driver === 'player') SB.G.shake = Math.min(0.5, rel * 0.02);
          }
          const tmp = a.speed;
          a.speed = a.speed * 0.6 + b.speed * 0.3;
          b.speed = b.speed * 0.6 + tmp * 0.3;
        }
      }
    }
  }

  SB.vehicles = {
    list: cars,

    init: function (scene) {
      sceneRef = scene;
      smokeTex = makeSmokeTexture();
      const rng = U.mulberry32(777);
      // Parked cars in the parking blocks and along curbs.
      const parkSpots = [
        { x: -116, z: 116 }, { x: -108, z: 116 }, { x: -100, z: 116 },
        { x: 58, z: -116 }, { x: 66, z: -116 }, { x: 58, z: -108 },
        { x: -29, z: -200 }, { x: 87, z: 200 }, { x: 145, z: -200 }, { x: -203, z: 60 }
      ];
      parkSpots.forEach(function (p, i) {
        const type = i % 4 === 0 ? 'sports' : i % 4 === 1 ? 'van' : 'sedan';
        spawnCar(p.x, p.z, (i % 2 === 0 ? 0 : Math.PI / 2), type, { driver: 'parked' });
      });
      // Moving traffic.
      for (let i = 0; i < 12; i++) this.spawnTrafficCar(rng);
      // Two taxis roaming.
      for (let i = 0; i < 2; i++) {
        const p = SB.city.randomRoadPoint(rng);
        spawnCar(p.x, p.z, rng() * Math.PI * 2, 'taxi', {
          driver: 'traffic', taxi: true, color: 0xf2c230, withDriver: true,
          axis: rng() < 0.5 ? 'x' : 'z', dir: rng() < 0.5 ? 1 : -1
        });
      }
    },

    spawnTrafficCar: function (rng) {
      rng = rng || Math.random;
      const p = SB.city.randomRoadPoint(rng);
      const types = ['sedan', 'sedan', 'sedan', 'van', 'sports', 'truck'];
      const type = types[Math.floor(rng() * types.length)];
      return spawnCar(p.x, p.z, rng() * Math.PI * 2, type, {
        driver: 'traffic', withDriver: true,
        axis: rng() < 0.5 ? 'x' : 'z', dir: rng() < 0.5 ? 1 : -1
      });
    },

    spawnCar: spawnCar,
    removeCar: removeCar,

    nearestCar: function (x, z, maxDist) {
      let best = null, bd = maxDist;
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i];
        if (c.dead) continue;
        const d = U.dist2D(x, z, c.group.position.x, c.group.position.z);
        if (d < bd) { bd = d; best = c; }
      }
      return best;
    },

    update: function (dt, playerPos) {
      for (let i = 0; i < cars.length; i++) {
        const car = cars[i];
        if (car.dead) continue;
        if (car.driver === 'traffic') trafficThink(car, dt, playerPos);
        applyPhysics(car, dt);
      }
      collideCars();
      // Recycle traffic that wandered far from the player.
      if (playerPos) {
        for (let i = cars.length - 1; i >= 0; i--) {
          const car = cars[i];
          if (car.driver !== 'traffic') continue;
          const d = U.dist2D(playerPos.x, playerPos.z, car.group.position.x, car.group.position.z);
          if (d > 200) {
            removeCar(car);
            this.spawnTrafficCar();
          }
        }
        const trafficCount = cars.filter(function (c) { return c.driver === 'traffic'; }).length;
        if (trafficCount < 12) this.spawnTrafficCar();
      }
    }
  };
})();
