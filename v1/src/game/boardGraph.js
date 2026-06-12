import { CATEGORIES } from '../data/loadQuestions.js';

/* ---------------------------------------------------------------
   Arc layout (9 spaces per arc = 1 HQ + 6 category + 2 roll-again)
   Roll-again sits 2 spaces from each HQ: positions 2 and 7.
   Category colors are shuffled differently per arc so the ring
   looks varied but each arc always has all 6 colors.
   --------------------------------------------------------------- */

const RING_SIZE = 54;
const HQ_STEP   = 9;
const SPOKE_LEN = 3;

/*  Each row is a permutation of [0..5] — category index order for that arc.
    All six colors appear once per arc, in a unique arrangement.          */
const ARC_COLOR_ORDERS = [
  [0, 1, 2, 3, 4, 5],
  [2, 4, 0, 5, 1, 3],
  [5, 2, 4, 1, 3, 0],
  [3, 0, 5, 2, 4, 1],
  [1, 3, 0, 4, 2, 5],
  [4, 5, 3, 0, 1, 2],
];

/* Build the 8-entry pattern for non-HQ spaces in an arc.
   null = Roll Again; integer = CATEGORIES index.
   Roll-again at template positions 1 and 6 (2 spaces from each HQ). */
function buildArcPattern(arcIdx) {
  const colors = ARC_COLOR_ORDERS[arcIdx];
  let c = 0;
  return Array.from({ length: 8 }, (_, i) =>
    (i === 1 || i === 6) ? null : colors[c++]
  );
}

function buildBoard() {
  const spaces = {};
  const add = s => { spaces[s.id] = s; };

  // ---- Ring ----
  for (let i = 0; i < RING_SIZE; i++) {
    const arcIdx   = Math.floor(i / HQ_STEP);
    const posInArc = i % HQ_STEP;
    const isHQ     = posInArc === 0;
    const hqCat    = CATEGORIES[arcIdx].key;

    let spaceCat   = hqCat;
    let isRollAgain = false;

    if (!isHQ) {
      const pattern = buildArcPattern(arcIdx)[posInArc - 1];
      if (pattern === null) {
        isRollAgain = true;
        spaceCat    = 'rollAgain';
      } else {
        spaceCat = CATEGORIES[pattern].key;
      }
    }

    add({
      id:          `ring_${i}`,
      type:        isHQ ? 'hq' : (isRollAgain ? 'rollAgain' : 'ordinary'),
      category:    isHQ ? hqCat : spaceCat,
      hqCategory:  isHQ ? hqCat : null,
      isHQ,
      isRollAgain,
      ring: i,
    });
  }

  // ---- Spokes ----
  for (let cat = 0; cat < 6; cat++) {
    for (let step = 0; step < SPOKE_LEN; step++) {
      add({
        id:         `spoke_${cat}_${step}`,
        type:       'spoke',
        category:   CATEGORIES[cat].key,
        isHQ:       false,
        isRollAgain:false,
        cat, step,
      });
    }
  }

  // ---- Hub ----
  add({ id: 'hub', type: 'hub', category: 'hub', isHQ: false, isRollAgain: false });

  // ---- Adjacency ----
  for (let i = 0; i < RING_SIZE; i++) {
    spaces[`ring_${i}`].neighbors = [
      `ring_${(i - 1 + RING_SIZE) % RING_SIZE}`,
      `ring_${(i + 1) % RING_SIZE}`,
    ];
  }
  for (let cat = 0; cat < 6; cat++) {
    const hqId = `ring_${cat * HQ_STEP}`;
    spaces[hqId].neighbors.push(`spoke_${cat}_0`);
    spaces[`spoke_${cat}_0`].neighbors = [hqId, `spoke_${cat}_1`];
  }
  for (let cat = 0; cat < 6; cat++) {
    for (let step = 1; step < SPOKE_LEN - 1; step++) {
      spaces[`spoke_${cat}_${step}`].neighbors = [
        `spoke_${cat}_${step - 1}`,
        `spoke_${cat}_${step + 1}`,
      ];
    }
    const last = SPOKE_LEN - 1;
    spaces[`spoke_${cat}_${last}`].neighbors = [`spoke_${cat}_${last - 1}`, 'hub'];
  }
  spaces['hub'].neighbors = Array.from({ length: 6 }, (_, cat) => `spoke_${cat}_${SPOKE_LEN - 1}`);

  return spaces;
}

export const BOARD      = buildBoard();
export const RING_SIZE_ = RING_SIZE;
export const HQ_STEP_   = HQ_STEP;
export const SPOKE_LEN_ = SPOKE_LEN;
export const STARTING_SPACE = 'hub';

/**
 * All positions reachable in exactly `steps` moves from `startId`
 * without immediate backtracking.  Returns an array of unique space IDs.
 */
export function findReachableSpaces(startId, steps) {
  const results = new Set();

  function dfs(id, fromId, remaining) {
    if (remaining === 0) { results.add(id); return; }
    for (const nextId of (BOARD[id]?.neighbors ?? [])) {
      if (nextId !== fromId) dfs(nextId, id, remaining - 1);
    }
  }

  dfs(startId, null, steps);
  results.delete(startId);
  return [...results];
}

/**
 * Returns the ordered list of space IDs visited when moving `steps` moves
 * from `startId` to `destId` without backtracking (excludes startId, includes destId).
 * Falls back to [destId] if no path is found (shouldn't happen for valid destinations).
 */
export function findPath(startId, destId, steps) {
  function dfs(id, prevId, rem, acc) {
    if (rem === 0) return id === destId ? acc : null;
    for (const next of (BOARD[id]?.neighbors ?? [])) {
      if (next !== prevId) {
        const result = dfs(next, id, rem - 1, [...acc, next]);
        if (result) return result;
      }
    }
    return null;
  }
  return dfs(startId, null, steps, []) ?? [destId];
}
