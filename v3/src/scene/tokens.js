import * as THREE from 'three';
import { CATEGORIES } from '../data/loadQuestions.js';
import { BOARD, STARTING_SPACE } from '../game/boardGraph.js';

const TOKEN_RADIUS = 0.28;
const TOKEN_HEIGHT = 0.22;
const TOKEN_Y      = 0.52;
const HOVER_Y      = 1.90;
const HOP_ARC      = 0.52;
const FLY_ARC      = 1.50;
const HOP_PAUSE    = 55;

const TEAM_COLORS = [0xc9a35b, 0xc94b4b, 0x4b9cc9, 0xc97a4b, 0x9b4bc9, 0x4bc98e];

// Spread tokens far enough apart that they don't overlap and fill the hub nicely
function fanOffsets(count) {
  if (count <= 1) return [[0, 0]];
  if (count === 2) return [[-0.90, 0], [0.90, 0]];
  const r = [0, 0, 0, 1.10, 1.22, 1.32, 1.40][count] ?? 1.40;
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
}

export class TokenManager {
  _tickers = [];

  constructor(scene) {
    this.scene       = scene;
    this.tokens      = [];
    this._teamColors = [...TEAM_COLORS]; // overridden by init
  }

  init(numTeams, teamColorHexStrings) {
    this.tokens = [];
    // Accept optional hex strings like '#c9a35b'; fall back to defaults
    if (teamColorHexStrings) {
      this._teamColors = teamColorHexStrings.map((c, i) =>
        c ? parseInt(c.replace('#', ''), 16) : TEAM_COLORS[i % TEAM_COLORS.length]
      );
    }
    for (let i = 0; i < numTeams; i++) {
      const startId = STARTING_SPACE;
      const sp      = BOARD[startId]?.worldPos ?? { x: 0, z: 0 };
      const outer   = new THREE.Group();
      outer.add(this._buildPie(i, new Set()));
      outer.position.set(sp.x, TOKEN_Y, sp.z);
      this.scene.add(outer);
      this.tokens.push({
        outer,
        pie:         outer.children[0],
        teamIdx:     i,
        spaceId:     startId,
        _hovering:   false,
        _hoverPhase: 0,
        _flying:     false,
        _scaleY:     1, _scaleXZ:    1,
        _scaleYVel:  0, _scaleXZVel: 0,
      });
    }
    // Fan out tokens that share their starting space (unlikely but safe)
    const startIds = new Set(this.tokens.map(t => t.spaceId));
    startIds.forEach(id => this._updateFans(id));
  }

  updateWedges(teamIdx, wedges) {
    const tok = this.tokens[teamIdx];
    if (!tok) return;
    tok.outer.remove(tok.pie);
    tok.pie.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    tok.pie = this._buildPie(teamIdx, wedges);
    tok.outer.add(tok.pie);
  }

  hover(teamIdx) {
    const tok = this.tokens[teamIdx];
    if (!tok) return Promise.resolve();
    tok._hoverSeq = (tok._hoverSeq || 0) + 1;
    const seq = tok._hoverSeq;
    return new Promise(resolve => {
      this._tweenY(tok, HOVER_Y, 0.35, () => {
        if (tok._hoverSeq === seq) { tok._hovering = true; tok._hoverPhase = 0; }
        resolve();
      });
    });
  }

  async hopAlong(teamIdx, path, onHop) {
    for (const spaceId of path) {
      onHop?.();
      await this.flyTo(teamIdx, spaceId, HOP_ARC);
      if (path.length > 1) await new Promise(r => setTimeout(r, HOP_PAUSE));
    }
  }

  flyTo(teamIdx, destId, arcH = FLY_ARC) {
    const tok = this.tokens[teamIdx];
    if (!tok) return Promise.resolve();
    tok._hovering = false;
    tok._hoverSeq = (tok._hoverSeq || 0) + 1;
    tok._flying   = true;

    const dest = BOARD[destId]?.worldPos;
    if (!dest) return Promise.resolve();

    const departId = tok.spaceId;
    const sx = tok.outer.position.x, sz = tok.outer.position.z, sy = tok.outer.position.y;
    const tx = dest.x, tz = dest.z;
    const dist     = Math.sqrt((tx - sx) ** 2 + (tz - sz) ** 2);
    const duration = 0.18 + dist * 0.055;

    tok._scaleY = 0.65; tok._scaleXZ = 1.32;
    tok._scaleYVel = 0; tok._scaleXZVel = 0;

    return new Promise(resolve => {
      let elapsed = 0;
      const tick = dt => {
        elapsed += dt;
        const t    = Math.min(elapsed / duration, 1);
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        tok.outer.position.x = sx + (tx - sx) * ease;
        tok.outer.position.z = sz + (tz - sz) * ease;
        tok.outer.position.y = sy + (TOKEN_Y - sy) * ease + Math.sin(t * Math.PI) * arcH;

        if (t > 0.82) {
          const lt = (t - 0.82) / 0.18;
          tok._scaleY  = 1 + 0.28 * Math.sin(lt * Math.PI);
          tok._scaleXZ = 1 - 0.13 * Math.sin(lt * Math.PI);
        }

        if (t >= 1) {
          tok.outer.position.set(tx, TOKEN_Y, tz);
          tok.spaceId = destId;
          tok._flying = false;
          tok._scaleY = 0.74; tok._scaleXZ = 1.20;
          tok._scaleYVel = 0; tok._scaleXZVel = 0;
          this._remove(tick);
          this._updateFans(destId);
          if (departId !== destId) this._updateFans(departId);
          resolve();
        }
      };
      this._tickers.push(tick);
    });
  }

  wedgeFlourishAt(teamIdx, catHex) {
    const tok = this.tokens[teamIdx];
    if (!tok) return;
    const origin = tok.outer.position.clone();
    origin.y += TOKEN_HEIGHT / 2 + 0.15;

    for (let ri = 0; ri < 3; ri++) {
      const delay = ri * 0.13;
      const mat   = new THREE.MeshBasicMaterial({
        color: catHex, side: THREE.DoubleSide,
        transparent: true, opacity: 1, depthWrite: false,
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.01, 0.05, 6, 36), mat);
      ring.rotation.x = Math.PI / 2;
      ring.position.copy(origin);
      this.scene.add(ring);

      let t = 0;
      const tick = dt => {
        t += dt;
        if (t < delay) return;
        const p = Math.min((t - delay) / 0.68, 1);
        ring.scale.setScalar(0.3 + p * 2.2);
        mat.opacity = (1 - p) * 0.90;
        if (p >= 1) {
          this.scene.remove(ring);
          ring.geometry.dispose();
          mat.dispose();
          this._remove(tick);
        }
      };
      this._tickers.push(tick);
    }
  }

  update(dt) {
    for (const tick of [...this._tickers]) tick(dt);
    for (const tok of this.tokens) {
      if (tok._hovering) {
        tok._hoverPhase += dt * 2.8;
        tok.outer.position.y = HOVER_Y + Math.sin(tok._hoverPhase) * 0.10;
      }
      const k = 28, d = 7.8;
      tok._scaleYVel   += (-k * (tok._scaleY  - 1) - d * tok._scaleYVel)  * dt;
      tok._scaleXZVel  += (-k * (tok._scaleXZ - 1) - d * tok._scaleXZVel) * dt;
      tok._scaleY      += tok._scaleYVel  * dt;
      tok._scaleXZ     += tok._scaleXZVel * dt;
      tok.outer.scale.set(tok._scaleXZ, tok._scaleY, tok._scaleXZ);
    }
  }

  /* ---- Private ---- */

  _updateFans(spaceId) {
    const group = this.tokens
      .filter(t => t.spaceId === spaceId && !t._flying)
      .sort((a, b) => a.teamIdx - b.teamIdx);
    const dest = BOARD[spaceId]?.worldPos;
    if (!dest) return;
    const offs = fanOffsets(group.length);
    group.forEach((tok, i) => {
      this._tweenXZ(tok, dest.x + offs[i][0], dest.z + offs[i][1], 0.26);
    });
  }

  _tweenXZ(tok, tx, tz, dur) {
    const sx = tok.outer.position.x, sz = tok.outer.position.z;
    let elapsed = 0;
    const tick = dt => {
      elapsed += dt;
      const t = Math.min(elapsed / dur, 1);
      const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      tok.outer.position.x = sx + (tx - sx) * e;
      tok.outer.position.z = sz + (tz - sz) * e;
      if (t >= 1) this._remove(tick);
    };
    this._tickers.push(tick);
  }

  _tweenY(tok, targetY, dur, cb) {
    const startY = tok.outer.position.y;
    let elapsed = 0;
    const tick = dt => {
      elapsed += dt;
      const t = Math.min(elapsed / dur, 1);
      const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      tok.outer.position.y = startY + (targetY - startY) * e;
      if (t >= 1) { tok.outer.position.y = targetY; this._remove(tick); cb?.(); }
    };
    this._tickers.push(tick);
  }

  _remove(fn) { this._tickers = this._tickers.filter(t => t !== fn); }

  _buildPie(teamIdx, wedges) {
    const group = new THREE.Group();
    const tc = this._teamColors[teamIdx] ?? TEAM_COLORS[teamIdx % TEAM_COLORS.length];

    // Six category pie segments
    CATEGORIES.forEach((cat, i) => {
      const a0  = (i / 6) * Math.PI * 2;
      const arc = (Math.PI * 2) / 6;
      const has = wedges.has(cat.key);
      const hex = parseInt(cat.color.slice(1), 16);
      const mat = new THREE.MeshPhysicalMaterial({
        color:              hex,
        roughness:          has ? 0.26 : 0.70,
        metalness:          0.04,
        clearcoat:          has ? 0.65 : 0.12,
        clearcoatRoughness: has ? 0.16 : 0.42,
        emissive:           has ? hex  : 0x000000,
        emissiveIntensity:  has ? 0.30 : 0,
        opacity:            has ? 1.0  : 0.22,
        transparent:       !has,
        envMapIntensity:    has ? 1.05 : 0.38,
      });
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(TOKEN_RADIUS, TOKEN_RADIUS, TOKEN_HEIGHT, 32, 1, false, a0, arc),
        mat
      );
      mesh.castShadow = true;
      group.add(mesh);
    });

    // Team-color outer band — solid cylinder slightly larger radius,
    // open-ended so only the side wall shows, covering the outer arc of each slice
    const bandMat = new THREE.MeshPhysicalMaterial({
      color:              tc,
      roughness:          0.18,
      metalness:          0.60,
      clearcoat:          0.88,
      clearcoatRoughness: 0.08,
      emissive:           tc,
      emissiveIntensity:  0.22,
      envMapIntensity:    1.40,
    });
    const band = new THREE.Mesh(
      // openEnded = true so only the cylindrical wall renders (no top/bottom disc)
      new THREE.CylinderGeometry(TOKEN_RADIUS + 0.01, TOKEN_RADIUS + 0.01, TOKEN_HEIGHT + 0.006, 64, 1, true),
      bandMat
    );
    band.castShadow = true;
    group.add(band);

    // Dark top ring
    const topRing = new THREE.Mesh(
      new THREE.TorusGeometry(TOKEN_RADIUS + 0.005, 0.022, 8, 64),
      new THREE.MeshPhysicalMaterial({ color: 0x15110d, roughness: 0.60, metalness: 0.05, clearcoat: 0.3 })
    );
    topRing.rotation.x = Math.PI / 2;
    topRing.position.y = TOKEN_HEIGHT / 2 + 0.006;
    group.add(topRing);

    // Team-color base ring (wider, glowing)
    const baseRing = new THREE.Mesh(
      new THREE.TorusGeometry(TOKEN_RADIUS + 0.045, 0.040, 8, 64),
      new THREE.MeshPhysicalMaterial({
        color:              tc,
        roughness:          0.18,
        metalness:          0.60,
        clearcoat:          0.88,
        clearcoatRoughness: 0.08,
        emissive:           tc,
        emissiveIntensity:  0.25,
        envMapIntensity:    1.40,
      })
    );
    baseRing.rotation.x = Math.PI / 2;
    baseRing.position.y = -(TOKEN_HEIGHT / 2) + 0.008;
    group.add(baseRing);

    return group;
  }
}
