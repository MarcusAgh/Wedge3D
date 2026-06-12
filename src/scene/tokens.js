import * as THREE from 'three';
import { CATEGORIES } from '../data/loadQuestions.js';
import { BOARD, STARTING_SPACE } from '../game/boardGraph.js';

const TOKEN_RADIUS  = 0.28;
const TOKEN_HEIGHT  = 0.22;
const TOKEN_Y       = 0.52;    // resting height above board
const HOVER_Y       = 1.85;    // height while hovering after roll
const FLY_ARC       = 1.2;     // extra altitude at peak of flight arc

const OFFSETS = [
  [0, 0], [0.38, 0.18], [-0.38, 0.18],
  [0, -0.38], [0.32, -0.28], [-0.32, -0.28],
];

const TEAM_RING_COLORS = [0xc9a35b, 0xc94b4b, 0x4b9cc9, 0xc97a4b, 0x9b4bc9, 0x4bc98e];

export class TokenManager {
  _tickers = [];

  constructor(scene) {
    this.scene  = scene;
    this.tokens = [];
  }

  init(numTeams) {
    this.tokens = [];
    for (let i = 0; i < numTeams; i++) {
      const outer = new THREE.Group();
      const pie   = this._buildPie(i, new Set());
      outer.add(pie);

      const sp  = BOARD[STARTING_SPACE].worldPos;
      const off = OFFSETS[i] || [0, 0];
      outer.position.set(sp.x + off[0], TOKEN_Y, sp.z + off[1]);

      this.scene.add(outer);
      this.tokens.push({
        outer, pie, teamIdx: i,
        spaceId: STARTING_SPACE,
        _hovering: false, _hoverPhase: 0,
      });
    }
  }

  updateWedges(teamIdx, wedges) {
    const tok = this.tokens[teamIdx];
    if (!tok) return;
    tok.outer.remove(tok.pie);
    tok.pie.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    tok.pie = this._buildPie(teamIdx, wedges);
    tok.outer.add(tok.pie);
  }

  /** Float the token up and gently bob. Returns a Promise. */
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

  /**
   * Fly the token from its current position to destId along a parabolic arc.
   * Returns a Promise that resolves when the token lands.
   */
  flyTo(teamIdx, destId) {
    const tok  = this.tokens[teamIdx];
    if (!tok) return Promise.resolve();
    tok._hovering = false;
    tok._hoverSeq = (tok._hoverSeq || 0) + 1; // cancel any pending hover activation

    const dest = BOARD[destId]?.worldPos;
    if (!dest) return Promise.resolve();

    const off = OFFSETS[teamIdx] || [0, 0];
    const tx  = dest.x + off[0];
    const tz  = dest.z + off[1];
    const sx  = tok.outer.position.x;
    const sz  = tok.outer.position.z;
    const sy  = tok.outer.position.y;

    const dist    = Math.sqrt((tx - sx) ** 2 + (tz - sz) ** 2);
    const duration = 0.18 + dist * 0.045;

    return new Promise(resolve => {
      let elapsed = 0;
      const tick = dt => {
        elapsed += dt;
        const t    = Math.min(elapsed / duration, 1);
        const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        tok.outer.position.x = sx + (tx - sx) * ease;
        tok.outer.position.z = sz + (tz - sz) * ease;
        tok.outer.position.y = sy + (TOKEN_Y - sy) * ease + Math.sin(t * Math.PI) * FLY_ARC;
        if (t >= 1) {
          tok.outer.position.set(tx, TOKEN_Y, tz);
          tok.spaceId = destId;
          this._remove(tick);
          resolve();
        }
      };
      this._tickers.push(tick);
    });
  }

  update(dt) {
    for (const tick of [...this._tickers]) tick(dt);
    // Bob hovering tokens
    for (const tok of this.tokens) {
      if (tok._hovering) {
        tok._hoverPhase += dt * 2.8;
        tok.outer.position.y = HOVER_Y + Math.sin(tok._hoverPhase) * 0.1;
      }
    }
  }

  /* ---- Private helpers ---- */

  _tweenY(tok, targetY, duration, cb) {
    const startY = tok.outer.position.y;
    let elapsed = 0;
    const tick = dt => {
      elapsed += dt;
      const t = Math.min(elapsed / duration, 1);
      const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      tok.outer.position.y = startY + (targetY - startY) * e;
      if (t >= 1) { tok.outer.position.y = targetY; this._remove(tick); cb?.(); }
    };
    this._tickers.push(tick);
  }

  _remove(fn) { this._tickers = this._tickers.filter(t => t !== fn); }

  _buildPie(teamIdx, wedges) {
    const group = new THREE.Group();
    CATEGORIES.forEach((cat, i) => {
      const a0  = (i / 6) * Math.PI * 2;
      const arc = (Math.PI * 2) / 6;
      const geo = new THREE.CylinderGeometry(TOKEN_RADIUS, TOKEN_RADIUS, TOKEN_HEIGHT, 32, 1, false, a0, arc);
      const has = wedges.has(cat.key);
      const hex = parseInt(cat.color.slice(1), 16);
      const mat = new THREE.MeshStandardMaterial({
        color: hex,
        roughness:        has ? 0.38 : 0.72,
        metalness:        has ? 0.15 : 0.0,
        emissive:         has ? hex  : 0x000000,
        emissiveIntensity:has ? 0.22 : 0,
        opacity:          has ? 1    : 0.22,
        transparent:     !has,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      group.add(mesh);
    });

    // Dark cap ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(TOKEN_RADIUS, 0.025, 8, 32),
      new THREE.MeshStandardMaterial({ color: 0x15110d, roughness: 0.6 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = TOKEN_HEIGHT / 2 + 0.01;
    group.add(ring);

    // Colored team-identity ring at base
    const teamColor = TEAM_RING_COLORS[teamIdx % TEAM_RING_COLORS.length];
    const teamRing = new THREE.Mesh(
      new THREE.TorusGeometry(TOKEN_RADIUS + 0.04, 0.038, 8, 32),
      new THREE.MeshStandardMaterial({
        color: teamColor,
        roughness: 0.35,
        metalness: 0.3,
        emissive: teamColor,
        emissiveIntensity: 0.15,
      })
    );
    teamRing.rotation.x = Math.PI / 2;
    teamRing.position.y = -(TOKEN_HEIGHT / 2) + 0.01;
    group.add(teamRing);

    return group;
  }
}
