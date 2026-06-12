import { pieSVG, state } from '../game/state.js';
import { CATEGORIES } from '../data/loadQuestions.js';
import { BOARD } from '../game/boardGraph.js';

export function initHUD({ onRoll }) {
  const hudEl   = document.getElementById('overlay-hud');
  const pieEl   = document.getElementById('hudPie');
  const nameEl  = document.getElementById('hudTeamName');
  const countEl = document.getElementById('hudWedgeCount');
  const scoreEl = document.getElementById('hudScoreboard');
  const rollBtn = document.getElementById('rollBtn');

  rollBtn.onclick = () => { if (!rollBtn.disabled) onRoll(); };

  function _spaceLabel(spaceId) {
    if (!spaceId) return '';
    const sp = BOARD[spaceId];
    if (!sp) return '';
    if (sp.type === 'hub') return 'Hub';
    if (sp.type === 'hq')  return `${_catName(sp.category)} HQ`;
    if (sp.isRollAgain)    return 'Roll Again';
    if (sp.type === 'spoke') return `${_catName(sp.category)} spoke`;
    return _catName(sp.category);
  }

  function _catName(key) {
    return CATEGORIES.find(c => c.key === key)?.name ?? key;
  }

  function _catColor(key) {
    return CATEGORIES.find(c => c.key === key)?.color ?? null;
  }

  return {
    show()  { hudEl.style.display = 'flex'; },
    hide()  { hudEl.style.display = 'none'; },

    updateActiveTeam(team) {
      nameEl.textContent  = team.name;
      countEl.textContent = `${team.wedges.size} / 6 wedges`;
      pieEl.innerHTML     = pieSVG(team.wedges, 52);
    },

    updateScoreboard(teams, currentIdx) {
      scoreEl.innerHTML = `<div class="hud-scoreboard-title">Standings</div>` +
        teams.map((t, i) => {
          const active   = i === currentIdx;
          const spaceId  = state.tokenPositions?.[i];
          const label    = _spaceLabel(spaceId);
          const catColor = spaceId ? _catColor(BOARD[spaceId]?.category) : null;
          const colorBar = t.color
            ? `style="border-left:3px solid ${t.color}; padding-left:6px;"`
            : '';
          return `
            <div class="hud-team-row${active ? ' hud-team-row--active' : ''}" ${active ? colorBar : ''}>
              <div class="hud-team-row-pie">${pieSVG(t.wedges, 28)}</div>
              <div class="hud-team-row-info">
                <div class="hud-team-row-name">${escapeHTML(t.name)}</div>
                ${active && label ? `<div class="hud-team-row-space" style="${catColor ? 'color:' + catColor : ''}">${escapeHTML(label)}</div>` : ''}
              </div>
              <div class="hud-team-row-count">${t.wedges.size}/6</div>
            </div>`;
        }).join('');
    },

    setRollEnabled(enabled) { rollBtn.disabled = !enabled; },

    setRollHint(visible) {
      document.getElementById('hudRollHint').style.display = visible ? 'block' : 'none';
    },
  };
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
