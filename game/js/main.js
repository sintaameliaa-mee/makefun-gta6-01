// main.js — boots Solmar Bay: renderer, lights, the game loop, the camera,
// keyboard/mouse input, menu states, and the ?scene= presets the screenshots
// use (each one is real gameplay, started in a set-up state).
window.SB = window.SB || {};
(function () {
  'use strict';
  const U = SB.utils;

  // Error trap: the play-test reads these to prove the game runs clean.
  window.__solmarErrors = [];
  window.__solmarReady = false;
  window.addEventListener('error', function (e) {
    window.__solmarErrors.push(e.message || 'error');
    const trap = document.getElementById('error-trap');
    if (trap) trap.textContent = window.__solmarErrors.join(' | ');
  });

  // Shared live state every module reads.
  SB.G = {
    state: 'menu', // menu | playing | paused | busted | wasted
    frame: 0,
    timeMinutes: SB.config.START_TIME_MINUTES,
    shake: 0,
    playerPos: new THREE.Vector3(0, 0, 0),
    playerVel: { x: 0, z: 0 },
    playerHeading: 0,
    sceneMode: null, // 'chase' | 'street' | 'mission' | 'drive'
    autoDrive: false,
    autoRoadX: 0,
    preroll: false,   // true while a scene fast-forwards before its first frame
    prerollSeconds: 0
  };

  let renderer, scene, camera, sun, sunTarget;
  let camYaw = Math.PI, camPitch = 0.34, camDist = 7.5;
  let carCamYaw = 0;
  let snapCameraNext = false; // put the camera exactly behind the player at once
  let debugMode = false;
  let menuAngle = 0;
  let lastPlayerPos = null;
  let clock = null;
  let input = { forward: false, back: false, left: false, right: false, sprint: false, jump: false, handbrake: false };
  let respawnPoint = null;

  const SUN_OFFSET = new THREE.Vector3(-90, 130, 55);

  function buildLights() {
    const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 1.0);
    scene.add(hemi);
    sun = new THREE.DirectionalLight(0xffe3b3, 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -100;
    sun.shadow.camera.right = 100;
    sun.shadow.camera.top = 100;
    sun.shadow.camera.bottom = -100;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 420;
    sun.shadow.bias = -0.0006;
    sunTarget = new THREE.Object3D();
    scene.add(sunTarget);
    sun.target = sunTarget;
    scene.add(sun);
    // Warm bounce light so shadows never go black.
    const bounce = new THREE.DirectionalLight(0xffd9b0, 0.35);
    bounce.position.set(60, 40, -60);
    scene.add(bounce);
  }

  function newGame() {
    SB.save.clearSave();
    SB.police.reset();
    SB.player.money = 120;
    SB.player.health = 100;
    SB.player.armor = 0;
    SB.player.weapon = 'fists';
    SB.player.dead = false;
    SB.player.forceExitCar();
    const g = SB.city.landmarks.garage;
    SB.player.parts.group.position.set(g.x, 0, g.z + 10);
    SB.player.parts.group.visible = true;
    SB.G.timeMinutes = SB.config.START_TIME_MINUTES;
    SB.missions.setProgress(0, false);
    SB.hud.showScreen('none');
    SB.G.state = 'playing';
    SB.missions.startFirst();
    snapCameraNext = true;
    lockPointer();
  }

  function continueGame() {
    const data = SB.save.loadGame();
    if (!data) { newGame(); return; }
    SB.police.reset();
    SB.player.dead = false;
    SB.player.forceExitCar();
    SB.player.parts.group.visible = true;
    SB.save.applySave(data);
    SB.hud.showScreen('none');
    SB.G.state = 'playing';
    if (!data.storyDone) {
      SB.missions.startMission(data.missionIndex);
    } else {
      SB.hud.setObjective('Explore Solmar Bay', null);
    }
    SB.hud.showMessage('SOLMAR BAY', 'Welcome back, Rex.');
    snapCameraNext = true;
    lockPointer();
  }

  function pauseGame() {
    if (SB.G.state !== 'playing') return;
    SB.G.state = 'paused';
    SB.audio.engine(false, 0);
    SB.audio.siren(false);
    SB.hud.setPauseStats(
      'Money ' + U.fmtMoney(SB.player.money) +
      '  •  Missions ' + SB.missions.index + '/' + SB.missions.totalMissions +
      '  •  Packages ' + SB.missions.packagesFound + '/10' +
      '  •  Fares ' + SB.missions.faresDone
    );
    SB.hud.showScreen('pause');
    if (document.exitPointerLock) document.exitPointerLock();
  }

  function resumeGame() {
    if (SB.G.state !== 'paused') return;
    SB.G.state = 'playing';
    SB.hud.showScreen('none');
    lockPointer();
  }

  function quitToTitle() {
    SB.G.state = 'menu';
    SB.police.reset();
    SB.audio.engine(false, 0);
    SB.audio.siren(false);
    SB.hud.setContinueAvailable(SB.save.hasSave());
    SB.hud.showScreen('start');
    if (document.exitPointerLock) document.exitPointerLock();
  }

  function respawn() {
    const wasBusted = SB.G.state === 'busted';
    SB.player.dead = false;
    SB.player.forceExitCar();
    SB.player.parts.group.visible = true;
    SB.police.reset();
    const spot = wasBusted ? SB.city.landmarks.police : SB.city.landmarks.hospital;
    SB.player.parts.group.position.set(spot.x, 0, spot.z + 8);
    SB.player.health = 100;
    SB.player.addMoney(wasBusted ? -200 : -300);
    SB.G.state = 'playing';
    SB.hud.showScreen('none');
    if (SB.missions.active) SB.missions.restartMission();
    SB.hud.showMessage(wasBusted ? 'POLICE' : 'HOSPITAL', wasBusted ? 'You made bail. Stay out of trouble.' : 'Patched up. Try not to get shot again.');
    snapCameraNext = true;
    lockPointer();
  }

  function lockPointer() {
    if (SB.G.sceneMode) return; // screenshots run without a mouse
    try {
      const c = renderer.domElement;
      if (document.pointerLockElement !== c) c.requestPointerLock();
    } catch (e) {}
  }

  // ---- screenshot / demo scenes: real gameplay from a set-up state ----
  function applyScene(name) {
    SB.G.sceneMode = name;
    SB.hud.showScreen('none');
    SB.G.state = 'playing';
    SB.player.dead = false;
    if (name === 'chase') {
      // Player fleeing north up Ocean Avenue in a sports car, 3 stars, two
      // units behind and the safehouse as the objective.
      const car = SB.vehicles.spawnCar(-29, -150, 0, 'sports', { driver: 'player', color: 0xb03030 });
      SB.player.inCar = car;
      SB.player.parts.group.visible = false;
      car.speed = 26;
      SB.G.autoDrive = true;
      SB.G.autoRoadX = -29;
      SB.police.setWanted(3);
      // Clear the chase road of traffic so the pursuit runs clean.
      SB.vehicles.list.slice().forEach(function (c) {
        if (c.driver === 'traffic') {
          const p = c.group.position;
          if (Math.abs(p.x + 29) < 12 && p.z > -230 && p.z < 120) SB.vehicles.removeCar(c);
        }
      });
      const c1 = SB.vehicles.spawnCar(-29, -202, 0, 'police', { driver: 'police', police: true, color: 0xf2f2f2, withDriver: true });
      const c2 = SB.vehicles.spawnCar(-25, -216, 0, 'police', { driver: 'police', police: true, color: 0xf2f2f2, withDriver: true });
      // One unit ahead in the next lane — the player closes on it.
      const c3 = SB.vehicles.spawnCar(-25, -108, 0, 'police', { driver: 'police', police: true, color: 0xf2f2f2, withDriver: true });
      c1.speed = 26; c2.speed = 26; c3.speed = 18;
      SB.police.copCars.push(c1, c2, c3);
      SB.player.addMoney(1250);
      SB.player.givePistol();
      SB.hud.setObjective('Escape the police — reach the safehouse', SB.city.landmarks.safehouse);
      SB.G.prerollSeconds = 2.5;
      carCamYaw = 0;
    } else if (name === 'street') {
      // On foot on Ocean Avenue by downtown, traffic and pedestrians around.
      SB.player.parts.group.position.set(29, 0, 80);
      SB.player.heading = Math.PI * 1.5;
      SB.player.givePistol();
      SB.player.addMoney(850);
      SB.hud.setObjective('Explore Solmar Bay — find your next job', null);
      SB.G.prerollSeconds = 2.5;
      camYaw = Math.PI / 2;
    } else if (name === 'mission') {
      // Mission 4 in progress at the docks: Vipers in sight, pistol out.
      SB.missions.startMission(3);
      SB.missions.jumpToStep(1);
      const docks = SB.city.landmarks.docks;
      SB.player.parts.group.position.set(docks.bx - 24, 0, docks.bz + 4);
      SB.player.heading = Math.PI / 2;
      SB.player.givePistol();
      SB.player.addMoney(2100);
      SB.G.prerollSeconds = 2.5;
      camYaw = SB.player.heading + Math.PI;
    } else if (name === 'drive') {
      // Golden-hour cruise down Ocean Drive by the beach.
      const car = SB.vehicles.spawnCar(203, -120, 0, 'sports', { driver: 'player', color: 0x4aa8b8 });
      SB.player.inCar = car;
      SB.player.parts.group.visible = false;
      car.speed = 22;
      SB.G.autoDrive = true;
      SB.G.autoRoadX = 203;
      SB.player.addMoney(640);
      SB.hud.setObjective('Cruise Ocean Drive', SB.city.landmarks.pier);
      SB.G.prerollSeconds = 4;
      carCamYaw = 0;
    }
    snapCameraNext = true;
  }

  function autoDriveControl() {
    const car = SB.player.inCar;
    if (!car) return;
    const pos = car.group.position;
    // Stay on the road: aim 26 m ahead on the road's centreline.
    const tx = SB.G.autoRoadX + 3.4;
    const tz = pos.z + 26;
    const targetHeading = Math.atan2(tx - pos.x, tz - pos.z);
    const dh = U.angleDiff(car.heading, targetHeading);
    car.control.steer = U.clamp(dh * 2.0, -1, 1);
    car.control.throttle = car.speed < 26 ? 1 : 0.2;
    car.control.handbrake = false;
    // Loop back if the road runs out.
    if (pos.z > 200) {
      car.group.position.set(SB.G.autoRoadX, 0, -190);
      car.heading = 0;
      car.speed = 24;
    }
  }

  function updateCamera(dt) {
    const P = SB.player;
    let target, desired, lookAt;
    if (P.inCar) {
      const car = P.inCar;
      const cp = car.group.position;
      // Chase camera: settle behind the car's heading; the mouse can orbit it.
      carCamYaw = U.angleLerp(carCamYaw, car.heading, 1 - Math.exp(-2.2 * dt));
      const yaw = carCamYaw;
      target = new THREE.Vector3(cp.x, 1.4, cp.z);
      desired = new THREE.Vector3(
        cp.x - Math.sin(yaw) * 8,
        3.1,
        cp.z - Math.cos(yaw) * 8
      );
      lookAt = new THREE.Vector3(cp.x + Math.sin(car.heading) * 6, 1.4, cp.z + Math.cos(car.heading) * 6);
      const targetFov = 60 + Math.min(Math.abs(car.speed) * 0.35, 14);
      camera.fov = U.damp(camera.fov, targetFov, 3, dt);
      camera.updateProjectionMatrix();
    } else {
      const pp = P.parts.group.position;
      target = new THREE.Vector3(pp.x, 1.7 + pp.y, pp.z);
      const dist = camDist;
      desired = new THREE.Vector3(
        pp.x + Math.sin(camYaw) * Math.cos(camPitch) * dist,
        1.7 + pp.y + Math.sin(camPitch) * dist,
        pp.z + Math.cos(camYaw) * Math.cos(camPitch) * dist
      );
      lookAt = target;
      camera.fov = U.damp(camera.fov, 60, 3, dt);
      camera.updateProjectionMatrix();
    }
    if (desired.y < 1.1) desired.y = 1.1;
    if (snapCameraNext) {
      // First frame of a scene: frame the shot at once, no slow drift in.
      camera.position.copy(desired);
      snapCameraNext = false;
    } else {
      const k = 1 - Math.exp(-10 * dt);
      camera.position.lerp(desired, k);
    }
    // Impact shake.
    if (SB.G.shake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * SB.G.shake;
      camera.position.y += (Math.random() - 0.5) * SB.G.shake;
      SB.G.shake *= Math.exp(-4 * dt);
    }
    camera.lookAt(lookAt);
    void target;
  }

  function updateMenuCamera(dt) {
    menuAngle += dt * 0.03;
    const r = 150;
    camera.position.set(Math.sin(menuAngle) * r, 85, Math.cos(menuAngle) * r);
    camera.lookAt(0, 0, 0);
  }

  function bindInput() {
    const KEYMAP = {
      KeyW: 'forward', ArrowUp: 'forward',
      KeyS: 'back', ArrowDown: 'back',
      KeyA: 'left', ArrowLeft: 'left',
      KeyD: 'right', ArrowRight: 'right',
      ShiftLeft: 'sprint', ShiftRight: 'sprint',
      Space: 'jump'
    };
    document.addEventListener('keydown', function (e) {
      if (e.code === 'Space') e.preventDefault();
      const mapped = KEYMAP[e.code];
      if (mapped) input[mapped] = true;
      if (e.repeat) return;
      if (e.code === 'KeyE' && SB.G.state === 'playing') SB.player.toggleCar();
      if (e.code === 'KeyF' && SB.G.state === 'playing') SB.player.punchKey();
      if (e.code === 'KeyR' && SB.G.state === 'playing') SB.player.reload();
      if (e.code === 'KeyM') {
        const m = !SB.audio.isMuted();
        SB.audio.setMuted(m);
        const b = document.getElementById('btn-mute');
        if (b) b.textContent = m ? 'UNMUTE (M)' : 'MUTE (M)';
      }
      if ((e.code === 'Escape' || e.code === 'KeyP')) {
        if (SB.G.state === 'playing') pauseGame();
        else if (SB.G.state === 'paused') resumeGame();
      }
      if (e.code === 'Enter' && (SB.G.state === 'busted' || SB.G.state === 'wasted')) respawn();
    });
    document.addEventListener('keyup', function (e) {
      const mapped = KEYMAP[e.code];
      if (mapped) input[mapped] = false;
    });
    document.addEventListener('mousemove', function (e) {
      if (document.pointerLockElement !== renderer.domElement) return;
      camYaw -= e.movementX * 0.0024;
      camPitch = U.clamp(camPitch + e.movementY * 0.0022, -0.05, 1.15);
      carCamYaw -= e.movementX * 0.0024;
    });
    renderer.domElement.addEventListener('mousedown', function (e) {
      if (SB.G.state !== 'playing') return;
      if (e.button !== 0) return;
      if (document.pointerLockElement !== renderer.domElement && !SB.G.sceneMode) {
        lockPointer();
        return;
      }
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      SB.player.attack(dir);
    });
    renderer.domElement.addEventListener('wheel', function (e) {
      camDist = U.clamp(camDist + e.deltaY * 0.005, 5, 12);
    }, { passive: true });
    document.addEventListener('pointerlockchange', function () {
      if (document.pointerLockElement !== renderer.domElement && SB.G.state === 'playing' && !SB.G.sceneMode) {
        pauseGame();
      }
    });
    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  function updatePlaying(dt) {
    // Player velocity, for the police lead and the HUD.
    const pos = SB.player.pos();
    if (lastPlayerPos) {
      SB.G.playerVel.x = (pos.x - lastPlayerPos.x) / Math.max(dt, 0.001);
      SB.G.playerVel.z = (pos.z - lastPlayerPos.z) / Math.max(dt, 0.001);
    }
    lastPlayerPos = { x: pos.x, z: pos.z };
    SB.G.playerPos.copy(pos);
    SB.G.playerPos.y = 0;
    SB.G.playerHeading = SB.player.inCar ? SB.player.inCar.heading : SB.player.heading;
    SB.G.timeMinutes += dt / 3;

    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    if (SB.G.autoDrive) {
      autoDriveControl();
    } else {
      input.handbrake = input.jump; // Space is the handbrake while driving
      SB.player.update(dt, input, camYaw, camDir);
    }
    if (SB.G.autoDrive) SB.audio.engine(true, Math.abs(SB.player.inCar.speed) / SB.player.inCar.spec.maxSpeed);
    SB.vehicles.update(dt, SB.G.playerPos);
    SB.pedestrians.update(dt, { playerPos: SB.G.playerPos });
    SB.police.update(dt);
    SB.missions.update(dt);
    SB.combat.update(dt);
    SB.city.update(dt, SB.G.timeMinutes);
    SB.audio.update(dt);
    // Sun follows the player so shadows stay crisp.
    sun.position.copy(SB.G.playerPos).add(SUN_OFFSET);
    sunTarget.position.copy(SB.G.playerPos);
    // Wasted / busted transitions.
    if (SB.G.state === 'wasted') {
      SB.hud.showScreen('wasted');
      SB.audio.engine(false, 0);
      SB.audio.siren(false);
    } else if (SB.G.state === 'busted') {
      SB.hud.showScreen('busted');
      SB.audio.engine(false, 0);
      SB.audio.siren(false);
    }
    SB.hud.update(dt);
  }

  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    SB.G.frame++;
    if (debugMode) {
      const m = document.getElementById('ready-marker');
      if (m) {
        m.textContent = 'ready frame=' + SB.G.frame +
          ' cam=' + camera.position.x.toFixed(0) + ',' + camera.position.y.toFixed(0) + ',' + camera.position.z.toFixed(0) +
          ' player=' + SB.G.playerPos.x.toFixed(0) + ',' + SB.G.playerPos.z.toFixed(0);
      }
    }
    if (SB.G.state === 'menu') {
      updateMenuCamera(dt);
      SB.vehicles.update(dt, null);
      SB.pedestrians.update(dt, { playerPos: SB.G.playerPos });
      SB.city.update(dt, SB.G.timeMinutes);
      renderer.render(scene, camera);
    } else if (SB.G.state === 'playing') {
      updatePlaying(dt);
      updateCamera(dt);
      renderer.render(scene, camera);
    } else if (SB.G.state === 'paused') {
      renderer.render(scene, camera);
    } else {
      // Busted / wasted: frozen scene behind the overlay.
      renderer.render(scene, camera);
    }
    if (!window.__solmarReady) {
      window.__solmarReady = true;
      const m = document.getElementById('ready-marker');
      if (m) m.textContent = 'ready';
    }
  }

  function init() {
    const params = new URLSearchParams(window.location.search);
    const sceneName = params.get('scene');
    debugMode = params.has('debug');
    const canvasHost = document.getElementById('game');
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    canvasHost.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xe8c493, 170, 780);
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(120, 80, 120);

    buildLights();
    SB.city.build(scene);
    SB.vehicles.init(scene);
    SB.pedestrians.init(scene, 36);
    const g = SB.city.landmarks.garage;
    SB.player.init(scene, g.x, g.z + 10);
    SB.police.init(scene);
    SB.combat.init(scene, camera);
    SB.missions.init(scene);
    SB.hud.init({
      onNewGame: newGame,
      onContinue: continueGame,
      onResume: resumeGame,
      onSave: function () {
        if (SB.save.saveGame()) {
          SB.hud.showMessage('SAVED', 'Game saved. Progress is safe.');
        } else {
          SB.hud.showMessage('SAVE', 'Could not save in this browser.');
        }
      },
      onRestartMission: function () {
        if (SB.missions.active) {
          SB.missions.restartMission();
          resumeGame();
        } else {
          SB.hud.showMessage('MISSIONS', 'No mission is running right now.');
        }
      },
      onQuit: quitToTitle
    });
    SB.hud.setContinueAvailable(SB.save.hasSave());
    bindInput();
    clock = new THREE.Clock();

    // Player starts near Rosa's garage.
    SB.G.playerPos.copy(SB.player.pos());
    SB.G.playerHeading = SB.player.heading;
    sun.position.copy(SB.G.playerPos).add(SUN_OFFSET);
    sunTarget.position.copy(SB.G.playerPos);

    if (sceneName) {
      applyScene(sceneName);
      // Fast-forward the scene before its first frame so the shot is already
      // alive: cars up to speed, cops in pursuit, traffic spread out.
      SB.G.preroll = true;
      const steps = Math.round((SB.G.prerollSeconds || 3) * 60);
      for (let i = 0; i < steps; i++) updatePlaying(1 / 60);
      SB.G.preroll = false;
    } else {
      SB.hud.showScreen('start');
    }
    loop();
  }

  // A tiny public handle for the play-test and for debugging in the console.
  SB.main = { init: init };
  window.addEventListener('DOMContentLoaded', init);
})();
