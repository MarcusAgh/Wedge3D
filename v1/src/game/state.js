import { CATEGORIES } from '../data/loadQuestions.js';

/* Single source of truth for the running game. */
export const state = {
  // Set by setup
  teams: [],         // [{ name, wedges: Set<key> }]
  currentTeam: 0,    // index into teams[]
  pool: null,        // pool manager from createPoolManager()

  // Board movement
  tokenPositions: [], // one space-id per team
  pendingMoves: 0,    // spaces left to move this roll
  atJunction: false,

  // Question phase
  activeQuestion: null, // { category, question, answer }
  activeSpace: null,    // space object from board graph

  // Phases: 'setup' | 'rolling' | 'moving' | 'junction' | 'question' | 'win'
  phase: 'setup',
};

export function currentTeam() {
  return state.teams[state.currentTeam];
}

export function awardWedge(key) {
  currentTeam().wedges.add(key);
}

export function hasAllWedges() {
  return currentTeam().wedges.size === 6;
}

export function advanceTurn() {
  state.currentTeam = (state.currentTeam + 1) % state.teams.length;
}

/** SVG pie — same logic as the 2D prototype */
export function pieSVG(wedges, size = 100) {
  const r = size / 2 - 3;
  const cx = size / 2;
  const cy = size / 2;

  function polar(deg) {
    const rad = (deg - 90) * Math.PI / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  }
  function wedgePath(a0, a1) {
    const [x0, y0] = polar(a0);
    const [x1, y1] = polar(a1);
    const large = (a1 - a0) > 180 ? 1 : 0;
    return `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
  }

  let paths = '';
  CATEGORIES.forEach((c, i) => {
    const a0 = i * 60;
    const a1 = (i + 1) * 60;
    const has = wedges.has(c.key);
    const fill = has ? c.color : 'transparent';
    const opacity = has ? 1 : 0.3;
    paths += `<path d="${wedgePath(a0, a1)}" fill="${fill}" stroke="var(--line)" stroke-width="1.5" opacity="${opacity}"/>`;
  });

  return `<svg viewBox="0 0 ${size} ${size}" width="100%" height="100%" aria-hidden="true">
    ${paths}
    <circle cx="${cx}" cy="${cy}" r="7" fill="var(--bg)" stroke="var(--line)" stroke-width="1.5"/>
  </svg>`;
}
