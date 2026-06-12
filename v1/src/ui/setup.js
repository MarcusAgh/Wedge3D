import { pieSVG } from '../game/state.js';

export function initSetup({ onStart }) {
  let numTeams = 3;
  const names = [];
  let selectedEdition = 'Easy';

  const teamCountEl = document.getElementById('teamCount');
  const nameList    = document.getElementById('nameList');
  const startBtn    = document.getElementById('startBtn');
  const loadStatus  = document.getElementById('loadStatus');

  // Edition picker
  document.getElementById('editionGrid').addEventListener('click', e => {
    const btn = e.target.closest('.edition-btn');
    if (!btn) return;
    document.querySelectorAll('.edition-btn').forEach(b => b.classList.remove('edition-btn--active'));
    btn.classList.add('edition-btn--active');
    selectedEdition = btn.dataset.edition;
  });

  // Team stepper
  document.getElementById('teamMinus').onclick = () => {
    if (numTeams > 2) { numTeams--; teamCountEl.textContent = numTeams; renderNames(); }
  };
  document.getElementById('teamPlus').onclick = () => {
    if (numTeams < 6) { numTeams++; teamCountEl.textContent = numTeams; renderNames(); }
  };

  function renderNames() {
    nameList.innerHTML = '';
    for (let i = 0; i < numTeams; i++) {
      const row = document.createElement('div');
      row.className = 'name-row';
      row.innerHTML = `<div class="team-seat">${i + 1}</div>`;
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.placeholder = `Team ${i + 1}`;
      inp.value = names[i] || '';
      inp.addEventListener('input', e => { names[i] = e.target.value; });
      row.appendChild(inp);
      nameList.appendChild(row);
    }
  }
  renderNames();

  startBtn.onclick = () => {
    const teamNames = [];
    for (let i = 0; i < numTeams; i++) {
      teamNames.push((names[i] || `Team ${i + 1}`).trim() || `Team ${i + 1}`);
    }
    onStart({ teamNames, edition: selectedEdition });
  };

  return {
    setLoadStatus(msg, ok = false) {
      loadStatus.textContent = msg;
      loadStatus.style.color = ok ? 'var(--sci)' : 'var(--muted-2)';
      startBtn.disabled = !ok;
    },
    hide() {
      document.getElementById('overlay-setup').style.display = 'none';
    },
  };
}
