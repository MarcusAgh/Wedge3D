import { pieSVG } from '../game/state.js';
import { CATEGORIES } from '../data/loadQuestions.js';

export function initHUD({ onRoll }) {
  const hudEl       = document.getElementById('overlay-hud');
  const pieEl       = document.getElementById('hudPie');
  const nameEl      = document.getElementById('hudTeamName');
  const countEl     = document.getElementById('hudWedgeCount');
  const scoreEl     = document.getElementById('hudScoreboard');
  const rollBtn     = document.getElementById('rollBtn');

  rollBtn.onclick = () => {
    if (!rollBtn.disabled) onRoll();
  };

  return {
    show() {
      hudEl.style.display = 'flex';
    },
    hide() {
      hudEl.style.display = 'none';
    },
    updateActiveTeam(team) {
      nameEl.textContent = team.name;
      countEl.textContent = `${team.wedges.size} / 6 wedges`;
      pieEl.innerHTML = pieSVG(team.wedges, 52);
    },
    updateScoreboard(teams, currentIdx) {
      scoreEl.innerHTML = `<div class="hud-scoreboard-title">Standings</div>` +
        teams.map((t, i) => `
          <div class="hud-team-row${i === currentIdx ? ' hud-team-row--active' : ''}">
            <div class="hud-team-row-pie">${pieSVG(t.wedges, 28)}</div>
            <div class="hud-team-row-name">${escapeHTML(t.name)}</div>
            <div class="hud-team-row-count">${t.wedges.size}/6</div>
          </div>`
        ).join('');
    },
    setRollEnabled(enabled) {
      rollBtn.disabled = !enabled;
    },
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
