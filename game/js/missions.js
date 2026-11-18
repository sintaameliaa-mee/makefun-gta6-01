// missions.js — the story of Solmar Bay: five missions for fixer Mama Rosa,
// plus taxi fares and ten hidden packages for free-roam play.
window.SB = window.SB || {};
(function () {
  'use strict';
  const U = SB.utils;

  let sceneRef = null;
  let beacon = null;       // 3D marker: light pillar + spinning diamond
  let beaconDiamond = null;
  let beaconColor = 0xffd75e;
  let itemMesh = null;     // briefcase / package waiting to be collected
  let spawnedEnemies = [];
  let getawayCar = null;
  let packages = [];       // {mesh, x, z, taken}
  let fare = null;         // active taxi fare {x, z, pay}
  let fareTimer = 10;

  let missionIndex = 0;    // mission currently offered
  let stepIndex = 0;
  let active = false;
  let enemiesRemaining = 0;
  let nextMissionTimer = 0;
  let storyDone = false;
  let packagesFound = 0;
  let faresDone = 0;

  const MISSIONS = [
    {
      title: 'First Wheels',
      giver: 'MAMA ROSA',
      reward: 150,
      brief: 'Rex, I need wheels moved, and I need a driver I can trust. Steal a car and bring it to my garage.',
      steps: [
        { type: 'steal_car', text: 'Steal a car — walk up to one and press E' },
        { type: 'goto', at: 'garage', text: "Take the car to Rosa's Garage" }
      ]
    },
    {
      title: 'The Pickup',
      giver: 'MAMA ROSA',
      reward: 250,
      brief: 'A package is waiting at the docks. Collect it and run it to the Palm Motel. No police, no drama.',
      steps: [
        { type: 'goto', at: 'docks', text: 'Collect the package at the docks' },
        { type: 'goto', at: 'motel', text: 'Deliver the package to the Palm Motel' }
      ]
    },
    {
      title: 'Hot Pursuit',
      giver: 'MAMA ROSA',
      reward: 300,
      brief: 'The Vipers tipped off the cops — they are all over you. Lose them and lay low.',
      steps: [
        { type: 'lose_wanted', setWanted: 3, text: 'Lose the cops — break line of sight until the heat drops' }
      ]
    },
    {
      title: 'Dockside Deal',
      giver: 'MAMA ROSA',
      reward: 500,
      brief: 'The Vipers are moving in on my docks. Go down there, clear them out, and bring me the briefcase.',
      steps: [
        { type: 'goto', at: 'docks', text: 'Head to the docks' },
        { type: 'kill', count: 4, text: 'Take out the Vipers' },
        { type: 'collect', at: 'docks', item: 'briefcase', text: 'Grab the briefcase' },
        { type: 'goto', at: 'garage', text: 'Bring the briefcase to Rosa' }
      ]
    },
    {
      title: 'The Big Score',
      giver: 'MAMA ROSA',
      reward: 1000,
      brief: 'One last job, Rex: the Solmar Bank. Take the black getaway car, hit the vault, and vanish.',
      steps: [
        { type: 'getaway_car', text: 'Steal the black getaway car' },
        { type: 'goto', at: 'bank', text: 'Reach the Solmar Bank' },
        { type: 'collect', at: 'bank', item: 'cash', text: 'Grab the cash from the vault' },
        { type: 'goto', at: 'safehouse', text: 'Escape to the safehouse' },
        { type: 'lose_wanted', text: 'Lay low until the heat is off' }
      ]
    }
  ];

  function landmark(name) {
    return SB.city.landmarks[name];
  }

  function stepTarget(step) {
    if (step.at) {
      const lm = landmark(step.at);
      return { x: lm.x, z: lm.z, label: step.at };
    }
    return null;
  }

  function makeBeacon() {
    const g = new THREE.Group();
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, 34, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: beaconColor, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
    );
    pillar.position.y = 17;
    g.add(pillar);
    beaconDiamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.1),
      new THREE.MeshBasicMaterial({ color: beaconColor })
    );
    beaconDiamond.position.y = 7;
    g.add(beaconDiamond);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3.0, 24),
      new THREE.MeshBasicMaterial({ color: beaconColor, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    g.add(ring);
    g.visible = false;
    sceneRef.add(g);
    beacon = g;
  }

  function setBeacon(x, z, color) {
    beaconColor = color || 0xffd75e;
    beacon.children.forEach(function (c) {
      if (c.material && c.material.color) c.material.color.setHex(beaconColor);
    });
    beacon.position.set(x, 0, z);
    beacon.visible = true;
  }

  function hideBeacon() { if (beacon) beacon.visible = false; }

  function spawnItem(kind, x, z) {
    clearItem();
    const g = new THREE.Group();
    if (kind === 'briefcase') {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.22), new THREE.MeshLambertMaterial({ color: 0x3a2e1e }));
      box.position.y = 0.4;
      box.castShadow = true;
      g.add(box);
    } else {
      // Cash: a green duffel.
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.5), new THREE.MeshLambertMaterial({ color: 0x2e7d32 }));
      bag.position.y = 0.35;
      bag.castShadow = true;
      g.add(bag);
    }
    const glow = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.8, 10, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x7dff8a, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })
    );
    glow.position.y = 5;
    g.add(glow);
    g.position.set(x, 0, z);
    sceneRef.add(g);
    itemMesh = g;
  }

  function clearItem() {
    if (itemMesh) {
      sceneRef.remove(itemMesh);
      itemMesh = null;
    }
  }

  function spawnStepEnemies() {
    const docks = landmark('docks');
    const spots = [
      { x: docks.bx - 8, z: docks.bz - 6 },
      { x: docks.bx + 10, z: docks.bz - 10 },
      { x: docks.bx - 4, z: docks.bz + 12 },
      { x: docks.bx + 12, z: docks.bz + 8 }
    ];
    spawnedEnemies = spots.map(function (s) {
      return SB.pedestrians.spawnEnemy(s.x, s.z);
    });
    enemiesRemaining = spawnedEnemies.length;
  }

  function clearStepEnemies() {
    spawnedEnemies.forEach(function (e) {
      if (!e.dead) SB.pedestrians.removePed(e);
    });
    spawnedEnemies = [];
  }

  function spawnGetawayCar() {
    const bank = landmark('bank');
    getawayCar = SB.vehicles.spawnCar(bank.bx + 34, bank.bz + 6, Math.PI / 2, 'sports', {
      driver: 'parked', color: 0x111111
    });
    return getawayCar;
  }

  function currentMission() { return MISSIONS[missionIndex]; }
  function currentStep() {
    const m = currentMission();
    return m ? m.steps[stepIndex] : null;
  }

  function setupStep() {
    const step = currentStep();
    if (!step) return;
    clearItem();
    if (step.type === 'goto' || step.type === 'collect') {
      const t = stepTarget(step);
      setBeacon(t.x, t.z, 0xffd75e);
      if (step.type === 'collect') spawnItem(step.item, t.x, t.z);
    } else if (step.type === 'kill') {
      spawnStepEnemies();
      const t = stepTarget({ at: 'docks' });
      setBeacon(t.x, t.z, 0xff5040);
    } else if (step.type === 'getaway_car') {
      const car = spawnGetawayCar();
      setBeacon(car.group.position.x, car.group.position.z, 0xffd75e);
    } else if (step.type === 'lose_wanted') {
      if (step.setWanted) SB.police.setWanted(step.setWanted);
      hideBeacon();
    } else {
      hideBeacon();
    }
    SB.hud.setObjective(step.text, stepTarget(step));
  }

  function passMission() {
    const m = currentMission();
    active = false;
    hideBeacon();
    clearItem();
    SB.player.addMoney(m.reward);
    if (missionIndex === 0) {
      SB.player.givePistol();
      SB.hud.showMessage('MAMA ROSA', 'Good driving. Take this pistol — you will need it.');
    }
    if (missionIndex === 3) {
      SB.player.armor = 50;
    }
    SB.audio.missionPass();
    SB.hud.showBanner('MISSION PASSED', m.title + '  —  +' + U.fmtMoney(m.reward));
    SB.save.saveGame();
    missionIndex++;
    stepIndex = 0;
    if (missionIndex >= MISSIONS.length) {
      storyDone = true;
      SB.hud.showMessage('MAMA ROSA', 'That is the whole story, Rex. Solmar Bay is yours now — keep the change.');
    } else {
      nextMissionTimer = 5;
    }
  }

  function startMission(i) {
    missionIndex = i;
    stepIndex = 0;
    active = true;
    const m = currentMission();
    SB.hud.showBanner(m.title, 'MAMA ROSA');
    SB.hud.showMessage(m.giver, m.brief);
    setupStep();
  }

  // Hidden packages: ten green parcels tucked around the city.
  const PACKAGE_SPOTS = [
    { x: 250, z: -180 }, { x: 250, z: 120 }, { x: 0, z: 272 }, { x: -200, z: -200 },
    { x: -116, z: -58 }, { x: 58, z: 0 }, { x: 174, z: -116 }, { x: -58, z: 174 },
    { x: 116, z: 58 }, { x: -174, z: 58 }
  ];

  function buildPackages() {
    PACKAGE_SPOTS.forEach(function (s) {
      const g = new THREE.Group();
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshLambertMaterial({ color: 0x2fae4e, emissive: 0x1a5e2a }));
      box.position.y = 0.9;
      box.castShadow = true;
      g.add(box);
      const glow = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.6, 8, 10, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x7dff8a, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })
      );
      glow.position.y = 4;
      g.add(glow);
      g.position.set(s.x, 0, s.z);
      sceneRef.add(g);
      packages.push({ mesh: g, x: s.x, z: s.z, taken: false });
    });
  }

  function offerFare() {
    const spots = ['garage', 'bank', 'motel', 'hospital', 'police', 'docks', 'pier', 'beach'];
    const name = spots[Math.floor(Math.random() * spots.length)];
    const lm = landmark(name);
    fare = { x: lm.x, z: lm.z, pay: 40 + Math.floor(Math.random() * 5) * 10, name: name };
    SB.hud.showMessage('FARE', 'Take me to the ' + name + ', please. Quick!');
    setBeacon(fare.x, fare.z, 0x7dff8a);
    SB.hud.setObjective('Taxi fare: drop the passenger at the ' + name, { x: fare.x, z: fare.z });
  }

  SB.missions = {
    init: function (scene) {
      sceneRef = scene;
      makeBeacon();
      buildPackages();
    },

    get active() { return active; },
    get index() { return missionIndex; },
    get storyDone() { return storyDone; },
    get packagesFound() { return packagesFound; },
    get faresDone() { return faresDone; },
    get totalMissions() { return MISSIONS.length; },
    get beaconPos() {
      return beacon && beacon.visible ? { x: beacon.position.x, z: beacon.position.z } : null;
    },

    startFirst: function () { startMission(0); },
    startMission: startMission,

    /** Jump the current mission to a later step (the ?scene=mission preset). */
    jumpToStep: function (i) {
      stepIndex = i;
      setupStep();
    },

    restartMission: function () {
      clearStepEnemies();
      clearItem();
      if (getawayCar && getawayCar.driver === 'parked') {
        SB.vehicles.removeCar(getawayCar);
        getawayCar = null;
      }
      stepIndex = 0;
      active = true;
      SB.hud.showMessage('MAMA ROSA', 'Shake it off. Run it again.');
      setupStep();
    },

    onEnemyDown: function (ped) {
      const step = currentStep();
      if (active && step && step.type === 'kill') {
        enemiesRemaining = Math.max(0, enemiesRemaining - 1);
      }
    },

    currentObjective: function () {
      const step = currentStep();
      if (!active || !step) return null;
      let text = step.text;
      if (step.type === 'kill') text += ' (' + enemiesRemaining + ' left)';
      const t = stepTarget(step);
      return { text: text, x: t ? t.x : null, z: t ? t.z : null };
    },

    /** Continue a saved game at a later mission. */
    setProgress: function (index, done) {
      missionIndex = index;
      storyDone = !!done;
      active = false;
      stepIndex = 0;
    },

    setPackagesFound: function (n, takenList) {
      packagesFound = n;
      if (takenList) {
        takenList.forEach(function (i) {
          if (packages[i]) {
            packages[i].taken = true;
            packages[i].mesh.visible = false;
          }
        });
      }
    },

    takenPackages: function () {
      const out = [];
      packages.forEach(function (p, i) { if (p.taken) out.push(i); });
      return out;
    },

    update: function (dt) {
      // Beacon diamond spin.
      if (beacon && beacon.visible && beaconDiamond) {
        beaconDiamond.rotation.y += dt * 2;
        beaconDiamond.position.y = 7 + Math.sin(performance.now() * 0.002) * 0.6;
      }
      // Package spin + pickup.
      const pp = SB.G.playerPos;
      packages.forEach(function (p, i) {
        if (p.taken) return;
        p.mesh.children[0].rotation.y += dt * 1.5;
        if (U.dist2D(pp.x, pp.z, p.x, p.z) < 3) {
          p.taken = true;
          p.mesh.visible = false;
          packagesFound++;
          SB.player.addMoney(50);
          SB.audio.chime();
          SB.hud.showMessage('PACKAGE', 'Hidden package ' + packagesFound + '/10 — +$50.');
        }
      });
      // Taxi fares while driving a cab.
      const car = SB.player.inCar;
      if (car && car.isTaxi) {
        if (fare) {
          if (U.dist2D(pp.x, pp.z, fare.x, fare.z) < 9) {
            SB.player.addMoney(fare.pay);
            SB.audio.chime();
            SB.hud.showMessage('FARE', 'Thanks! Here is ' + U.fmtMoney(fare.pay) + '.');
            faresDone++;
            fare = null;
            fareTimer = 12 + Math.random() * 10;
            const obj = this.currentObjective();
            if (obj) SB.hud.setObjective(obj.text, obj.x !== null ? { x: obj.x, z: obj.z } : null);
            else hideBeacon();
          }
        } else {
          fareTimer -= dt;
          if (fareTimer <= 0) offerFare();
        }
      } else if (fare) {
        fare = null;
        hideBeacon();
      }
      // Next mission countdown.
      if (!active && !storyDone && nextMissionTimer > 0) {
        nextMissionTimer -= dt;
        if (nextMissionTimer <= 0) startMission(missionIndex);
      }
      if (!active) return;
      // Current step check.
      const step = currentStep();
      if (!step) return;
      let done = false;
      if (step.type === 'goto') {
        const t = stepTarget(step);
        if (U.dist2D(pp.x, pp.z, t.x, t.z) < 9) done = true;
      } else if (step.type === 'collect') {
        const t = stepTarget(step);
        if (U.dist2D(pp.x, pp.z, t.x, t.z) < 4) done = true;
      } else if (step.type === 'steal_car') {
        if (SB.player.inCar) done = true;
      } else if (step.type === 'getaway_car') {
        if (SB.player.inCar === getawayCar) done = true;
      } else if (step.type === 'kill') {
        if (enemiesRemaining <= 0) done = true;
      } else if (step.type === 'lose_wanted') {
        if (SB.police.wanted === 0) done = true;
      }
      if (done) {
        // Step rewards that are not money.
        if (step.type === 'collect' && step.item === 'cash') {
          SB.police.setWanted(4);
          SB.hud.showMessage('DISPATCH', 'Alarm at the Solmar Bank — all units respond!');
        }
        stepIndex++;
        if (stepIndex >= currentMission().steps.length) {
          passMission();
        } else {
          SB.audio.chime();
          setupStep();
        }
      }
    }
  };
})();
