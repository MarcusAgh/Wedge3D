import { CATEGORIES } from '../data/loadQuestions.js';

/* ---------------------------------------------------------------
   Board graph — configurable via initBoard(mode).
   Modes:
     short  → HQ_STEP=4, 24 ring spaces  (HQ – t – RA – t)
     medium → HQ_STEP=6, 36 ring spaces  (HQ – t – t – RA – t – t)
     long   → HQ_STEP=9, 54 ring spaces  (HQ – t – RA – t×4 – RA – t)
   --------------------------------------------------------------- */

export const BOARD         = {};   // mutated in-place by initBoard()
export let   RING_SIZE_    = 36;
export let   HQ_STEP_      = 6;
export let   SPOKE_LEN_    = 3;
export const STARTING_SPACE = 'hub';

/* ---- Arc colour selection -----------------------------------------------
   Each arc sits between HQ[arcIdx] and HQ[(arcIdx+1)%6].
   Medium/short: the regular tiles use the 4 categories that are NOT either
   of those two HQ colours, rotated per arc to create visual variety.
   Long: all 6 categories appear once (there are 6 regular slots). */
function arcColors(arcIdx, numSlots) {
  if (numSlots === 6) {
    // All 6 cats in an interleaved order, rotated per arc
    const base = [0, 2, 4, 1, 3, 5];
    return base.map((_, i) => base[(i + arcIdx) % 6]);
  }
  const thisHQ = arcIdx;
  const nextHQ = (arcIdx + 1) % 6;
  const others = [0, 1, 2, 3, 4, 5].filter(c => c !== thisHQ && c !== nextHQ);
  // Rotate the "others" array by arcIdx to spread colours across arcs
  const rot = arcIdx % 4;
  const rotated = [...others.slice(rot), ...others.slice(0, rot)];
  if (numSlots === 4) return rotated;
  // Short (2 slots): spread — take index 0 and 2 of the rotated list
  return [rotated[0], rotated[2]];
}

/* Returns (hqStep-1)-length array for posInArc 1..hqStep-1.
   null = roll-again tile, number = CATEGORIES index. */
function buildArcPattern(arcIdx, hqStep) {
  let raIndices, numRegular;
  if (hqStep === 4) {
    raIndices  = [1];    // posInArc 2
    numRegular = 2;
  } else if (hqStep === 6) {
    raIndices  = [2];    // posInArc 3 (centre)
    numRegular = 4;
  } else {               // hqStep === 9
    raIndices  = [1, 6]; // posInArc 2 and 7
    numRegular = 6;
  }
  const colors = arcColors(arcIdx, numRegular);
  let ci = 0;
  return Array.from({ length: hqStep - 1 }, (_, i) =>
    raIndices.includes(i) ? null : colors[ci++]
  );
}

function _buildInto(board, ringSize, hqStep, spokeLen) {
  const add = s => { board[s.id] = s; };

  // ---- Ring ----
  for (let i = 0; i < ringSize; i++) {
    const arcIdx   = Math.floor(i / hqStep);
    const posInArc = i % hqStep;
    const isHQ     = posInArc === 0;
    const hqCat    = CATEGORIES[arcIdx].key;

    let spaceCat = hqCat, isRollAgain = false;
    if (!isHQ) {
      const val = buildArcPattern(arcIdx, hqStep)[posInArc - 1];
      if (val === null) { isRollAgain = true; spaceCat = 'rollAgain'; }
      else spaceCat = CATEGORIES[val].key;
    }

    add({
      id:          `ring_${i}`,
      type:        isHQ ? 'hq' : (isRollAgain ? 'rollAgain' : 'ordinary'),
      category:    isHQ ? hqCat : spaceCat,
      hqCategory:  isHQ ? hqCat : null,
      isHQ, isRollAgain, ring: i,
    });
  }

  // ---- Spokes ----
  for (let cat = 0; cat < 6; cat++) {
    for (let step = 0; step < spokeLen; step++) {
      add({
        id:          `spoke_${cat}_${step}`,
        type:        'spoke',
        category:    CATEGORIES[cat].key,
        isHQ:        false,
        isRollAgain: false,
        cat, step,
      });
    }
  }

  // ---- Hub ----
  add({ id: 'hub', type: 'hub', category: 'hub', isHQ: false, isRollAgain: false });

  // ---- Adjacency ----
  for (let i = 0; i < ringSize; i++) {
    board[`ring_${i}`].neighbors = [
      `ring_${(i - 1 + ringSize) % ringSize}`,
      `ring_${(i + 1) % ringSize}`,
    ];
  }
  for (let cat = 0; cat < 6; cat++) {
    const hqId = `ring_${cat * hqStep}`;
    board[hqId].neighbors.push(`spoke_${cat}_0`);
    board[`spoke_${cat}_0`].neighbors = [hqId, `spoke_${cat}_1`];
  }
  for (let cat = 0; cat < 6; cat++) {
    for (let step = 1; step < spokeLen - 1; step++) {
      board[`spoke_${cat}_${step}`].neighbors = [
        `spoke_${cat}_${step - 1}`,
        `spoke_${cat}_${step + 1}`,
      ];
    }
    const last = spokeLen - 1;
    board[`spoke_${cat}_${last}`].neighbors = [`spoke_${cat}_${last - 1}`, 'hub'];
  }
  board['hub'].neighbors = Array.from({ length: 6 }, (_, cat) =>
    `spoke_${cat}_${spokeLen - 1}`
  );
}

export function initBoard(mode = 'medium') {
  // Clear current board in-place so all importers see the new state
  Object.keys(BOARD).forEach(k => delete BOARD[k]);

  switch (mode) {
    case 'short': RING_SIZE_ = 24; HQ_STEP_ = 4; break;
    case 'long':  RING_SIZE_ = 54; HQ_STEP_ = 9; break;
    default:      RING_SIZE_ = 36; HQ_STEP_ = 6; break;
  }
  SPOKE_LEN_ = 3;

  _buildInto(BOARD, RING_SIZE_, HQ_STEP_, SPOKE_LEN_);
}

// Build medium board at import time so early code (HUD label lookups etc.) has data
initBoard('medium');

// Keep for any legacy callers — tokens and rules now use STARTING_SPACE instead
export function startingSpaceForTeam(teamIdx) {
  return `ring_${(teamIdx % 6) * HQ_STEP_}`;
}

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
