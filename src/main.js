import * as THREE from 'three';
import { loadQuestions, createPoolManager, CATEGORIES } from './data/loadQuestions.js';
import { buildBoard } from './scene/board.js';
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
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
renderer.outputColorSpace   = THREE.SRGBColorSpace;

/* ================================================================
   Scene + Camera
   ================================================================ */
const scene  = new THREE.Scene();
scene.background = new THREE.Color(0x15110D);

const camera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 120);
camera.position.set(3, 17, 13);
camera.lookAt(1.5, 0, 1);

/* Lighting */
const ambient  = new THREE.AmbientLight(0xf0e8d8, 0.52);
scene.add(ambient);

const key = new THREE.DirectionalLight(0xfff8ee, 1.45);
key.position.set(6, 15, 8);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 1; key.shadow.camera.far  = 50;
key.shadow.camera.left = -16; key.shadow.camera.right = 16;
key.shadow.camera.top  =  16; key.shadow.camera.bottom = -16;
scene.add(key);

const fill = new THREE.DirectionalLight(0xd8e8ff, 0.32);
fill.position.set(-8, 10, -6);
scene.add(fill);

// Warm overhead lamp — the "game night felt under a lamp" look
const lamp = new THREE.PointLight(0xffcc88, 1.1, 28);
lamp.position.set(0, 10, 0);
lamp.castShadow = false;
scene.add(lamp);

window.addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

/* ================================================================
   Game objects
   ================================================================ */
let meshMap = buildBoard(scene);
const physicsWorld = createPhysicsWorld();
const dice   = new DiceSystem(scene, physicsWorld);
const tokens = new TokenManager(scene);

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

    // White torus ring that sits on top of the circular tile
    const r = (mesh.geometry?.parameters?.radiusTop ?? 0.43) + 0.07;
    const h = mesh.geometry?.parameters?.height ?? 0.13;
    const outlineMat  = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const outlineMesh = new THREE.Mesh(new THREE.TorusGeometry(r, 0.052, 10, 36), outlineMat);
    outlineMesh.rotation.x = Math.PI / 2;
    outlineMesh.position.y = h / 2 + 0.02;
    mesh.add(outlineMesh);
    outlineObjs.push({ tileMesh: mesh, outlineMesh, outlineMat });
  }
}

function clearReachableUI() {
  for (const { tileMesh, outlineMesh, outlineMat } of outlineObjs) {
    tileMesh.remove(outlineMesh);
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
  return new Promise(resolve => {
    const el      = document.getElementById('roll-splash');
    const content = el.querySelector('.roll-splash-content');
    document.getElementById('rollSplashNum').textContent = value;
    content.style.animation = 'none';
    el.style.display = 'flex';
    requestAnimationFrame(() => {
      content.style.animation = '';
      setTimeout(() => { el.style.display = 'none'; resolve(); }, 1100);
    });
  });
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
  hud.updateActiveTeam(team);
  hud.updateScoreboard(state.teams, teamIdx);
  await showTurnBanner(team);
  hud.setRollEnabled(true);
});

window.addEventListener('wedge:rollResult', async e => {
  const { value, teamIdx } = e.detail;
  SFX.roll();
  hud.setRollHint(false);
  await showRollSplash(value);
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
  SFX.hop();
  await tokens.flyTo(e.detail.teamIdx, e.detail.toId);
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
  const cat = CATEGORIES.find(c => c.key === e.detail.category);
  SFX.wedge();
  showToast(`${cat?.name ?? ''} wedge earned!`, cat?.color);
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

  // Pulse the white torus rings
  if (outlineObjs.length > 0) {
    _pulseT += dt * 3.8;
    const s = 1.0 + Math.sin(_pulseT) * 0.1;
    for (const { outlineMesh } of outlineObjs) {
      outlineMesh.scale.setScalar(s);
    }
  }

  physicsWorld.step(1 / 60, dt, 3);
  dice.update(dt);
  tokens.update(dt);

  renderer.render(scene, camera);
}
animate();
