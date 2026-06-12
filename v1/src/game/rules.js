import { state, currentTeam, hasAllWedges, advanceTurn } from './state.js';
import { BOARD, findReachableSpaces, findPath, STARTING_SPACE } from './boardGraph.js';

/* ---------------------------------------------------------------
   rules.js — game logic via custom events.
   Movement is click-to-move: after rolling, all reachable squares
   are shown; the player clicks one to land there directly.
   --------------------------------------------------------------- */

function emit(type, detail = {}) {
  window.dispatchEvent(new CustomEvent(`wedge:${type}`, { detail }));
}

export function startGame(teams, pool) {
  state.teams          = teams.map(name => ({ name, wedges: new Set() }));
  state.pool           = pool;
  state.currentTeam    = 0;
  state.tokenPositions = teams.map(() => STARTING_SPACE);
  state.phase          = 'rolling';
  emit('turnStart', { team: currentTeam(), teamIdx: state.currentTeam });
}

export function onRollResult(value) {
  if (state.phase !== 'rolling') return;
  const teamIdx  = state.currentTeam;
  const fromId   = state.tokenPositions[teamIdx];
  const reachable = findReachableSpaces(fromId, value);

  state.phase       = 'choosing';
  state.pendingMoves = value;

  emit('rollResult',     { value, teamIdx, team: currentTeam() });
  emit('showReachable',  { reachable, teamIdx });
}

/**
 * Called when the player clicks a highlighted destination space.
 */
export function onPlayerChoseDest(destId) {
  if (state.phase !== 'choosing') return;
  const teamIdx = state.currentTeam;
  const fromId  = state.tokenPositions[teamIdx];
  const path    = findPath(fromId, destId, state.pendingMoves);

  emit('clearReachable', {});
  emit('tokenMoveDirect', { teamIdx, fromId, toId: destId, path });

  state.tokenPositions[teamIdx] = destId;
  state.phase = 'moving';
}

/** Called by main.js after the token flight animation completes. */
export function onTokenLanded() {
  if (state.phase !== 'moving') return;
  _land(state.tokenPositions[state.currentTeam]);
}

/* ---- Landing logic ---- */
function _land(spaceId) {
  const space = BOARD[spaceId];
  state.activeSpace = space;

  if (space.isRollAgain) {
    emit('rollAgain', { teamIdx: state.currentTeam, reason: 'rollAgainSpace' });
    state.phase = 'rolling';
    return;
  }

  if (space.type === 'hub') {
    const team = currentTeam();
    if (team.wedges.size === 6) {
      state.phase = 'finalQuestion';
      emit('hubFinalQuestion', { teamIdx: state.currentTeam, team });
    } else {
      emit('rollAgain', { teamIdx: state.currentTeam, reason: 'hub' });
      state.phase = 'rolling';
    }
    return;
  }

  const catKey = space.category;
  if (!catKey || catKey === 'rollAgain') {
    emit('rollAgain', { teamIdx: state.currentTeam, reason: 'unknown' });
    state.phase = 'rolling';
    return;
  }

  const qItem = state.pool.draw(catKey);
  state.activeQuestion = { ...qItem, spaceId };
  state.phase = 'question';
  emit('showQuestion', {
    question: state.activeQuestion,
    space,
    teamIdx:  state.currentTeam,
    team:     currentTeam(),
  });
}

/* ---- Answer outcomes ---- */

export function onCorrect() {
  if (state.phase !== 'question') return;
  const team  = currentTeam();
  const space = state.activeSpace;
  let wedgeEarned = false;

  if (space.isHQ && space.hqCategory && !team.wedges.has(space.hqCategory)) {
    team.wedges.add(space.hqCategory);
    wedgeEarned = true;
    emit('wedgeEarned', { teamIdx: state.currentTeam, category: space.hqCategory, team });
    if (hasAllWedges()) emit('allWedgesEarned', { teamIdx: state.currentTeam, team });
  }

  state.phase = 'rolling';
  emit('correctAnswer', { teamIdx: state.currentTeam, team, wedgeEarned });
}

export function onMissed() {
  if (state.phase !== 'question') return;
  advanceTurn();
  state.phase = 'rolling';
  emit('missedAnswer', { teamIdx: state.currentTeam, team: currentTeam() });
  emit('turnStart',    { teamIdx: state.currentTeam, team: currentTeam() });
}

/* ---- Final question ---- */

export function onFinalCategoryChosen(catKey) {
  const qItem = state.pool.draw(catKey);
  state.activeQuestion = { ...qItem, spaceId: 'hub', isFinal: true };
  state.phase = 'question';
  emit('showQuestion', {
    question: state.activeQuestion,
    space:    BOARD['hub'],
    teamIdx:  state.currentTeam,
    team:     currentTeam(),
    isFinal:  true,
  });
}

export function onFinalCorrect() {
  emit('gameWon', { teamIdx: state.currentTeam, team: currentTeam() });
}

export function onFinalMissed() {
  // Eject to nearest spoke and pass turn
  const teamIdx = state.currentTeam;
  state.tokenPositions[teamIdx] = `spoke_0_2`;
  advanceTurn();
  state.phase = 'rolling';
  emit('missedFinal', { teamIdx, team: currentTeam() });
  emit('turnStart',   { teamIdx: state.currentTeam, team: currentTeam() });
}
