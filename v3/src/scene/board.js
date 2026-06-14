import * as THREE from 'three';
import { CATEGORIES } from '../data/loadQuestions.js';
import { BOARD, RING_SIZE_, HQ_STEP_, SPOKE_LEN_ } from '../game/boardGraph.js';

// RING_SIZE_, HQ_STEP_, SPOKE_LEN_ are live bindings — read directly inside functions
// so they pick up the correct value after initBoard() configures the chosen mode.

/* ============================================================
   TILE GEOMETRY CONSTANTS
   Ring track: annular-sector tiles, 36 spaces (v2), tessellating.
   Spoke track: narrower sector tiles, 3 per arm, radially tiled.
   ============================================================ */

const RING_R_OUT  = 7.95;   // outer radius of ring track
const RING_R_IN   = 6.45;   // inner radius of ring track
const RING_R_MID  = (RING_R_OUT + RING_R_IN) / 2;  // ≈ 7.20
const RING_H      = 0.13;   // regular ring tile height
const RING_HQ_H   = 0.22;   // HQ tile height
const RING_GROUT  = 0.032;  // total angular grout removed per tile (split ÷2 each side)

const SPOKE_H_RAD = 1.40;   // radial span of each spoke tile
const SPOKE_G_RAD = 0.12;   // radial grout between spoke tiles
const SPOKE_HALF_A = 0.044; // angular half-width (±) of spoke tiles  ≈ ±2.5°
const SPOKE_H     = 0.11;   // vertical height of spoke tiles

const HUB_R = 1.55;
const HUB_H = 0.30;

const ROLL_CREAM = 0xd4cfbe;

const CAT_HEX = {};
CATEGORIES.forEach(c => { CAT_HEX[c.key] = parseInt(c.color.slice(1), 16); });

/* ------------------------------------------------------------------ */
/* Helper: angle → position on ring                                     */
function ringAngle(i) { return (i / RING_SIZE_) * Math.PI * 2; }

/* Spoke[step] outer radius — step 0 is outermost (nearest ring)       */
function spokeROut(step) {
  return RING_R_IN - 0.12 - step * (SPOKE_H_RAD + SPOKE_G_RAD);
}

// Standard material — structural elements (board body, grooves, arc tints)
function mkMat(hex, rough = 0.44, emissive = 0, emissInt = 0, metal = 0.07) {
  return new THREE.MeshStandardMaterial({
    color: hex, roughness: rough, metalness: metal,
    emissive, emissiveIntensity: emissInt,
  });
}

// Physical material — board tiles (lacquered board-game sheen)
function mkTile(hex, isHQ = false) {
  return new THREE.MeshPhysicalMaterial({
    color: hex,
    roughness:          isHQ ? 0.30 : 0.40,
    metalness:          0.04,
    clearcoat:          isHQ ? 0.60 : 0.38,
    clearcoatRoughness: isHQ ? 0.16 : 0.24,
    emissive:           isHQ ? hex  : 0x000000,
    emissiveIntensity:  isHQ ? 0.07 : 0,
    envMapIntensity:    isHQ ? 1.0  : 0.80,
  });
}

// Physical material — roll-again tiles (glowing gold, strong emissive to trigger bloom)
function mkRollAgain() {
  return new THREE.MeshPhysicalMaterial({
    color:              0xfffacc,
    roughness:          0.12,
    metalness:          0.0,
    clearcoat:          0.90,
    clearcoatRoughness: 0.08,
    emissive:           0xffe566,
    emissiveIntensity:  0.90,
    envMapIntensity:    1.2,
  });
}

// Physical material — brass elements (real gold with IBL)
function mkBrass(emissInt = 0) {
  return new THREE.MeshPhysicalMaterial({
    color:             0xc9a35b,
    metalness:         1.0,
    roughness:         0.18,
    envMapIntensity:   1.5,
    emissive:          emissInt > 0 ? 0xc9a35b : 0x000000,
    emissiveIntensity: emissInt,
  });
}

// Physical material — HQ gems (glassy, highly emissive)
function mkGem(hex) {
  return new THREE.MeshPhysicalMaterial({
    color:              hex,
    roughness:          0.06,
    metalness:          0.35,
    clearcoat:          1.0,
    clearcoatRoughness: 0.05,
    emissive:           hex,
    emissiveIntensity:  0.65,
    envMapIntensity:    1.8,
  });
}

// Procedural felt texture — subtle short-fibre noise within the --bg palette
function makeFeltTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#1d1810';
  ctx.fillRect(0, 0, 512, 512);
  // Felt fibres: short random strokes in warm dark tones
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const a = Math.random() * Math.PI;
    const l = 1 + Math.random() * 3;
    const v = 26 + Math.floor(Math.random() * 18);
    ctx.strokeStyle = `rgba(${v},${Math.floor(v * 0.82)},${Math.floor(v * 0.58)},${0.055 + Math.random() * 0.095})`;
    ctx.lineWidth = 0.55;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  return new THREE.CanvasTexture(cv);
}

/* ============================================================
   CORE SECTOR SHAPE
   Convention: shape Y = -sin(a)*r so that after rotation.x = -π/2
   the shape lies correctly in world XZ at the angles from ringAngle().
   (rotation.x = -π/2 maps local_y → world -z; negating y cancels.)
   ============================================================ */
export function makeSectorShape(r_in, r_out, a_start, a_end, N = 14) {
  const pts = [];
  // Outer arc: a_start → a_end
  for (let i = 0; i <= N; i++) {
    const a = a_start + (a_end - a_start) * i / N;
    pts.push(new THREE.Vector2(Math.cos(a) * r_out, -Math.sin(a) * r_out));
  }
  // Inner arc: a_end → a_start (reversed to close the shape correctly)
  for (let i = 0; i <= N; i++) {
    const a = a_end + (a_start - a_end) * i / N;
    pts.push(new THREE.Vector2(Math.cos(a) * r_in, -Math.sin(a) * r_in));
  }
  return new THREE.Shape(pts);
}

function makeSectorMesh(r_in, r_out, a_start, a_end, height, mat) {
  const shape = makeSectorShape(r_in, r_out, a_start, a_end);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelThickness: 0.016,
    bevelSize: 0.011,
    bevelSegments: 1,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.sectorParams = { r_in, r_out, a_start, a_end, height };
  return mesh;
}

/* Torus ring helper — accepts a pre-built material */
function addTorus(group, r, tube, y, mat, segs = 96) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 10, segs), mat);
  m.rotation.x = Math.PI / 2;
  m.position.y = y;
  group.add(m);
}

/* ------------------------------------------------------------------ */
/* Assign worldPos to all board spaces (used by TokenManager)          */
function assignPositions() {
  for (let i = 0; i < RING_SIZE_; i++) {
    const a = ringAngle(i);
    BOARD[`ring_${i}`].worldPos = new THREE.Vector3(
      Math.cos(a) * RING_R_MID, 0, Math.sin(a) * RING_R_MID
    );
  }
  for (let cat = 0; cat < 6; cat++) {
    const a = ringAngle(cat * HQ_STEP_);
    for (let step = 0; step < SPOKE_LEN_; step++) {
      const r_out = spokeROut(step);
      const r_mid = r_out - SPOKE_H_RAD / 2;
      BOARD[`spoke_${cat}_${step}`].worldPos = new THREE.Vector3(
        Math.cos(a) * r_mid, 0, Math.sin(a) * r_mid
      );
    }
  }
  BOARD['hub'].worldPos = new THREE.Vector3(0, 0, 0);
}

/* ------------------------------------------------------------------ */
/* Polar-grid dome mesh — apex + rings, parabolic Y, pie UV mapping   */
function makeDomeTop(r, baseH, domeExtra, tex) {
  const rings = 16, segs = 64;
  const pos = [], uvs = [], idx = [];

  // Apex vertex (index 0) — topmost point at dome centre
  pos.push(0, baseH + domeExtra, 0);
  uvs.push(0.5, 0.5);

  // Ring vertices (ri = 1..rings, skipping ri=0 to avoid degenerate triangles)
  for (let ri = 1; ri <= rings; ri++) {
    const t  = ri / rings;
    const cr = t * r;
    const cy = baseH + domeExtra * (1 - t * t);  // parabolic: peak at centre
    for (let si = 0; si <= segs; si++) {
      const a = (si / segs) * Math.PI * 2;
      pos.push(Math.cos(a) * cr, cy, Math.sin(a) * cr);
      uvs.push(0.5 + 0.5 * Math.cos(a) * t, 0.5 - 0.5 * Math.sin(a) * t);
    }
  }

  // Fan triangles from apex (0) to first ring (vertices 1..segs+1)
  for (let si = 0; si < segs; si++) {
    idx.push(0, 1 + si, 1 + si + 1);
  }

  // Quad strips for remaining rings
  for (let ri = 1; ri < rings; ri++) {
    const rowA = 1 + (ri - 1) * (segs + 1);
    const rowB = 1 +  ri      * (segs + 1);
    for (let si = 0; si < segs; si++) {
      const a = rowA + si, b = a + 1, c = rowB + si, d = c + 1;
      idx.push(a, b, d,  a, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
    map: tex, roughness: 0.20, metalness: 0.08,
    clearcoat: 0.65, clearcoatRoughness: 0.12, envMapIntensity: 0.85,
  }));
}

/* ------------------------------------------------------------------ */
/* Hub: domed medallion with six-colour pie + brass collar + jewel     */
const HUB_DOME = 0.16;   // extra height of dome peak above cylinder rim

function makeHub() {
  const group = new THREE.Group();

  // Shared canvas pie texture
  const cv = document.createElement('canvas');
  cv.width = cv.height = 512;
  const ctx = cv.getContext('2d');
  CATEGORIES.forEach((c, i) => {
    const a0 = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / 6) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath(); ctx.moveTo(256, 256); ctx.arc(256, 256, 256, a0, a1); ctx.closePath();
    ctx.fillStyle = c.color; ctx.fill();
  });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath(); ctx.moveTo(256, 256);
    ctx.lineTo(256 + Math.cos(a) * 256, 256 + Math.sin(a) * 256);
    ctx.strokeStyle = 'rgba(21,17,13,0.88)'; ctx.lineWidth = 7; ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(256, 256, 55, 0, Math.PI * 2);
  ctx.fillStyle = '#15110D'; ctx.fill();
  ctx.strokeStyle = '#c9a35b'; ctx.lineWidth = 10; ctx.stroke();
  const tex = new THREE.CanvasTexture(cv);

  // Cylinder side wall (open — no caps; dome provides the top)
  const side = new THREE.Mesh(
    new THREE.CylinderGeometry(HUB_R, HUB_R * 1.02, HUB_H, 64, 1, true),
    new THREE.MeshPhysicalMaterial({ color: 0x2a2118, roughness: 0.58, metalness: 0.05, clearcoat: 0.2, clearcoatRoughness: 0.4 })
  );
  side.position.y = HUB_H / 2;
  side.castShadow = true;
  group.add(side);

  // Bottom cap
  const bot = new THREE.Mesh(
    new THREE.CircleGeometry(HUB_R * 1.02, 64),
    new THREE.MeshPhysicalMaterial({ color: 0x15110d, roughness: 0.80, metalness: 0.0 })
  );
  bot.rotation.x = -Math.PI / 2;
  bot.position.y = 0.005;
  group.add(bot);

  // Domed top with pie texture
  const dome = makeDomeTop(HUB_R, HUB_H, HUB_DOME, tex);
  dome.castShadow = true;
  group.add(dome);

  // Centre jewel
  const jewel = new THREE.Mesh(
    new THREE.SphereGeometry(0.21, 28, 18),
    mkGem(0xc9a35b)
  );
  jewel.position.y = HUB_H + HUB_DOME + 0.04;
  jewel.castShadow = true;
  group.add(jewel);

  return group;
}

/* ============================================================
   BUILD BOARD
   Returns { meshMap, group } — group is needed by main.js for
   attaching highlight overlay meshes at the right transform level.
   ============================================================ */
export function buildBoard(scene) {
  assignPositions();
  const group   = new THREE.Group();
  const meshMap = new Map();

  /* ---- Base ---- */
  const boardBody = new THREE.Mesh(
    new THREE.CylinderGeometry(9.52, 9.72, 0.32, 80),
    new THREE.MeshPhysicalMaterial({ color: 0x18130b, roughness: 0.88, metalness: 0.0, envMapIntensity: 0.12 })
  );
  boardBody.receiveShadow = true;
  boardBody.position.y = -0.16;
  group.add(boardBody);

  // Playing surface — procedural felt texture
  const playArea = new THREE.Mesh(
    new THREE.CylinderGeometry(9.08, 9.08, 0.05, 80),
    new THREE.MeshPhysicalMaterial({ map: makeFeltTexture(), roughness: 0.96, metalness: 0.0, envMapIntensity: 0.08 })
  );
  playArea.receiveShadow = true;
  playArea.position.y = 0.008;
  group.add(playArea);

  // Six faint category wedge tints (help players orient to an arm)
  for (let cat = 0; cat < 6; cat++) {
    const a0  = ringAngle(cat * HQ_STEP_) - Math.PI / HQ_STEP_;
    const len = (Math.PI * 2) / 6;
    const hex = CAT_HEX[CATEGORIES[cat].key];
    const zone = new THREE.Mesh(
      new THREE.CylinderGeometry(7.4, 7.4, 0.022, 72, 1, false, a0, len),
      new THREE.MeshStandardMaterial({ color: hex, roughness: 0.92, opacity: 0.065, transparent: true })
    );
    zone.position.y = 0.029;
    group.add(zone);
  }

  // Radial grooves (mark HQ boundaries)
  for (let cat = 0; cat < 6; cat++) {
    const a = ringAngle(cat * HQ_STEP_);
    const len = 8.9;
    const groove = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.009, len),
      mkMat(0x0e0c08, 0.97)
    );
    groove.position.set(Math.cos(a) * len / 2, 0.026, Math.sin(a) * len / 2);
    groove.rotation.y = -a;
    group.add(groove);
  }

  // Decorative rings — brass rim uses mkBrass(), subtle inlays use mkMat()
  addTorus(group, 9.50, 0.17, 0.09, mkBrass(), 96);                               // outer brass rim
  addTorus(group, 8.22, 0.04, 0.03, mkMat(0x6b5c3a, 0.55, 0, 0, 0.18), 80);      // outer inlay
  addTorus(group, 6.22, 0.04, 0.03, mkMat(0x6b5c3a, 0.55, 0, 0, 0.18), 80);      // inner inlay
  addTorus(group, RING_R_OUT, 0.022, 0.01, mkMat(0x0e0b07, 0.97), 80);
  addTorus(group, RING_R_IN,  0.022, 0.01, mkMat(0x0e0b07, 0.97), 80);

  /* ---- Ring tiles ---- */
  const aHalf = Math.PI / RING_SIZE_; // half-angle per tile slot

  for (let i = 0; i < RING_SIZE_; i++) {
    const space = BOARD[`ring_${i}`];
    const isHQ  = space.isHQ;
    const h     = isHQ ? RING_HQ_H : RING_H;
    const aCtr  = ringAngle(i);
    const aS    = aCtr - aHalf + RING_GROUT / 2;
    const aE    = aCtr + aHalf - RING_GROUT / 2;

    let mat;
    if (space.isRollAgain) {
      mat = mkRollAgain();
    } else {
      const hex = CAT_HEX[space.category] ?? 0x888877;
      mat = mkTile(hex, isHQ);
    }

    const tile = makeSectorMesh(RING_R_IN, RING_R_OUT, aS, aE, h, mat);
    group.add(tile);
    meshMap.set(`ring_${i}`, tile);

    // HQ decorations — collar ring + category gem
    if (isHQ) {
      const hex  = CAT_HEX[space.category];
      const wPos = BOARD[`ring_${i}`].worldPos;

      const collar = new THREE.Mesh(
        new THREE.TorusGeometry(0.68, 0.055, 10, 48),
        mkBrass()
      );
      collar.rotation.x = Math.PI / 2;
      collar.position.set(wPos.x, h + 0.022, wPos.z);
      group.add(collar);

      const gem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.14, 0.15, 6),
        mkGem(hex)
      );
      gem.position.set(wPos.x, h + 0.12, wPos.z);
      group.add(gem);
    }

  }

  /* ---- Spoke tiles ---- */
  for (let cat = 0; cat < 6; cat++) {
    const a   = ringAngle(cat * HQ_STEP_);
    const hex = CAT_HEX[CATEGORIES[cat].key];
    const mat = mkTile(hex, false);

    for (let step = 0; step < SPOKE_LEN_; step++) {
      const r_out = spokeROut(step);
      const r_in  = r_out - SPOKE_H_RAD;
      const aS    = a - SPOKE_HALF_A;
      const aE    = a + SPOKE_HALF_A;

      const tile = makeSectorMesh(r_in, r_out, aS, aE, SPOKE_H, mat);
      group.add(tile);
      meshMap.set(`spoke_${cat}_${step}`, tile);
    }
  }

  /* ---- Hub ---- */
  const hub = makeHub();
  hub.position.set(0, 0, 0);   // internal group positions own children
  group.add(hub);
  meshMap.set('hub', hub);
  hub.userData.isHub   = true;
  hub.userData.hubTopY = HUB_H + HUB_DOME;

  // Brass collar ring around hub
  addTorus(group, HUB_R + 0.09, 0.075, HUB_H + 0.015, mkBrass(0.05), 48);

  scene.add(group);
  return { meshMap, group };
}
