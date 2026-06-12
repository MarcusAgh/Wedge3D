import * as THREE from 'three';
import { CATEGORIES } from '../data/loadQuestions.js';
import { BOARD, RING_SIZE_, HQ_STEP_, SPOKE_LEN_ } from '../game/boardGraph.js';

const RING_SIZE = RING_SIZE_;
const HQ_STEP   = HQ_STEP_;
const SPOKE_LEN = SPOKE_LEN_;

const RING_RADIUS = 7.2;

// Tile dimensions — all circles now
const SEGS       = 28;    // smoothness
const TILE_R     = 0.43;  // regular ring tile radius
const TILE_R_HQ  = 0.55;  // HQ tile radius
const TILE_R_SPK = 0.36;  // spoke tile radius
const TILE_H     = 0.13;  // regular height
const TILE_H_HQ  = 0.22;  // HQ height
const TILE_H_SPK = 0.10;  // spoke height

const ROLL_CREAM = 0xd4cfbe;

const CAT_HEX = {};
CATEGORIES.forEach(c => { CAT_HEX[c.key] = parseInt(c.color.slice(1), 16); });

function mkMat(hex, rough = 0.44, emissive = 0, emissInt = 0, metal = 0.07) {
  return new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal, emissive, emissiveIntensity: emissInt });
}

function ringAngle(i) { return (i / RING_SIZE) * Math.PI * 2; }

function ringPos(i) {
  const a = ringAngle(i);
  return new THREE.Vector3(Math.cos(a) * RING_RADIUS, 0, Math.sin(a) * RING_RADIUS);
}

function spokePos(cat, step) {
  const a = ringAngle(cat * HQ_STEP);
  const t = (step + 1) / (SPOKE_LEN + 1);
  return new THREE.Vector3(Math.cos(a) * RING_RADIUS * (1 - t), 0, Math.sin(a) * RING_RADIUS * (1 - t));
}

function assignPositions() {
  for (let i = 0; i < RING_SIZE; i++) BOARD[`ring_${i}`].worldPos = ringPos(i);
  for (let cat = 0; cat < 6; cat++)
    for (let s = 0; s < SPOKE_LEN; s++) BOARD[`spoke_${cat}_${s}`].worldPos = spokePos(cat, s);
  BOARD['hub'].worldPos = new THREE.Vector3(0, 0, 0);
}

/* Hub: six-colour disc with sector lines and a brass center ring */
function makeHub() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const ctx = cv.getContext('2d');

  CATEGORIES.forEach((c, i) => {
    const a0 = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / 6) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath(); ctx.moveTo(256, 256); ctx.arc(256, 256, 256, a0, a1); ctx.closePath();
    ctx.fillStyle = c.color; ctx.fill();
  });
  // Sector divider lines
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(256, 256);
    ctx.lineTo(256 + Math.cos(a) * 256, 256 + Math.sin(a) * 256);
    ctx.strokeStyle = 'rgba(21,17,13,0.85)'; ctx.lineWidth = 6; ctx.stroke();
  }
  // Dark centre
  ctx.beginPath(); ctx.arc(256, 256, 56, 0, Math.PI * 2);
  ctx.fillStyle = '#15110D'; ctx.fill();
  // Brass centre ring
  ctx.beginPath(); ctx.arc(256, 256, 58, 0, Math.PI * 2);
  ctx.strokeStyle = '#c9a35b'; ctx.lineWidth = 9; ctx.stroke();

  return new THREE.Mesh(
    new THREE.CylinderGeometry(1.25, 1.25, 0.26, 48),
    [
      mkMat(0x2a2118, 0.55),
      new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(cv), roughness: 0.28, metalness: 0.1 }),
      mkMat(0x15110d, 0.82),
    ]
  );
}

/* Roll-again tile: cream circle with ✦ stamped on top */
function makeRollAgainTile(r, h) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#d4cfbe'; ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#3B332A';
  ctx.font = 'bold 70px serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✦', 64, 66);

  return new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, h, SEGS),
    [
      mkMat(ROLL_CREAM, 0.58),
      new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(cv), roughness: 0.48 }),
      mkMat(ROLL_CREAM, 0.7),
    ]
  );
}

/* Torus ring helper */
function addTorus(group, r, tube, y, hex, metal = 0.35, segs = 100) {
  const m = new THREE.Mesh(
    new THREE.TorusGeometry(r, tube, 10, segs),
    mkMat(hex, 0.36, 0, 0, metal)
  );
  m.rotation.x = Math.PI / 2; m.position.y = y; group.add(m);
}

export function buildBoard(scene) {
  assignPositions();
  const group   = new THREE.Group();
  const meshMap = new Map();

  /* ======================================================
     BASE — layered felt + decorative rings
     ====================================================== */

  // Outer board body (thick, slightly tapered for depth)
  const boardBody = new THREE.Mesh(
    new THREE.CylinderGeometry(9.42, 9.6, 0.28, 80),
    mkMat(0x18130b, 0.96, 0, 0, 0)
  );
  boardBody.receiveShadow = true;
  boardBody.position.y = -0.14;
  group.add(boardBody);

  // Top playing surface — slightly raised, warmer tone
  const playArea = new THREE.Mesh(
    new THREE.CylinderGeometry(9.0, 9.0, 0.045, 80),
    mkMat(0x1e1911, 0.90)
  );
  playArea.receiveShadow = true;
  playArea.position.y = 0.005;
  group.add(playArea);

  // Six subtle radial grooves at arc boundaries (between each pair of HQs)
  for (let cat = 0; cat < 6; cat++) {
    const a = ringAngle(cat * HQ_STEP);
    const len = 8.6;
    const groove = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.008, len),
      mkMat(0x0f0c08, 0.96)
    );
    groove.position.set(Math.cos(a) * len / 2, 0.025, Math.sin(a) * len / 2);
    groove.rotation.y = -a;
    group.add(groove);
  }

  // Very faint category arc colouring on the surface (helps players orient)
  for (let cat = 0; cat < 6; cat++) {
    const a0  = ringAngle(cat * HQ_STEP) - Math.PI / 6;
    const len = Math.PI * 2 / 6;
    const hex = CAT_HEX[CATEGORIES[cat].key];
    const arcZone = new THREE.Mesh(
      new THREE.CylinderGeometry(7.0, 7.0, 0.018, 72, 1, false, a0, len),
      new THREE.MeshStandardMaterial({ color: hex, roughness: 0.9, opacity: 0.08, transparent: true })
    );
    arcZone.position.y = 0.026;
    group.add(arcZone);
  }

  // Decorative rings (outside-in)
  addTorus(group, 9.4,  0.14, 0.07, 0xc9a35b, 0.60);  // outer brass rim
  addTorus(group, 8.15, 0.04, 0.03, 0x6b5c3a, 0.28);  // outer inner ring
  addTorus(group, 6.15, 0.04, 0.03, 0x6b5c3a, 0.28);  // inner ring (near hub)
  addTorus(group, 7.2,  0.028, 0.01, 0x111009, 0.05); // ring track groove

  /* ======================================================
     RING TILES
     ====================================================== */
  for (let i = 0; i < RING_SIZE; i++) {
    const space = BOARD[`ring_${i}`];
    const isHQ  = space.isHQ;
    const r = isHQ ? TILE_R_HQ : TILE_R;
    const h = isHQ ? TILE_H_HQ : TILE_H;

    let tile;
    if (space.isRollAgain) {
      tile = makeRollAgainTile(r, h);
    } else {
      const hex = CAT_HEX[space.category] ?? 0x888877;
      tile = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, h, SEGS),
        mkMat(hex, 0.42, isHQ ? hex : 0, isHQ ? 0.14 : 0, 0.08)
      );
    }

    tile.position.copy(ringPos(i));
    tile.position.y = h / 2;
    tile.castShadow = tile.receiveShadow = true;
    group.add(tile);
    meshMap.set(`ring_${i}`, tile);

    if (isHQ) {
      const hex = CAT_HEX[space.category];

      // Brass collar ring flush with tile base
      const collar = new THREE.Mesh(
        new THREE.TorusGeometry(r + 0.07, 0.045, 10, 36),
        mkMat(0xc9a35b, 0.26, 0, 0, 0.68)
      );
      collar.rotation.x = Math.PI / 2;
      collar.position.copy(tile.position);
      collar.position.y = 0.05;
      group.add(collar);

      // Glowing category gem on top
      const gem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.13, 0.14, 6),
        mkMat(hex, 0.16, hex, 0.55, 0.55)
      );
      gem.position.copy(tile.position);
      gem.position.y += h / 2 + 0.1;
      group.add(gem);
    }
  }

  /* ======================================================
     SPOKE TILES + RAILS
     ====================================================== */
  for (let cat = 0; cat < 6; cat++) {
    const hex = CAT_HEX[CATEGORIES[cat].key];

    for (let step = 0; step < SPOKE_LEN; step++) {
      const tile = new THREE.Mesh(
        new THREE.CylinderGeometry(TILE_R_SPK, TILE_R_SPK, TILE_H_SPK, SEGS),
        mkMat(hex, 0.5, 0, 0, 0.06)
      );
      tile.position.copy(spokePos(cat, step));
      tile.position.y = TILE_H_SPK / 2;
      tile.castShadow = tile.receiveShadow = true;
      group.add(tile);
      meshMap.set(`spoke_${cat}_${step}`, tile);
    }

    // Connector rails — HQ → spoke[0] → spoke[1] → spoke[2] → hub
    const railMat = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.68, metalness: 0.05, opacity: 0.65, transparent: true });
    const hqP     = ringPos(cat * HQ_STEP);
    const nodes   = [hqP, ...Array.from({ length: SPOKE_LEN }, (_, s) => spokePos(cat, s)), new THREE.Vector3(0, 0, 0)];
    for (let n = 0; n < nodes.length - 1; n++) {
      const a = nodes[n], b = nodes[n + 1];
      const dir = new THREE.Vector3().subVectors(b, a);
      const len = dir.length();
      const mid = new THREE.Vector3().addVectors(a, dir.clone().multiplyScalar(0.5));
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, len, 6), railMat);
      rail.position.set(mid.x, 0.06, mid.z);
      rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
      group.add(rail);
    }
  }

  /* ======================================================
     HUB
     ====================================================== */
  const hub = makeHub();
  hub.position.set(0, 0.14, 0);
  group.add(hub);
  meshMap.set('hub', hub);

  // Brass collar around hub
  addTorus(group, 1.38, 0.065, 0.24, 0xc9a35b, 0.68, 48);

  scene.add(group);
  return meshMap;
}
