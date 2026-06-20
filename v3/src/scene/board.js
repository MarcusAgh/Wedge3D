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
const RING_HQ_H   = 0.40;   // HQ tile height — raised platform so the space itself reads as a prize
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
    roughness:          isHQ ? 0.24 : 0.40,
    metalness:          isHQ ? 0.06 : 0.04,
    clearcoat:          isHQ ? 0.90 : 0.38,
    clearcoatRoughness: isHQ ? 0.08 : 0.24,
    // HQ tiles glow from within — the tile itself is the visual event
    emissive:           isHQ ? hex  : 0x000000,
    emissiveIntensity:  isHQ ? 0.30 : 0,
    envMapIntensity:    isHQ ? 1.20 : 0.80,
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
function mkGem(hex, emissInt = 0.65) {
  return new THREE.MeshPhysicalMaterial({
    color:              hex,
    roughness:          0.06,
    metalness:          0.35,
    clearcoat:          1.0,
    clearcoatRoughness: 0.05,
    emissive:           hex,
    emissiveIntensity:  emissInt,
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
/* Hub: recessed roulette well with real-geometry 6-colour pie floor   */
const HUB_PIE_TOP_Y = 0.12;   // top surface of pie floor
export const HUB_PLACE_R = 0.85;
export const HUB_TOKEN_Y = 0.23;   // HUB_PIE_TOP_Y + token half-height

/** Sector i is centred on this world angle — lines up exactly with spoke arm i. */
export function hubWedgeAngle(i) { return i * (Math.PI * 2 / 6); }

function makeHub() {
  const group = new THREE.Group();

  // Subtle outer brass lip — low-profile rim so the centre jewel steals the show
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(1.44, 1.52, 0.32, 80, 1, true),
    mkBrass(0.05)
  );
  wall.position.y = 0.16;
  wall.castShadow = true;
  group.add(wall);
  addTorus(group, 1.47, 0.042, 0.32, mkBrass(0.08), 80);   // thin rim at top

  // Dark base disc — grout gaps between sectors read as dark lines
  const base = new THREE.Mesh(
    new THREE.CircleGeometry(1.42, 64),
    new THREE.MeshPhysicalMaterial({ color: 0x0e0b07, roughness: 0.92, metalness: 0.0 })
  );
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.008;
  group.add(base);

  // Six real-geometry colour sectors — wider centre gap for the bigger plinth
  const rIn = 0.50, rOut = 1.38, grout = 0.022;
  CATEGORIES.forEach((c, i) => {
    const aC = hubWedgeAngle(i);
    const aS = aC - Math.PI / 6 + grout;
    const aE = aC + Math.PI / 6 - grout;
    const mesh = makeSectorMesh(rIn, rOut, aS, aE, HUB_PIE_TOP_Y,
      mkTile(parseInt(c.color.slice(1), 16), false));
    group.add(mesh);
  });

  // ── Centre monument: 3-tier stepped brass plinth ──────────────────────────
  // Tier 1 — wide base platform
  const tier1 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.46, 0.50, 0.07, 32),
    mkBrass(0.05)
  );
  tier1.position.y = 0.035;
  tier1.castShadow = true;
  group.add(tier1);

  // Tier 2 — mid step
  const tier2 = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.44, 0.06, 32),
    mkBrass(0.07)
  );
  tier2.position.y = 0.10;
  tier2.castShadow = true;
  group.add(tier2);

  // Tier 3 — tapered column
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.20, 0.33, 0.38, 32),
    mkBrass(0.09)
  );
  column.position.y = 0.35;
  column.castShadow = true;
  group.add(column);

  // Thin brass crown collar where column meets jewel
  const crown = new THREE.Mesh(
    new THREE.TorusGeometry(0.24, 0.038, 8, 32),
    mkBrass(0.12)
  );
  crown.rotation.x = Math.PI / 2;
  crown.position.y = 0.55;
  group.add(crown);

  // Outer decorative ring at base of column
  const baseRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.38, 0.030, 8, 48),
    mkBrass(0.06)
  );
  baseRing.rotation.x = Math.PI / 2;
  baseRing.position.y = 0.16;
  group.add(baseRing);

  // Large faceted diamond jewel — OctahedronGeometry gives the gem silhouette
  const jewel = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.30, 0),
    mkGem(0xc9a35b)
  );
  jewel.scale.set(1, 1.40, 1);   // stretch vertically for a diamond shape
  jewel.position.y = 0.68;
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

    // HQ "kingdom" — four brass rampart walls + corner turret pillars + crown gem.
    // Wall heights rise above the tile so the space reads as a walled fortress.
    if (isHQ) {
      const hex  = CAT_HEX[space.category];
      const wPos = BOARD[`ring_${i}`].worldPos;
      const px = wPos.x, pz = wPos.z;

      // Layout constants (relative to world y=0)
      const WALL_H = 0.64;  // rampart top — 0.24 above tile surface (h=0.40)
      const PIL_H  = 0.86;  // pillar top  — 0.22 above ramparts
      const PIL_R  = 0.068; // pillar radius
      const radLen = RING_R_OUT - RING_R_IN;  // 1.50 — span of radial walls

      const wallMat = mkBrass(0.14);
      const pilMat  = mkBrass(0.22);

      // ── Outer curved rampart (arcs from aS to aE at r = RING_R_OUT) ──────
      const outerWall = new THREE.Mesh(
        new THREE.CylinderGeometry(RING_R_OUT + 0.022, RING_R_OUT + 0.022, WALL_H, 8, 1, true, aS, aE - aS),
        wallMat
      );
      outerWall.position.y = WALL_H / 2;
      group.add(outerWall);

      // ── Inner curved rampart ──────────────────────────────────────────────
      const innerWall = new THREE.Mesh(
        new THREE.CylinderGeometry(RING_R_IN - 0.022, RING_R_IN - 0.022, WALL_H, 8, 1, true, aS, aE - aS),
        wallMat
      );
      innerWall.position.y = WALL_H / 2;
      group.add(innerWall);

      // ── Left radial wall (at angle aS, spanning RING_R_IN → RING_R_OUT) ──
      // BoxGeometry long axis = X; rotation.y = -aS aligns local +X → (cos aS, 0, sin aS)
      const radWallGeo = new THREE.BoxGeometry(radLen, WALL_H, 0.040);

      const leftWall = new THREE.Mesh(radWallGeo, wallMat);
      leftWall.position.set(RING_R_MID * Math.cos(aS), WALL_H / 2, RING_R_MID * Math.sin(aS));
      leftWall.rotation.y = -aS;
      group.add(leftWall);

      // ── Right radial wall (at angle aE) ──────────────────────────────────
      const rightWall = new THREE.Mesh(radWallGeo, wallMat);
      rightWall.position.set(RING_R_MID * Math.cos(aE), WALL_H / 2, RING_R_MID * Math.sin(aE));
      rightWall.rotation.y = -aE;
      group.add(rightWall);

      // ── 4 corner turret pillars ───────────────────────────────────────────
      // Positioned at the 4 corners where radial and arc walls meet
      const pilGeo = new THREE.CylinderGeometry(PIL_R, PIL_R * 1.14, PIL_H, 14);
      const capGeo = new THREE.SphereGeometry(PIL_R * 1.20, 10, 8);

      for (const [cr, ca] of [
        [RING_R_OUT, aS], [RING_R_OUT, aE],
        [RING_R_IN,  aS], [RING_R_IN,  aE],
      ]) {
        const cx = cr * Math.cos(ca), cz = cr * Math.sin(ca);

        const pillar = new THREE.Mesh(pilGeo, pilMat);
        pillar.position.set(cx, PIL_H / 2, cz);
        pillar.castShadow = true;
        group.add(pillar);

        // Ball finial on each pillar
        const cap = new THREE.Mesh(capGeo, pilMat);
        cap.position.set(cx, PIL_H + PIL_R * 1.18, cz);
        group.add(cap);
      }

      // ── Crown halo ring at gem equator ────────────────────────────────────
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.34, 0.024, 8, 48),
        mkBrass(0.24)
      );
      halo.rotation.x = Math.PI / 2;
      halo.position.set(px, h + 0.46, pz);  // gem equator = h + gem half-height
      group.add(halo);

      // ── Central gem — tall diamond rising above the ramparts ─────────────
      // OctahedronGeometry(0.30) scale.y=1.55 → half-height 0.465
      // center at h+0.465=0.865, apex at h+0.93=1.33 — towers over pillars
      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.30, 0),
        mkGem(hex, 1.20)
      );
      gem.scale.set(1, 1.55, 1);
      gem.position.set(px, h + 0.465, pz);
      gem.castShadow = true;
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
  hub.position.set(0, 0, 0);
  group.add(hub);
  meshMap.set('hub', hub);
  hub.userData.isHub   = true;
  hub.userData.hubTopY = 0.32;   // top of new brass lip

  scene.add(group);
  return { meshMap, group };
}
