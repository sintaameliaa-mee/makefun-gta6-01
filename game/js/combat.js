// combat.js — shooting: raycast hits, tracers, muzzle flashes and impacts.
// The player shoots with the pistol; Vipers and police shoot back.
window.SB = window.SB || {};
(function () {
  'use strict';
  const U = SB.utils;

  let sceneRef = null;
  let cameraRef = null;
  let raycaster = null;
  const tracers = [];   // {line, life}
  const flashes = [];   // {sprite, life}
  const puffs = [];     // {sprite, life}
  let flashTex = null;
  let puffTex = null;

  function makeRadialTexture(inner, outer) {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, inner);
    grad.addColorStop(1, outer);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  function findTagged(obj) {
    let o = obj;
    while (o) {
      if (o.userData) {
        if (o.userData.ped) return { kind: 'ped', ped: o.userData.ped };
        if (o.userData.car) return { kind: 'car', car: o.userData.car };
      }
      o = o.parent;
    }
    return null;
  }

  function addTracer(from, to, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
    const mat = new THREE.LineBasicMaterial({ color: color || 0xffe9a8, transparent: true, opacity: 0.9 });
    const line = new THREE.Line(geo, mat);
    sceneRef.add(line);
    tracers.push({ line: line, life: 0.09 });
  }

  function addFlash(pos) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false }));
    sprite.scale.set(0.9, 0.9, 1);
    sprite.position.copy(pos);
    sceneRef.add(sprite);
    flashes.push({ sprite: sprite, life: 0.05 });
  }

  function addPuff(pos, color) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: color || 0xcccccc, transparent: true, opacity: 0.7, depthWrite: false }));
    sprite.scale.set(0.7, 0.7, 1);
    sprite.position.copy(pos);
    sceneRef.add(sprite);
    puffs.push({ sprite: sprite, life: 0.4 });
  }

  SB.combat = {
    init: function (scene, camera) {
      sceneRef = scene;
      cameraRef = camera;
      raycaster = new THREE.Raycaster();
      raycaster.far = 220;
      flashTex = makeRadialTexture('rgba(255,240,160,1)', 'rgba(255,120,0,0)');
      puffTex = makeRadialTexture('rgba(230,230,230,0.9)', 'rgba(230,230,230,0)');
    },

    /** A shot from `from` along `dir`. Damages the first ped or car it hits. */
    shoot: function (from, dir, opts) {
      opts = opts || {};
      const damage = opts.damage || 34;
      const fromPlayer = !!opts.fromPlayer;
      raycaster.set(from, dir);
      const hits = raycaster.intersectObjects(sceneRef.children, true);
      let end = from.clone().add(dir.clone().multiplyScalar(160));
      let hit = null;
      for (let i = 0; i < hits.length; i++) {
        const h = hits[i];
        // Ignore the sky dome and the water surface far away.
        if (h.object.isSprite || h.object.isLine) continue;
        end = h.point.clone();
        hit = h;
        break;
      }
      addTracer(from, end, 0xffe9a8);
      addFlash(from);
      if (hit) {
        const tagged = findTagged(hit.object);
        if (tagged && tagged.kind === 'ped') {
          SB.pedestrians.damagePed(tagged.ped, damage, fromPlayer);
          addPuff(end, 0xaa3333);
        } else if (tagged && tagged.kind === 'car') {
          const car = tagged.car;
          car.health -= damage * 0.6;
          addPuff(end, 0xffcc66);
          if (fromPlayer && car.driver === 'traffic') {
            SB.police.addWanted(1, 'Shooting at traffic');
          }
        } else {
          addPuff(end, 0xbbbbbb);
        }
      }
      SB.audio.shot();
      SB.pedestrians.scaryEvent(from.x, from.z, 26);
      return hit;
    },

    /** A Viper or a cop fires at the player. Hit chance falls with distance. */
    enemyShot: function (ped, playerPos, dist) {
      const from = ped.parts.group.position.clone();
      from.y = 1.4;
      const to = playerPos.clone();
      to.y = 1.2;
      const hitChance = U.clamp(0.42 - dist * 0.008, 0.08, 0.42);
      const hit = Math.random() < hitChance;
      const spread = hit ? 0 : 2.5;
      to.x += (Math.random() - 0.5) * spread;
      to.y += (Math.random() - 0.5) * spread * 0.5;
      to.z += (Math.random() - 0.5) * spread;
      addTracer(from, to, 0xffaa88);
      addFlash(from);
      SB.audio.shot();
      if (hit) SB.player.takeDamage(7 + Math.random() * 5);
    },

    update: function (dt) {
      for (let i = tracers.length - 1; i >= 0; i--) {
        tracers[i].life -= dt;
        if (tracers[i].life <= 0) {
          sceneRef.remove(tracers[i].line);
          tracers[i].line.geometry.dispose();
          tracers.splice(i, 1);
        }
      }
      for (let i = flashes.length - 1; i >= 0; i--) {
        flashes[i].life -= dt;
        if (flashes[i].life <= 0) {
          sceneRef.remove(flashes[i].sprite);
          flashes.splice(i, 1);
        }
      }
      for (let i = puffs.length - 1; i >= 0; i--) {
        const p = puffs[i];
        p.life -= dt;
        p.sprite.position.y += dt * 1.2;
        p.sprite.material.opacity = Math.max(0, p.life * 1.5);
        if (p.life <= 0) {
          sceneRef.remove(p.sprite);
          puffs.splice(i, 1);
        }
      }
    }
  };
})();
