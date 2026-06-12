import * as THREE from 'three';
import { RoomEnvironment }   from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer }    from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }        from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass }          from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass }   from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass }          from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass }        from 'three/addons/postprocessing/ShaderPass.js';
import { VignetteShader }    from 'three/addons/shaders/VignetteShader.js';
import { OutputPass }        from 'three/addons/postprocessing/OutputPass.js';
import { loadQuestions, createPoolManager, CATEGORIES } from './data/loadQuestions.js';
import { buildBoard, makeSectorShape } from './scene/board.js';
import { DiceSystem, createPhysicsWorld } from './scene/dice.js';
import { TokenManager } from './scene/tokens.js';
import { state, pieSVG } from './game/state.js';
import {
  startGame, onRollResult, onPlayerChoseDest, onTokenLanded,
  onCorrect, onMissed,
  onFinalCategoryChosen, onFinalCorrect, onFinalMissed,
} from './game/rules.js';
import { initSetup }    from './ui/setup.js';
import { initHUD }      from './ui/hud.js';
import { initQuestion } from './ui/question.js';
import { initWin }      from './ui/win.js';
import { BOARD }        from './game/boardGraph.js';

/* ================================================================
   Renderer
   ================================================================ */
const canvas   = document.getElementById('game-canvas');
// antialias disabled — SMAA pass handles AA with better quality and less GPU cost
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
renderer.outputColorSpace  = THREE.SRGBColorSpace;
renderer.toneMapping       = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.72;

// IBL environment — RoomEnvironment ships with Three.js, no external files needed
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
const roomEnv = new RoomEnvironment(renderer);
const envTexture = pmrem.fromScene(roomEnv, 0.04).texture;
// Will be assigned to scene.environment after scene is created below

/* ================================================================
   Scene + Camera
   ================================================================ */
const scene  = new THREE.Scene();
scene.background = new THREE.Color(0x15110D);
scene.environment = envTexture;    // IBL reflections on all materials
pmrem.dispose();
roomEnv.dispose();

// Narrower lens (35° vs old 46°) eliminates foreshortening on the board wheel
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.1, 130);
camera.position.set(0, 23, 18);
camera.lookAt(0, 0, 0);

/* ---- Lighting rig (tuned for ACES + IBL) ---- */

// Soft fill from sky/ground — warms the tops, darkens the underside of the board
const hemi = new THREE.HemisphereLight(0xf5e8d0, 0x1a1208, 0.32);
scene.add(hemi);

// Key light: slightly steeper angle for sharper tile shadows
const key = new THREE.DirectionalLight(0xfff8ee, 0.60);
key.position.set(4, 18, 7);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near   = 2;
key.shadow.camera.far    = 55;
key.shadow.camera.left   = -12;
key.shadow.camera.right  =  12;
key.shadow.camera.top    =  12;
key.shadow.camera.bottom = -12;
key.shadow.bias   = -0.0003;
key.shadow.radius =  2.5;
scene.add(key);

// Warm overhead lamp — game-night felt-under-a-lamp glow
const lamp = new THREE.PointLight(0xffcc88, 0.25, 28);
lamp.position.set(0, 13, 0);  // raised so falloff spreads more evenly
scene.add(lamp);

// Rim SpotLight — rakes across the brass ring and hub top
const rimSpot = new THREE.SpotLight(0xffe8aa, 0.80, 38, Math.PI / 5.5, 0.5, 1.6);
rimSpot.position.set(-4, 17, -7);
rimSpot.target.position.set(0, 0, 0);
scene.add(rimSpot);
scene.add(rimSpot.target);

window.addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  composer.setSize(innerWidth, innerHeight);
});

/* ================================================================
   Game objects
   ================================================================ */
const { meshMap, group: boardGroup } = buildBoard(scene);
const physicsWorld = createPhysicsWorld();
const dice   = new DiceSystem(scene, physicsWorld);
const tokens = new TokenManager(scene);

/* ================================================================
   Post-processing — EffectComposer pass chain
   Order: render → AO → bloom → SMAA → vignette → output (tone map)
   ================================================================ */
const composer = new EffectComposer(renderer);

const _renderPass = new RenderPass(scene, camera);
composer.addPass(_renderPass);

// Subtle ground-truth AO — darkens grout lines between tiles
const gtaoPass = new GTAOPass(scene, camera, innerWidth, innerHeight);
gtaoPass.output = GTAOPass.OUTPUT.Default;
gtaoPass.blendIntensity = 0.6;
composer.addPass(gtaoPass);

// Bloom — only the very brightest specular hits on brass/gems; not the lamp halo
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(innerWidth, innerHeight),
  0.20,   // strength  (was 0.40 — halved to kill centre wash)
  0.50,   // radius    (tighter so it doesn't spread far from source)
  0.85    // threshold  (raised so ambient lit areas don't bloom)
);
composer.addPass(bloomPass);

// SMAA — replaces the hardware antialias we disabled above
const smaaPass = new SMAAPass(
  Math.round(innerWidth  * Math.min(devicePixelRatio, 2)),
  Math.round(innerHeight * Math.min(devicePixelRatio, 2))
);
composer.addPass(smaaPass);

// Vignette — cinematic edge darkening
const vignettePass = new ShaderPass(VignetteShader);
vignettePass.uniforms['offset'].value   = 0.90;
vignettePass.uniforms['darkness'].value = 1.55;
composer.addPass(vignettePass);

// OutputPass — applies renderer.toneMapping + SRGBColorSpace to final frame
const outputPass = new OutputPass();
composer.addPass(outputPass);

// Quality toggle — disables AO + Bloom on Low to protect weak GPUs
let _highQuality = true;
function setQuality(high) {
  _highQuality        = high;
  gtaoPass.enabled    = high;
  bloomPass.enabled   = high;
  qualBtn.textContent = high ? 'Quality: High' : 'Quality: Low';
}
// Appended to ctrlBar in the camera system section below
const qualBtn = _mkCtrlBtn('Quality: High');
qualBtn.addEventListener('click', () => setQuality(!_highQuality));

/* ================================================================
   UI controls helper — shared by quality toggle + camera buttons
   ================================================================ */
function _mkCtrlBtn(label) {
  const b = document.createElement('button');
  b.textContent = label;
  Object.assign(b.style, {
    padding: '5px 11px', fontSize: '11px', fontFamily: 'inherit',
    background: 'rgba(0,0,0,0.55)', color: '#c9a35b',
    border: '1px solid #c9a35b44', borderRadius: '5px',
    cursor: 'pointer', letterSpacing: '0.04em',
  });
  return b;
}

/* ================================================================
   Camera system — play-state drift · dice watch · POV · motion
   ================================================================ */

/**
 * Returns the true world-space centre of a board space.
 * Sector tile geometry bakes position into shape points (mesh.position is always
 * at origin), so we derive centre from sectorParams instead of getWorldPosition.
 */
function getTileCenter(spaceId) {
  const mesh = meshMap.get(spaceId);
  if (!mesh) return new THREE.Vector3();
  const sp = mesh.userData.sectorParams;
  if (sp) {
    const mid = (sp.a_start + sp.a_end) / 2;
    const r   = (sp.r_in   + sp.r_out)  / 2;
    // rotation.x=-π/2: local X→world X, local Y→world Z
    return new THREE.Vector3(Math.cos(mid) * r, sp.height / 2, Math.sin(mid) * r);
  }
  // Hub / non-sector: mesh IS positioned in world space
  const p = new THREE.Vector3();
  mesh.getWorldPosition(p);
  return p;
}

const _CAM_BASE  = { y: 23, xz: 18 };
const _CAM_LERP  = 2.2;
let _camCurrentLerp = _CAM_LERP;
const _MAX_DRIFT = Math.PI / 7.2;   // 25° max azimuth shift toward active token

const _cam    = { az: 0, y: _CAM_BASE.y, xz: _CAM_BASE.xz };
const _camTgt = { az: 0, y: _CAM_BASE.y, xz: _CAM_BASE.xz };
let _camPOV          = false;
let _camReduceMotion = false;
let _camDice            = false;
let _camDiceT           = 0;          // 0→1 arc progress
const _camDiceStart     = new THREE.Vector3();
const _camDiceLook      = new THREE.Vector3(0, 0.5, 0);
const _camDiceTargetPos = new THREE.Vector3(0, 4.5, 3);
const _camLookAt        = new THREE.Vector3(0, 0, 0);   // smoothed look-at for exit transition
const _ORIGIN           = new THREE.Vector3(0, 0, 0);

function _camRefreshTarget() {
  if (_camPOV || _camDice) return;
  const spaceId = state.tokenPositions?.[state.currentTeam];
  if (spaceId) {
    const p  = getTileCenter(spaceId);
    const az = Math.atan2(p.x, p.z);   // angle from +Z toward +X
    _camTgt.az = Math.max(-_MAX_DRIFT, Math.min(_MAX_DRIFT, az * 0.40));
  } else {
    _camTgt.az = 0;
  }
  _camTgt.y  = _CAM_BASE.y;
  _camTgt.xz = _CAM_BASE.xz;
}

function _camStartDice() {
  _camDice  = true;
  _camDiceT = 0;
  _camDiceStart.copy(camera.position);
  _camDiceLook.set(0, 0.5, 0);
  _camDiceTargetPos.set(0, 4.5, 3);  // initial guess; tracks die in real time
}

function _camEndDice() {
  // Sync _cam to actual camera position so the drift lerp picks up smoothly
  _cam.az  = Math.atan2(camera.position.x, camera.position.z);
  _cam.y   = camera.position.y;
  _cam.xz  = Math.sqrt(camera.position.x ** 2 + camera.position.z ** 2);
  // Start the smooth look-at transition from where we were looking (die position)
  _camLookAt.copy(_camDiceLook);
  _camDice = false;
  // Slow lerp for the zoom-back — restores to normal after camera reaches base
  _camCurrentLerp = 1.1;
  setTimeout(() => { _camCurrentLerp = _CAM_LERP; }, 3500);
  _camRefreshTarget();
}

/** Resolves once the dice-watch arc reaches t=1 (or immediately if already done). */
function _camDiceWaitForArc() {
  return new Promise(resolve => {
    if (!_camDice || _camDiceT >= 1.0) { resolve(); return; }
    function poll() {
      if (_camDiceT >= 1.0) resolve();
      else requestAnimationFrame(poll);
    }
    requestAnimationFrame(poll);
  });
}

function _camTick(dt) {
  if (_camReduceMotion) return;

  // Dice-watch: quarter-circle ease-out arc — drops fast then flattens onto die
  if (_camDice) {
    _camDiceT = Math.min(1, _camDiceT + dt * 0.58);   // ~1.7 s arc

    if (dice.mesh) {
      const dp = dice.mesh.position;
      _camDiceTargetPos.lerp(
        new THREE.Vector3(dp.x * 0.45, dp.y + 3.5, dp.z * 0.45 + 0.8),
        Math.min(1, 1.8 * dt)
      );
      _camDiceLook.lerp(
        new THREE.Vector3(dp.x, dp.y + 0.25, dp.z),
        Math.min(1, 4 * dt)
      );
    }

    // sin(t·π/2): starts fast (steep dive), slows as it flattens onto the die
    const ease = Math.sin(_camDiceT * Math.PI * 0.5);
    camera.position.set(
      THREE.MathUtils.lerp(_camDiceStart.x, _camDiceTargetPos.x, ease),
      THREE.MathUtils.lerp(_camDiceStart.y, _camDiceTargetPos.y, ease),
      THREE.MathUtils.lerp(_camDiceStart.z, _camDiceTargetPos.z, ease),
    );
    camera.lookAt(_camDiceLook);
    return;
  }

  // POV: position behind active token, looking toward board centre
  if (_camPOV) {
    const spaceId = state.tokenPositions?.[state.currentTeam];
    if (spaceId) {
      const p    = getTileCenter(spaceId);
      const dist = Math.sqrt(p.x * p.x + p.z * p.z);
      let tgt;
      if (dist > 0.5) {
        const ox = p.x / dist, oz = p.z / dist;
        // 10 units radially behind token + 10 units up → roughly normal zoom distance
        tgt = new THREE.Vector3(p.x + ox * 10, p.y + 10, p.z + oz * 10);
      } else {
        // Token at hub — pull back along +Z at height
        tgt = new THREE.Vector3(0, 10, 13);
      }
      camera.position.lerp(tgt, Math.min(1, 2.0 * dt));
      camera.lookAt(0, 0, 0);
    }
    return;
  }

  // Normal drift (uses _camCurrentLerp so exit from dice mode is slower)
  const k = Math.min(1, _camCurrentLerp * dt);
  _cam.az  += (_camTgt.az  - _cam.az)  * k;
  _cam.y   += (_camTgt.y   - _cam.y)   * k;
  _cam.xz  += (_camTgt.xz  - _cam.xz) * k;
  camera.position.set(
    Math.sin(_cam.az) * _cam.xz,
    _cam.y,
    Math.cos(_cam.az) * _cam.xz,
  );
  // Smooth the look-at back toward board center to eliminate snap after dice exit
  _camLookAt.lerp(_ORIGIN, Math.min(1, 4.5 * dt));
  camera.lookAt(_camLookAt);
}

// --- Controls bar (bottom-right) ---
const motionBtn = _mkCtrlBtn('Motion: On');
motionBtn.addEventListener('click', () => {
  _camReduceMotion = !_camReduceMotion;
  motionBtn.textContent = _camReduceMotion ? 'Motion: Off' : 'Motion: On';
  if (_camReduceMotion) {
    _camDice = false;
    camera.position.set(0, _CAM_BASE.y, _CAM_BASE.xz);
    camera.lookAt(0, 0, 0);
    Object.assign(_cam,    { az: 0, y: _CAM_BASE.y, xz: _CAM_BASE.xz });
    Object.assign(_camTgt, { az: 0, y: _CAM_BASE.y, xz: _CAM_BASE.xz });
  }
});

const povBtn = _mkCtrlBtn('POV: Off');
povBtn.addEventListener('click', () => {
  _camPOV = !_camPOV;
  povBtn.textContent = _camPOV ? 'POV: On' : 'POV: Off';
  if (!_camPOV) {
    // Sync _cam to actual camera pos so return is smooth, not a jump
    _cam.az  = Math.atan2(camera.position.x, camera.position.z);
    _cam.y   = camera.position.y;
    _cam.xz  = Math.sqrt(camera.position.x ** 2 + camera.position.z ** 2);
    _camRefreshTarget();
  }
});

const ctrlBar = document.createElement('div');
Object.assign(ctrlBar.style, {
  position: 'fixed', bottom: '14px', right: '14px',
  display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'stretch',
  zIndex: '50',
});
ctrlBar.append(motionBtn, povBtn, qualBtn);
document.body.appendChild(ctrlBar);

/* ================================================================
   Reachable-space highlighting + click-to-move raycasting
   ================================================================ */
const raycaster    = new THREE.Raycaster();
const _mouse       = new THREE.Vector2();
const reachableMap = new Map();   // tile mesh → spaceId
const outlineObjs  = [];          // { tileMesh, outlineMesh, outlineMat }

let _pulseT = 0;

function activateReachable(spaceIds) {
  clearReachableUI();
  for (const id of spaceIds) {
    const mesh = meshMap.get(id);
    if (!mesh) continue;
    reachableMap.set(mesh, id);

    const sp = mesh.userData.sectorParams;
    let outlineMesh, outlineMat;

    if (sp) {
      // Sector-shaped flat overlay sitting just above the tile surface
      const hShape = makeSectorShape(
        sp.r_in  - 0.05, sp.r_out + 0.05,
        sp.a_start - 0.013, sp.a_end + 0.013
      );
      outlineMat  = new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.42,
        depthWrite: false, side: THREE.DoubleSide,
      });
      outlineMesh = new THREE.Mesh(new THREE.ShapeGeometry(hShape, 20), outlineMat);
      outlineMesh.rotation.x = -Math.PI / 2;
      outlineMesh.position.y = sp.height + 0.012;
      boardGroup.add(outlineMesh);
    } else {
      // Hub: torus ring (hub is still CylinderGeometry)
      const r = (mesh.geometry?.parameters?.radiusTop ?? 1.55) + 0.12;
      outlineMat  = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
      outlineMesh = new THREE.Mesh(new THREE.TorusGeometry(r, 0.065, 10, 56), outlineMat);
      outlineMesh.rotation.x = Math.PI / 2;
      outlineMesh.position.y = (mesh.userData.hubTopY ?? 0.30) + 0.03;
      boardGroup.add(outlineMesh);
    }

    outlineObjs.push({ outlineMesh, outlineMat });
  }
}

function clearReachableUI() {
  for (const { outlineMesh, outlineMat } of outlineObjs) {
    boardGroup.remove(outlineMesh);
    outlineMesh.geometry.dispose();
    outlineMat.dispose();
  }
  outlineObjs.length = 0;
  reachableMap.clear();
}

canvas.addEventListener('click', e => {
  if (reachableMap.size === 0) return;

  const rect = canvas.getBoundingClientRect();
  _mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
  _mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;

  raycaster.setFromCamera(_mouse, camera);
  const targets = [...reachableMap.keys()];
  const hits    = raycaster.intersectObjects(targets, true);

  if (hits.length === 0) return;

  let obj = hits[0].object;
  while (obj) {
    if (reachableMap.has(obj)) {
      const spaceId = reachableMap.get(obj);
      clearReachableUI();
      onPlayerChoseDest(spaceId);
      return;
    }
    obj = obj.parent;
  }
});

/* Cursor management — pointer when hovering a reachable tile */
canvas.addEventListener('mousemove', e => {
  if (reachableMap.size === 0) { canvas.style.cursor = 'default'; return; }
  const rect = canvas.getBoundingClientRect();
  _mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
  _mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
  raycaster.setFromCamera(_mouse, camera);
  const hits = raycaster.intersectObjects([...reachableMap.keys()], true);
  let over = false;
  for (const h of hits) {
    let o = h.object;
    while (o) { if (reachableMap.has(o)) { over = true; break; } o = o.parent; }
    if (over) break;
  }
  canvas.style.cursor = over ? 'pointer' : 'default';
});

/* ================================================================
   Sound system (Web Audio API — no external files)
   ================================================================ */
let _audioCtx = null;
function audio() { return _audioCtx || (_audioCtx = new (window.AudioContext || window.webkitAudioContext)()); }
function playTone(freq, dur, type = 'sine', vol = 0.16, delay = 0) {
  try {
    const ctx = audio(), t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  } catch(e) {}
}
function playNoise(dur, vol = 0.15, freq = 900) {
  try {
    const ctx = audio();
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf; flt.type = 'bandpass'; flt.frequency.value = freq; flt.Q.value = 1.5;
    g.gain.setValueAtTime(vol, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(flt); flt.connect(g); g.connect(ctx.destination); src.start();
  } catch(e) {}
}
const SFX = {
  roll:    () => playNoise(0.28, 0.18, 1100),
  hop:     () => playTone(520, 0.07, 'square', 0.07),
  correct: () => [523, 659, 784].forEach((f, i) => playTone(f, 0.28, 'sine', 0.15, i * 0.1)),
  wrong:   () => playTone(280, 0.38, 'sawtooth', 0.13),
  wedge:   () => [523, 659, 784, 1047].forEach((f, i) => playTone(f, 0.42, 'sine', 0.18, i * 0.08)),
  win:     () => [523, 659, 784, 1047, 1319].forEach((f, i) => playTone(f, 0.55, 'sine', 0.2, i * 0.09)),
  click:   () => playTone(700, 0.06, 'square', 0.06),
};

/* ================================================================
   Toast
   ================================================================ */
function showToast(msg, color = null) {
  const area = document.getElementById('toast-area');
  const el = document.createElement('div');
  el.className = 'toast' + (color ? ' toast--colored' : '');
  if (color) { el.style.borderColor = color; el.style.color = color; }
  el.textContent = msg;
  area.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

/* ================================================================
   Roll splash
   ================================================================ */
function showRollSplash(value) {
  const el      = document.getElementById('roll-splash');
  const content = el.querySelector('.roll-splash-content');
  document.getElementById('rollSplashNum').textContent = value;
  content.style.animation = 'none';
  el.style.opacity = '0';
  el.style.display = 'block';
  requestAnimationFrame(() => {
    content.style.animation = '';
    el.style.opacity = '1';   // CSS transition fades it in
  });
}

function hideRollSplash() {
  const el = document.getElementById('roll-splash');
  el.style.opacity = '0';
  setTimeout(() => { el.style.display = 'none'; }, 340);
}

/* ================================================================
   Turn banner
   ================================================================ */
function showTurnBanner(team) {
  return new Promise(resolve => {
    const el      = document.getElementById('turn-banner');
    const content = el.querySelector('.turn-banner-content');
    document.getElementById('turnBannerPie').innerHTML = pieSVG(team.wedges, 72);
    document.getElementById('turnBannerName').textContent = team.name;
    content.style.animation = 'none';
    el.style.display = 'flex';
    requestAnimationFrame(() => {
      content.style.animation = '';
      setTimeout(() => { el.style.display = 'none'; resolve(); }, 1400);
    });
  });
}

/* ================================================================
   Question bank
   ================================================================ */
let questionEditions = null;

const setup = initSetup({
  onStart({ teamNames, edition }) {
    const labelMap = { Easy: 'Family', Medium: 'Classic', Difficult: 'Master' };
    const groups   = questionEditions[labelMap[edition] ?? 'Classic'];
    const pool     = createPoolManager(groups);
    tokens.init(teamNames.length);
    setup.hide();
    hud.show();
    startGame(teamNames, pool); // emits turnStart → handler shows banner, then enables roll
  },
});

setup.setLoadStatus('Loading question bank…');
loadQuestions()
  .then(editions => {
    questionEditions = editions;
    const info = Object.entries(editions)
      .map(([ed, g]) => `${ed}: ${CATEGORIES.reduce((s, c) => s + g[c.key].length, 0)}`)
      .join(' | ');
    setup.setLoadStatus(`Ready — ${info}`, true);
  })
  .catch(err => {
    console.error('[Wedge] Failed to load questions:', err);
    setup.setLoadStatus('Failed to load questions.xlsx', false);
  });

/* ================================================================
   HUD
   ================================================================ */
const hud = initHUD({
  onRoll() {
    hud.setRollEnabled(false);
    _camStartDice();
    dice.roll(value => onRollResult(value));
  },
});

/* ================================================================
   Question UI + Win screen
   ================================================================ */
const questionUI = initQuestion({ onCorrect, onMissed, onFinalCorrect, onFinalMissed, onFinalCategoryChosen });
const winUI      = initWin({ onNewGame: () => window.location.reload() });

/* ================================================================
   Game events
   ================================================================ */
window.addEventListener('wedge:turnStart', async e => {
  const { team, teamIdx } = e.detail;
  _camRefreshTarget();       // drift toward new active team's token
  hud.updateActiveTeam(team);
  hud.updateScoreboard(state.teams, teamIdx);
  await showTurnBanner(team);
  hud.setRollEnabled(true);
});

window.addEventListener('wedge:rollResult', async e => {
  const { value, teamIdx } = e.detail;
  SFX.roll();
  hud.setRollHint(false);

  // Hold until camera finishes its close-up arc over the die
  await _camDiceWaitForArc();

  // Show roll number at top-center, no overlay
  showRollSplash(value);
  await new Promise(r => setTimeout(r, 1300));

  // Zoom camera back to board — smooth, the lerp carries it from close-up to base
  hideRollSplash();
  _camEndDice();

  tokens.hover(teamIdx);
  hud.setRollHint(true);
});

window.addEventListener('wedge:showReachable', e => {
  activateReachable(e.detail.reachable);
});

window.addEventListener('wedge:clearReachable', () => {
  clearReachableUI();
  hud.setRollHint(false);
  canvas.style.cursor = 'default';
});

window.addEventListener('wedge:tokenMoveDirect', async e => {
  clearReachableUI();
  canvas.style.cursor = 'default';
  await tokens.hopAlong(e.detail.teamIdx, e.detail.path || [e.detail.toId], () => SFX.hop());
  onTokenLanded();
});

window.addEventListener('wedge:rollAgain', e => {
  const reason = e.detail?.reason;
  if (reason === 'hub') {
    showToast('Collect all 6 wedges first!');
  } else {
    showToast('✦ Roll again!');
  }
  hud.setRollEnabled(true);
  hud.updateActiveTeam(state.teams[state.currentTeam]);
});

window.addEventListener('wedge:showQuestion', e => {
  const { question, space, team, isFinal } = e.detail;
  questionUI.showQuestion({ question, space, team, isFinal });
  hud.setRollEnabled(false);
});

window.addEventListener('wedge:wedgeEarned', e => {
  const { teamIdx, category } = e.detail;
  const cat = CATEGORIES.find(c => c.key === category);
  SFX.wedge();
  showToast(`${cat?.name ?? ''} wedge earned!`, cat?.color);
  if (cat) tokens.wedgeFlourishAt(teamIdx, parseInt(cat.color.slice(1), 16));
});

window.addEventListener('wedge:allWedgesEarned', () => {
  setTimeout(() => showToast('All six! Head to the hub!', '#C9A35B'), 600);
});

window.addEventListener('wedge:correctAnswer', e => {
  const { teamIdx, team } = e.detail;
  SFX.correct();
  tokens.updateWedges(teamIdx, team.wedges);
  hud.updateActiveTeam(team);
  hud.updateScoreboard(state.teams, teamIdx);
  hud.setRollEnabled(true);
});

window.addEventListener('wedge:missedAnswer', e => {
  SFX.wrong();
  const { teamIdx, team } = e.detail;
  hud.updateActiveTeam(team);
  hud.updateScoreboard(state.teams, teamIdx);
});

window.addEventListener('wedge:hubFinalQuestion', e => {
  showToast('All other teams: choose the final category', '#C9A35B');
  questionUI.showCategoryPicker(key => onFinalCategoryChosen(key));
});

window.addEventListener('wedge:gameWon', e => {
  SFX.win();
  winUI.show(e.detail.team);
});

window.addEventListener('wedge:missedFinal', e => {
  showToast('So close! Leave the hub and try again.');
  hud.updateActiveTeam(e.detail.team);
  hud.updateScoreboard(state.teams, state.currentTeam);
  hud.setRollEnabled(true);
});

/* ================================================================
   Render loop
   ================================================================ */
let last = performance.now();

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt  = Math.min((now - last) / 1000, 0.05);
  last = now;

  // Pulse the reachable-tile highlights (opacity breathe)
  if (outlineObjs.length > 0) {
    _pulseT += dt * 3.5;
    const opacity = 0.28 + Math.abs(Math.sin(_pulseT)) * 0.38;
    for (const { outlineMesh } of outlineObjs) {
      outlineMesh.material.opacity = opacity;
    }
  }

  physicsWorld.step(1 / 60, dt, 3);
  dice.update(dt);
  tokens.update(dt);
  _camTick(dt);

  composer.render(dt);
}
animate();
