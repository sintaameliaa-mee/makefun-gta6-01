// city.js — builds Solmar Bay: ground, roads, buildings, palms, lamps, beach,
// water, docks and landmarks. All textures are painted on canvases at load;
// nothing is fetched. The layout is seeded, so it is identical every run.
window.SB = window.SB || {};
(function () {
  'use strict';
  const U = SB.utils;
  const CFG = SB.config;

  const colliders = [];   // {minX,maxX,minZ,maxZ}
  const landmarks = {};   // named places missions and the HUD use
  let waterMesh = null;

  /** World x/z to ground-texture pixels (canvas 2048 covers -320..320). */
  function toPx(v) { return (v + 320) / 640 * 2048; }

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  /** Paints the whole city floor: blocks, roads, markings, beach. */
  function paintGroundTexture(rng) {
    const c = makeCanvas(2048, 2048);
    const g = c.getContext('2d');
    // Base: pale concrete.
    g.fillStyle = '#8f8f88';
    g.fillRect(0, 0, 2048, 2048);
    // Block interiors: grass, plaza, parking.
    const blockCols = ['#7fae62', '#a9a08c', '#6f9e5e', '#b5ac96', '#8c8f88'];
    for (let i = 0; i < 7; i++) {
      for (let j = 0; j < 7; j++) {
        const x0 = CFG.ROADS[i] + CFG.ROAD_W / 2 + 2;
        const x1 = CFG.ROADS[i + 1] - CFG.ROAD_W / 2 - 2;
        const z0 = CFG.ROADS[j] + CFG.ROAD_W / 2 + 2;
        const z1 = CFG.ROADS[j + 1] - CFG.ROAD_W / 2 - 2;
        g.fillStyle = blockCols[Math.floor(rng() * blockCols.length)];
        g.fillRect(toPx(x0), toPx(z0), toPx(x1) - toPx(x0), toPx(z1) - toPx(z0));
        // Sidewalk rim around the block.
        g.strokeStyle = '#c9c6bb';
        g.lineWidth = 10;
        g.strokeRect(toPx(x0) - 5, toPx(z0) - 5, toPx(x1) - toPx(x0) + 10, toPx(z1) - toPx(z0) + 10);
      }
    }
    // Roads: asphalt.
    g.fillStyle = '#3b3b40';
    CFG.ROADS.forEach(function (r) {
      g.fillRect(toPx(r - CFG.ROAD_W / 2), toPx(-232), toPx(CFG.ROAD_W), toPx(232) - toPx(-232));
      g.fillRect(toPx(-232), toPx(r - CFG.ROAD_W / 2), toPx(232) - toPx(-232), toPx(CFG.ROAD_W));
    });
    // Centre dashes.
    g.fillStyle = '#d8c95a';
    CFG.ROADS.forEach(function (r) {
      for (let v = -226; v < 226; v += 16) {
        g.fillRect(toPx(r) - 2, toPx(v), 4, 22);
        g.fillRect(toPx(v), toPx(r) - 2, 22, 4);
      }
    });
    // Crosswalks at every intersection.
    g.fillStyle = '#e8e6df';
    CFG.ROADS.forEach(function (rx) {
      CFG.ROADS.forEach(function (rz) {
        for (let k = -3; k <= 3; k++) {
          g.fillRect(toPx(rx + k * 3.4) - 3, toPx(rz - 9), 6, 12);
          g.fillRect(toPx(rx + k * 3.4) - 3, toPx(rz + 3), 6, 12);
          g.fillRect(toPx(rx - 9), toPx(rz + k * 3.4) - 3, 12, 6);
          g.fillRect(toPx(rx + 3), toPx(rz + k * 3.4) - 3, 12, 6);
        }
      });
    });
    // Beach sand on the east edge, then the ground fades under the water.
    const sand = g.createLinearGradient(toPx(238), 0, toPx(320), 0);
    sand.addColorStop(0, '#e9d8a4');
    sand.addColorStop(1, '#dcc78d');
    g.fillStyle = sand;
    g.fillRect(toPx(238), 0, 2048 - toPx(238), 2048);
    // Boardwalk strip along the sand.
    g.fillStyle = '#b98d5e';
    g.fillRect(toPx(238), 0, 26, 2048);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** A building facade: window grid on a coloured wall. */
  function makeFacadeTexture(base, floors, cols, rng) {
    const c = makeCanvas(256, 256);
    const g = c.getContext('2d');
    g.fillStyle = base;
    g.fillRect(0, 0, 256, 256);
    // Subtle vertical shading.
    const grad = g.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0.18)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.05)');
    grad.addColorStop(1, 'rgba(0,0,0,0.18)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const ww = 256 / cols;
    const wh = 256 / floors;
    for (let f = 0; f < floors; f++) {
      for (let col = 0; col < cols; col++) {
        const lit = rng() < 0.28;
        g.fillStyle = lit ? '#ffe9a8' : '#20242c';
        g.fillRect(col * ww + ww * 0.22, f * wh + wh * 0.25, ww * 0.56, wh * 0.5);
      }
    }
    // Ground-floor shops: brighter band.
    g.fillStyle = 'rgba(255,240,200,0.85)';
    g.fillRect(0, 256 - wh * 0.8, 256, wh * 0.8);
    g.fillStyle = '#2c2c30';
    for (let col = 0; col < cols; col++) g.fillRect(col * ww + ww * 0.15, 256 - wh * 0.62, ww * 0.7, wh * 0.45);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** A shop-sign texture with original text painted on it. */
  function makeSignTexture(text, bg, fg) {
    const c = makeCanvas(512, 128);
    const g = c.getContext('2d');
    g.fillStyle = bg;
    g.fillRect(0, 0, 512, 128);
    g.strokeStyle = fg;
    g.lineWidth = 6;
    g.strokeRect(6, 6, 500, 116);
    g.fillStyle = fg;
    g.font = 'bold 52px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 256, 66);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function addBoxCollider(minX, maxX, minZ, maxZ) {
    colliders.push({ minX: minX, maxX: maxX, minZ: minZ, maxZ: maxZ });
  }

  SB.city = {
    colliders: colliders,
    landmarks: landmarks,

    build: function (scene) {
      const rng = U.mulberry32(20261118);
      const ROADS = CFG.ROADS;

      // --- sky dome: warm gradient, sun glow near the horizon ---
      const skyC = makeCanvas(64, 512);
      const sg = skyC.getContext('2d');
      const skyGrad = sg.createLinearGradient(0, 0, 0, 512);
      skyGrad.addColorStop(0, '#2f6fb4');
      skyGrad.addColorStop(0.45, '#7fb4dd');
      skyGrad.addColorStop(0.75, '#ffd9a0');
      skyGrad.addColorStop(1, '#ffbe78');
      sg.fillStyle = skyGrad;
      sg.fillRect(0, 0, 64, 512);
      const skyTex = new THREE.CanvasTexture(skyC);
      skyTex.colorSpace = THREE.SRGBColorSpace;
      const sky = new THREE.Mesh(
        new THREE.SphereGeometry(900, 24, 16),
        new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false })
      );
      scene.add(sky);

      // --- ground ---
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(640, 640),
        new THREE.MeshLambertMaterial({ map: paintGroundTexture(rng) })
      );
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);

      // --- water (east) ---
      const waterMat = new THREE.MeshPhongMaterial({
        color: 0x2e7f9e, transparent: true, opacity: 0.88,
        shininess: 120, specular: 0x99ddff
      });
      waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(180, 640), waterMat);
      waterMesh.rotation.x = -Math.PI / 2;
      waterMesh.position.set(272 + 90 - 12, 0.15, 0);
      scene.add(waterMesh);

      // --- facade materials (shared) ---
      const facadeCols = ['#b8a894', '#9db3c4', '#c4a59a', '#a8b8a0', '#c9b48a', '#b0a8c0'];
      const facades = [];
      for (let i = 0; i < 6; i++) {
        facades.push(new THREE.MeshLambertMaterial({
          map: makeFacadeTexture(facadeCols[i], 6 + (i % 3) * 4, 6, rng)
        }));
      }
      const roofMat = new THREE.MeshLambertMaterial({ color: 0x4a4a4e });
      const roofDetailMat = new THREE.MeshLambertMaterial({ color: 0x777777 });

      const boxGeo = new THREE.BoxGeometry(1, 1, 1);
      boxGeo.translate(0, 0.5, 0); // origin at the base

      // Special blocks (by block indices i,j over the 7x7 grid).
      const PARK = { '2,2': 1, '5,4': 1 };
      const PARKING = { '1,5': 1, '4,1': 1 };
      const DOCKS = { '6,6': 1, '6,5': 1 };
      const BANK_BLOCK = '3,3';   // downtown
      const GARAGE_BLOCK = '1,2'; // west side
      const MOTEL_BLOCK = '5,1';
      const SAFE_BLOCK = '0,6';   // south-west corner
      const HOSPITAL_BLOCK = '2,5';
      const POLICE_BLOCK = '4,3';

      for (let i = 0; i < 7; i++) {
        for (let j = 0; j < 7; j++) {
          const key = i + ',' + j;
          const cx = (ROADS[i] + ROADS[i + 1]) / 2;
          const cz = (ROADS[j] + ROADS[j + 1]) / 2;
          const distC = Math.sqrt(cx * cx + cz * cz);
          if (PARK[key]) {
            // Park: trees only, no buildings.
            for (let t = 0; t < 8; t++) {
              this._addPalm(scene, cx + (rng() - 0.5) * 36, cz + (rng() - 0.5) * 36, rng);
            }
            continue;
          }
          if (DOCKS[key]) {
            // Container yard: stacked shipping containers.
            const contCols = [0xc0392b, 0x2980b9, 0x27ae60, 0xd35400, 0x8e44ad];
            for (let k = 0; k < 10; k++) {
              const w = 12, h = 2.6, d = 2.6;
              const m = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: contCols[k % 5] }));
              const px = cx + (rng() - 0.5) * 30;
              const pz = cz + (rng() - 0.5) * 30;
              const stack = rng() < 0.4 ? 2 : 1;
              m.scale.set(w, h, d);
              m.position.set(px, 0, pz);
              m.rotation.y = (rng() < 0.5 ? 0 : Math.PI / 2);
              m.castShadow = true;
              scene.add(m);
              if (stack === 2) {
                const m2 = m.clone();
                m2.position.y = h;
                scene.add(m2);
              }
              addBoxCollider(px - 6, px + 6, pz - 2, pz + 2);
            }
            continue;
          }
          // Ordinary block: 1-3 buildings, taller near the centre.
          const count = PARKING[key] ? 1 : 1 + Math.floor(rng() * 3);
          for (let b = 0; b < count; b++) {
            const tall = U.clamp(1 - distC / 320, 0.15, 1);
            const h = 8 + Math.pow(rng(), 1.6) * 14 + tall * 42 * rng();
            const w = 12 + rng() * 16;
            const d = 12 + rng() * 16;
            const px = cx + (rng() - 0.5) * (44 - w - 4);
            const pz = cz + (rng() - 0.5) * (44 - d - 4);
            const mat = facades[Math.floor(rng() * facades.length)];
            const mesh = new THREE.Mesh(boxGeo, [mat, mat, roofMat, roofMat, mat, mat]);
            mesh.scale.set(w, h, d);
            mesh.position.set(px, 0, pz);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            scene.add(mesh);
            addBoxCollider(px - w / 2, px + w / 2, pz - d / 2, pz + d / 2);
            // Rooftop detail: AC box or water tower.
            if (rng() < 0.6) {
              const ac = new THREE.Mesh(boxGeo, roofDetailMat);
              ac.scale.set(2 + rng() * 2, 1.2, 2 + rng() * 2);
              ac.position.set(px + (rng() - 0.5) * w * 0.5, h, pz + (rng() - 0.5) * d * 0.5);
              ac.castShadow = true;
              scene.add(ac);
            } else if (h > 20 && rng() < 0.5) {
              const tank = new THREE.Mesh(
                new THREE.CylinderGeometry(1.6, 1.6, 3, 10),
                new THREE.MeshLambertMaterial({ color: 0x8a6f4d })
              );
              tank.position.set(px, h + 2.4, pz);
              tank.castShadow = true;
              scene.add(tank);
            }
          }
          if (PARKING[key]) {
            // Parking lot markings are on the ground texture; cars come from vehicles.js.
          }
        }
      }

      // --- landmark buildings with signs (fixed spots, used by missions) ---
      function landmarkSign(x, z, w, h, d, text, bg, fg, name) {
        const mat = new THREE.MeshLambertMaterial({ color: 0xd8d2c4 });
        const m = new THREE.Mesh(boxGeo, [mat, mat, roofMat, roofMat, mat, mat]);
        m.scale.set(w, h, d);
        m.position.set(x, 0, z);
        m.castShadow = true;
        m.receiveShadow = true;
        scene.add(m);
        addBoxCollider(x - w / 2, x + w / 2, z - d / 2, z + d / 2);
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(w * 0.9, h * 0.32),
          new THREE.MeshBasicMaterial({ map: makeSignTexture(text, bg, fg) })
        );
        sign.position.set(x, h * 0.78, z - d / 2 - 0.15);
        sign.rotation.y = Math.PI;
        scene.add(sign);
        landmarks[name] = { x: x, z: z + d / 2 + 6, bx: x, bz: z };
        return m;
      }
      // Rosa's Garage (west).
      const gcx = (ROADS[1] + ROADS[2]) / 2, gcz = (ROADS[2] + ROADS[3]) / 2;
      landmarkSign(gcx, gcz, 22, 9, 16, "ROSA'S GARAGE", '#7a1f1f', '#ffd75e', 'garage');
      // Solmar Bank (downtown).
      const bcx = (ROADS[3] + ROADS[4]) / 2, bcz = (ROADS[3] + ROADS[4]) / 2;
      landmarkSign(bcx, bcz, 26, 16, 20, 'SOLMAR BANK', '#1f3a5f', '#ffffff', 'bank');
      // Motel (north-east).
      const mcx = (ROADS[5] + ROADS[6]) / 2, mcz = (ROADS[1] + ROADS[2]) / 2;
      landmarkSign(mcx, mcz, 24, 11, 14, 'PALM MOTEL', '#2e6b34', '#ffffff', 'motel');
      // Safehouse (south-west).
      const scx = (ROADS[0] + ROADS[1]) / 2, scz = (ROADS[6] + ROADS[7]) / 2;
      landmarkSign(scx, scz, 18, 8, 14, 'SAFEHOUSE', '#5b4a8a', '#ffffff', 'safehouse');
      // Hospital.
      const hcx = (ROADS[2] + ROADS[3]) / 2, hcz = (ROADS[5] + ROADS[6]) / 2;
      landmarkSign(hcx, hcz, 26, 14, 18, 'GENERAL HOSPITAL', '#ffffff', '#c0392b', 'hospital');
      // Police station.
      const pcx = (ROADS[4] + ROADS[5]) / 2, pcz = (ROADS[3] + ROADS[4]) / 2;
      landmarkSign(pcx, pcz, 24, 12, 18, 'POLICE', '#1f3a5f', '#ffd75e', 'police');
      // Docks marker (container yard, south-east).
      const dcx = (ROADS[6] + ROADS[7]) / 2, dcz = (ROADS[6] + ROADS[7]) / 2;
      landmarks.docks = { x: dcx, z: dcz, bx: dcx, bz: dcz };
      landmarks.pier = { x: 0, z: 262, bx: 0, bz: 262 };
      landmarks.beach = { x: 252, z: 0, bx: 252, bz: 0 };

      // --- pier (south, over the water's edge is east; pier juts south into the bay) ---
      const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6f4d });
      const pier = new THREE.Mesh(boxGeo, pierMat);
      pier.scale.set(10, 1.2, 46);
      pier.position.set(0, 0, 255);
      pier.castShadow = true;
      scene.add(pier);

      // --- street lamps at intersections (instanced) ---
      const lampSpots = [];
      ROADS.forEach(function (rx) {
        ROADS.forEach(function (rz) {
          lampSpots.push([rx + 9, rz + 9]);
          lampSpots.push([rx - 9, rz - 9]);
        });
      });
      const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
      poleGeo.translate(0, 3.5, 0);
      const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a3f45 });
      const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length);
      const headGeo = new THREE.SphereGeometry(0.42, 8, 6);
      const headMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
      const heads = new THREE.InstancedMesh(headGeo, headMat, lampSpots.length);
      const dummy = new THREE.Object3D();
      lampSpots.forEach(function (p, i) {
        dummy.position.set(p[0], 0, p[1]);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        poles.setMatrixAt(i, dummy.matrix);
        dummy.position.set(p[0], 7.1, p[1]);
        dummy.updateMatrix();
        heads.setMatrixAt(i, dummy.matrix);
      });
      poles.castShadow = false;
      scene.add(poles);
      scene.add(heads);

      // --- palms along Ocean Drive (beach road) ---
      for (let z = -220; z <= 220; z += 22) {
        this._addPalm(scene, 236, z + 4, rng);
        if (z % 44 === 0) this._addPalm(scene, 226, z - 6, rng);
      }
    },

    /** One palm tree: trunk cylinder + two squashed spheres as a crown. */
    _addPalm: function (scene, x, z, rng) {
      const h = 6 + rng() * 3;
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.34, h, 6),
        new THREE.MeshLambertMaterial({ color: 0x8a6f4d })
      );
      trunk.position.set(x, h / 2, z);
      trunk.rotation.z = (rng() - 0.5) * 0.14;
      trunk.castShadow = true;
      scene.add(trunk);
      const crownMat = new THREE.MeshLambertMaterial({ color: 0x2e7d32 });
      const crownMat2 = new THREE.MeshLambertMaterial({ color: 0x43a047 });
      const c1 = new THREE.Mesh(new THREE.SphereGeometry(2.4, 8, 6), crownMat);
      c1.scale.set(1.4, 0.5, 1.4);
      c1.position.set(x, h + 0.6, z);
      c1.castShadow = true;
      scene.add(c1);
      const c2 = new THREE.Mesh(new THREE.SphereGeometry(1.7, 8, 6), crownMat2);
      c2.scale.set(1.3, 0.45, 1.3);
      c2.position.set(x + 0.5, h + 1.4, z + 0.3);
      c2.castShadow = true;
      scene.add(c2);
      addBoxCollider(x - 0.5, x + 0.5, z - 0.5, z + 0.5);
    },

    /** Push a circle (x, z, radius) out of buildings, water and the world edge. */
    collideCircle: function (x, z, r) {
      // World bounds + water.
      x = U.clamp(x, -CFG.WORLD_HALF + 4, CFG.WATER_X - 4);
      z = U.clamp(z, -CFG.WORLD_HALF + 4, CFG.WORLD_HALF - 4);
      for (let i = 0; i < colliders.length; i++) {
        const c = colliders[i];
        const nx = U.clamp(x, c.minX, c.maxX);
        const nz = U.clamp(z, c.minZ, c.maxZ);
        const dx = x - nx, dz = z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 0.0001) {
            const d = Math.sqrt(d2);
            x = nx + (dx / d) * r;
            z = nz + (dz / d) * r;
          } else {
            // Centre inside the box: push out along the smallest penetration.
            const pl = x - c.minX + r, pr = c.maxX - x + r;
            const pt = z - c.minZ + r, pb = c.maxZ - z + r;
            const m = Math.min(pl, pr, pt, pb);
            if (m === pl) x = c.minX - r;
            else if (m === pr) x = c.maxX + r;
            else if (m === pt) z = c.minZ - r;
            else z = c.maxZ + r;
          }
        }
      }
      return { x: x, z: z };
    },

    isOnRoad: function (x, z) {
      const hw = CFG.ROAD_W / 2 + 1;
      for (let i = 0; i < CFG.ROADS.length; i++) {
        if (Math.abs(x - CFG.ROADS[i]) < hw || Math.abs(z - CFG.ROADS[i]) < hw) return true;
      }
      return false;
    },

    nearestRoadCentre: function (v) {
      let best = CFG.ROADS[0];
      let bd = Math.abs(v - best);
      for (let i = 1; i < CFG.ROADS.length; i++) {
        const d = Math.abs(v - CFG.ROADS[i]);
        if (d < bd) { bd = d; best = CFG.ROADS[i]; }
      }
      return best;
    },

    randomRoadPoint: function (rng) {
      const horizontal = rng() < 0.5;
      const road = CFG.ROADS[Math.floor(rng() * CFG.ROADS.length)];
      const along = (rng() * 2 - 1) * 210;
      return horizontal ? { x: along, z: road } : { x: road, z: along };
    },

    randomSidewalkPoint: function (rng) {
      const p = this.randomRoadPoint(rng);
      // Offset onto the sidewalk beside the road.
      const off = CFG.ROAD_W / 2 + 2.5;
      if (Math.abs(p.x - this.nearestRoadCentre(p.x)) < 1) {
        return { x: p.x + (rng() < 0.5 ? -off : off), z: p.z };
      }
      return { x: p.x, z: p.z + (rng() < 0.5 ? -off : off) };
    },

    update: function (dt, t) {
      if (waterMesh) {
        waterMesh.material.opacity = 0.84 + Math.sin(t * 0.5) * 0.04;
      }
    }
  };
})();
